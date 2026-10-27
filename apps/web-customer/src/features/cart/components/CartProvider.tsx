"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { isApiError } from "@femxo/shared/api";
import type { CartApi } from "@femxo/shared/api";
import type { Cart, CouponRefusal } from "@femxo/shared/contracts";
import { useToast } from "@femxo/ui";
import { useSession } from "@/features/auth/components/SessionProvider";
import { getCartApi } from "@/lib/api";

export type CartStatus = "loading" | "ready" | "error";

/** What a change came to: done, or refused with the message the shopper was shown. */
export type CartResult = { ok: true } | { ok: false; message: string; reason?: CouponRefusal; minCart?: number };

interface CartValue {
  cart: Cart | null;
  status: CartStatus;
  /** A one-off message about the cart as a whole: it expired, or the guest cart was merged. */
  notice: string | null;
  dismissNotice(): void;
  add(variantId: string, quantity?: number): Promise<CartResult>;
  setQuantity(lineId: string, quantity: number): Promise<CartResult>;
  remove(lineId: string): Promise<CartResult>;
  applyCoupon(code: string): Promise<CartResult>;
  removeCoupon(): Promise<CartResult>;
  refresh(): Promise<void>;
}

export const CartContext = createContext<CartValue | null>(null);

const EXPIRED = "Your cart expired, so we've started a fresh one.";
const MERGED = "We added the items you picked earlier to your cart.";
const GENERIC = "Something went wrong. Please try again.";

/** The cart as it will look once a quantity change lands (the bill is refreshed by the server's answer). */
function withQuantity(cart: Cart, lineId: string, quantity: number): Cart {
  const lines = cart.lines.map((line) => (line.id === lineId ? { ...line, quantity, lineTotal: line.unitPrice * quantity } : line));
  return { ...cart, lines, itemCount: lines.reduce((sum, line) => sum + line.quantity, 0) };
}

function withoutLine(cart: Cart, lineId: string): Cart {
  const lines = cart.lines.filter((line) => line.id !== lineId);
  return { ...cart, lines, itemCount: lines.reduce((sum, line) => sum + line.quantity, 0) };
}

/**
 * The shopper's cart, shared by the header badge, product pages and the
 * cart page. Changes show at once and are confirmed by the server's answer;
 * a refusal puts the cart back and says why. Changes go to the server one at
 * a time, in the order they were made. Signing in merges the guest cart.
 */
