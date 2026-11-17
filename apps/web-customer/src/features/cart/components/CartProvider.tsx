"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { isApiError, userMessage } from "@femxo/shared/api";
import type { CartApi } from "@femxo/shared/api";
import type { Cart } from "@femxo/shared/contracts";
import { useToast } from "@femxo/ui";
import { useSession } from "@/features/auth/components/SessionProvider";
import { getCartApi } from "@/lib/api";
import { applyOp, previewOp } from "../cart-ops";
import type { CartOp } from "../cart-ops";

/** signed-out: the cart belongs to a customer, so a guest has none · error: couldn't load it. */
export type CartStatus = "loading" | "ready" | "error" | "signed-out";

/** What a change came to: done, or refused with the message the shopper was shown. */
export type CartResult = { ok: true } | { ok: false; message: string };

interface CartValue {
  cart: Cart | null;
  status: CartStatus;
  /** A one-off message about the cart as a whole: it changed elsewhere, or it ran out. */
  notice: string | null;
  dismissNotice(): void;
  add(variantId: string, quantity?: number): Promise<CartResult>;
  setQuantity(variantId: string, quantity: number): Promise<CartResult>;
  remove(variantId: string): Promise<CartResult>;
  /** The shopper has seen the new prices: write the cart back so checkout accepts it. */
  confirmPrices(): Promise<CartResult>;
  /** Cut every line to what is in stock and drop what can't be sold. */
  fitToStock(): Promise<CartResult>;
  refresh(): Promise<void>;
}

export const CartContext = createContext<CartValue | null>(null);

const CHANGED = "Your cart was changed on another device, so we've refreshed it. Please check it.";
const SIGN_IN = "Sign in to add items to your cart.";

/**
 * The customer's cart, shared by the header badge, product pages, the cart page and checkout. The cart lives on the server
 * (GET/PUT /cart with a revision): a change is described as an intent, applied to the newest cart we know, and written with
 * that revision. If another device got there first (409 CART_CHANGED) the cart is read again and the intent re-applied once.
 * Changes show at once where they can and are confirmed by the server's answer; a refusal puts the cart back and says why.
 * Changes go to the server one at a time, in the order they were made. A guest has no cart: adding sends them to sign in.
 */
export function CartProvider({ api, children }: { api?: CartApi; children: ReactNode }) {
  const toast = useToast();
  const router = useRouter();
  const { status: sessionStatus, user } = useSession();
  /** The session's status as of now, for code that waits for it to settle. */
  const sessionRef = useRef(sessionStatus);
  useEffect(() => {
    sessionRef.current = sessionStatus;
  });
  const apiRef = useRef(api);
  const client = useCallback(() => (apiRef.current ??= getCartApi()), []);

  const [cart, setCart] = useState<Cart | null>(null);
  const [status, setStatus] = useState<CartStatus>("loading");
  const [notice, setNotice] = useState<string | null>(null);

  /** The last cart the server confirmed: the base every change is computed from, and what a refused change goes back to. */
  const confirmed = useRef<Cart | null>(null);
  const pending = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const generation = useRef(0);

  const settle = useCallback((next: Cart | null) => {
    confirmed.current = next;
    setCart(next);
  }, []);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    try {
      const next = await client().get();
      if (mine !== generation.current) return;
      settle(next);
      setStatus("ready");
    } catch {
      if (mine === generation.current) setStatus("error");
    }
  }, [client, settle]);

  // Whose cart this is follows who is signed in.
  const userId = user?.id ?? null;
  const syncedFor = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (sessionStatus === "checking") return;
    const who = sessionStatus === "signed-in" ? userId : null;
    if (syncedFor.current === who) return;
    syncedFor.current = who;
    generation.current += 1;
    if (who === null) {
      // Nothing to load: the cart simply isn't there for a guest (or until the session can be told).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      settle(null);
      setStatus(sessionStatus === "unavailable" || sessionStatus === "coming-soon" ? "error" : "signed-out");
    } else {
      setStatus("loading");
      void load();
    }
  }, [sessionStatus, userId, load, settle]);

  // Joining Prime (or it lapsing) mid-visit changes every price in the cart: read it again.
  const tier = useRef<string | undefined>(undefined);
  const primeStatus = sessionStatus === "signed-in" ? user?.prime.status : undefined;
  useEffect(() => {
    const before = tier.current;
    tier.current = primeStatus;
    if (before !== undefined && primeStatus !== undefined && before !== primeStatus) void load();
  }, [primeStatus, load]);

  /** Runs `op` after the changes already on their way; shows its preview now. */
  const change = useCallback(
    async (op: CartOp): Promise<CartResult> => {
      // A tap on ADD can come before the sign-in check has answered: wait for it (briefly) rather than sending a signed-in customer to sign in.
      for (let waited = 0; sessionRef.current === "checking" && waited < 50; waited++) await new Promise((resolve) => setTimeout(resolve, 100));
      if (sessionRef.current !== "signed-in") {
        toast(SIGN_IN);
        router.push(`/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);
        return { ok: false, message: SIGN_IN };
      }
      const preview = confirmed.current ? previewOp(confirmed.current, op) : null;
      pending.current += 1;
      // The preview is of the newest change we know of; the last answer settles it.
      if (preview) setCart(preview);

      const run = chain.current
        .catch(() => undefined)
        .then(async (): Promise<Cart> => {
          let base = confirmed.current ?? (await client().get());
          for (let attempt = 0; ; attempt++) {
            try {
              return await client().replace(applyOp(base, op), base.rev);
            } catch (error) {
              if (!isApiError(error, "CART_CHANGED") || attempt >= 1) throw error;
              // Someone (another tab, another phone) changed the cart: take theirs and apply this change on top.
              base = await client().get();
              setNotice(CHANGED);
            }
          }
        });
      chain.current = run;
      try {
        const next = await run;
        confirmed.current = next;
        if (pending.current === 1) setCart(next);
        return { ok: true };
      } catch (error) {
        const message = userMessage(error);
        toast(message, { tone: "error" });
        if (isApiError(error, "CART_CHANGED")) setNotice(CHANGED);
        // The server knows the truth: stock, prices, what is still on sale.
        if (isApiError(error) && error.status >= 400 && error.status < 500) void load();
        else setCart(confirmed.current);
        return { ok: false, message };
      } finally {
        pending.current -= 1;
      }
    },
    [client, load, router, toast]
  );

  const value = useMemo<CartValue>(
    () => ({
      cart,
      status,
      notice,
      dismissNotice: () => setNotice(null),
      add: (variantId, quantity = 1) => change({ type: "add", variantId, quantity }),
      setQuantity: (variantId, quantity) => change({ type: "set", variantId, quantity }),
      remove: (variantId) => change({ type: "remove", variantId }),
      confirmPrices: () => change({ type: "confirm" }),
      fitToStock: () => change({ type: "fit" }),
      refresh: () => load(),
    }),
    [cart, status, notice, change, load]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside <CartProvider>.");
  return value;
}