export function CartProvider({ api, children }: { api?: CartApi; children: ReactNode }) {
  const toast = useToast();
  const { status: sessionStatus, user } = useSession();
  const apiRef = useRef(api);
  const client = useCallback(() => (apiRef.current ??= getCartApi()), []);

  const [cart, setCart] = useState<Cart | null>(null);
  const [status, setStatus] = useState<CartStatus>("loading");
  const [notice, setNotice] = useState<string | null>(null);

  const cartRef = useRef<Cart | null>(null);
  /** The last cart the server confirmed: what a refused change goes back to. */
  const confirmed = useRef<Cart | null>(null);
  const pending = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const generation = useRef(0);

  const show = useCallback((next: Cart | null) => {
    cartRef.current = next;
    setCart(next);
  }, []);

  const confirm = useCallback(
    (next: Cart) => {
      confirmed.current = next;
      // While more changes are on their way, the screen keeps showing the newest one; the last answer settles it.
      if (pending.current === 0) show(next);
    },
    [show]
  );

  const load = useCallback(
    async (call: () => Promise<Cart>) => {
      const mine = ++generation.current;
      try {
        let next: Cart;
        try {
          next = await call();
        } catch (error) {
          if (!isApiError(error, "CART_EXPIRED")) throw error;
          setNotice(EXPIRED);
          next = await client().get();
        }
        if (mine !== generation.current) return;
        confirmed.current = next;
        show(next);
        setStatus("ready");
      } catch {
        if (mine === generation.current) setStatus("error");
      }
    },
    [client, show]
  );

  // Which cart this is follows who is shopping: wait for the session to settle, then load (and merge on sign-in).
  const syncedFor = useRef<string | null | undefined>(undefined);
  const userId = user?.id ?? null;
  useEffect(() => {
    if (sessionStatus === "checking") return;
    const who = sessionStatus === "signed-in" ? userId : null;
    if (syncedFor.current === who) return;
    const hadGuestItems = syncedFor.current === null && (cartRef.current?.itemCount ?? 0) > 0;
    syncedFor.current = who;
    // load() only sets state once the request has answered, never during this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (who === null) void load(() => client().get());
    else
      void load(async () => {
        const merged = await client().merge();
        if (hadGuestItems) setNotice(MERGED);
        return merged;
      });
  }, [sessionStatus, userId, load, client]);

  // Joining Prime (or it lapsing) mid-visit changes every price in the cart: ask for it again.
  const tier = useRef<boolean | undefined>(undefined);
  const isPrime = sessionStatus === "signed-in" ? Boolean(user?.isPrime) : undefined;
  useEffect(() => {
    const before = tier.current;
    tier.current = isPrime;
    if (before !== undefined && isPrime !== undefined && before !== isPrime) {
      // load() only sets state once the request has answered.
       
      void load(() => client().get());
    }
  }, [isPrime, load, client]);

  /** Runs `call` after the changes already on their way; applies `optimistic` now. */
  const change = useCallback(
    async (call: () => Promise<Cart>, optimistic?: (current: Cart) => Cart): Promise<CartResult> => {
      if (optimistic && cartRef.current) show(optimistic(cartRef.current));
      pending.current += 1;
      const run = chain.current.catch(() => undefined).then(call);
      chain.current = run;
      try {
        confirm(await run.finally(() => (pending.current -= 1)));
        return { ok: true };
      } catch (error) {
        if (pending.current === 0) show(confirmed.current);
        if (isApiError(error, "CART_EXPIRED")) {
          setNotice(EXPIRED);
          await load(() => client().get());
          return { ok: false, message: EXPIRED };
        }
        const message = isApiError(error) && error.status < 500 ? error.message : GENERIC;
        toast(message, { tone: "error" });
        // The server knows the true stock; show the cart as it really is.
        if (isApiError(error, "OUT_OF_STOCK")) void load(() => client().get());
        return { ok: false, message };
      }
    },
    [client, confirm, load, show, toast]
  );

  const value = useMemo<CartValue>(
    () => ({
      cart,
      status,
      notice,
      dismissNotice: () => setNotice(null),
      add: (variantId, quantity = 1) => change(() => client().add(variantId, quantity)),
      setQuantity: (lineId, quantity) => change(() => client().setQuantity(lineId, quantity), (current) => withQuantity(current, lineId, quantity)),
      remove: (lineId) => change(() => client().remove(lineId), (current) => withoutLine(current, lineId)),
      async applyCoupon(code) {
        try {
          confirm(await client().applyCoupon(code));
          return { ok: true };
        } catch (error) {
          if (isApiError(error, "COUPON_INVALID")) {
            const reason = error.details?.reason as CouponRefusal | undefined;
            const minCart = typeof error.details?.minCart === "number" ? error.details.minCart : undefined;
            return { ok: false, message: error.message, reason, minCart };
          }
          if (isApiError(error, "CART_EXPIRED")) {
            setNotice(EXPIRED);
            await load(() => client().get());
            return { ok: false, message: EXPIRED };
          }
          return { ok: false, message: isApiError(error) && error.status < 500 ? error.message : GENERIC };
        }
      },
      removeCoupon: () => change(() => client().removeCoupon()),
      refresh: () => load(() => client().get()),
    }),
    [cart, status, notice, change, client, confirm, load]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside <CartProvider>.");
  return value;
}
