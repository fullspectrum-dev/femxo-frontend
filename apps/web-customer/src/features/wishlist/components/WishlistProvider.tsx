"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { WishlistApi } from "@femxo/shared/api";
import type { ProductSummary } from "@femxo/shared/contracts";
import { useToast } from "@femxo/ui";
import { useSession } from "@/features/auth/components/SessionProvider";
import { getWishlistApi } from "@/lib/api";

/** The product a guest tapped the heart on, kept across the sign-in page so it can be saved afterwards. */
export const PENDING_WISH_KEY = "femxo.pendingWish";

const read = () => {
  try {
    return sessionStorage.getItem(PENDING_WISH_KEY);
  } catch {
    return null;
  }
};
const write = (productId: string | null) => {
  try {
    if (productId) sessionStorage.setItem(PENDING_WISH_KEY, productId);
    else sessionStorage.removeItem(PENDING_WISH_KEY);
  } catch {
    // Private mode: the heart just won't be remembered across sign-in.
  }
};

interface WishlistValue {
  items: ProductSummary[];
  /** Safe to tap the heart: a guest (it leads to sign-in) or a customer whose list has loaded. */
  ready: boolean;
  failed: boolean;
  has(productId: string): boolean;
  /** Save or unsave. A guest is sent to sign in first and the product is saved when they return. */
  toggle(product: ProductSummary): Promise<void>;
  retry(): void;
}

const WishlistContext = createContext<WishlistValue | null>(null);

const FAILED = "We couldn't update your wishlist. Please try again.";

interface Loaded {
  /** Whose list this is. */
  owner: string;
  items: ProductSummary[] | null;
  failed: boolean;
}

/**
 * The signed-in customer's saved products, shared by every heart and the
 * wishlist page. Changes show at once and are put back if the server says no.
 */
export function WishlistProvider({ api, children }: { api?: WishlistApi; children: ReactNode }) {
  const toast = useToast();
  const router = useRouter();
  const { status: sessionStatus, user } = useSession();
  const apiRef = useRef(api);
  const client = useCallback(() => (apiRef.current ??= getWishlistApi()), []);

  const ownerId = sessionStatus === "signed-in" && user ? user.id : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    (async () => {
      try {
        let list = await client().list();
        const pending = read();
        if (pending) {
          write(null);
          try {
            list = await client().add(pending);
            toast("Saved to your wishlist");
          } catch {
            // The wanted product can't be saved right now; the list itself is still good.
          }
        }
        if (!cancelled) setLoaded({ owner: ownerId, items: list.items, failed: false });
      } catch {
        if (!cancelled) setLoaded({ owner: ownerId, items: null, failed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerId, attempt, client, toast]);

  const mine = loaded && loaded.owner === ownerId ? loaded : null;
  const items = useMemo(() => mine?.items ?? [], [mine]);
  const ids = useMemo(() => new Set(items.map((item) => item.id)), [items]);

  const toggle = useCallback(
    async (product: ProductSummary) => {
      if (!ownerId) {
        write(product.id);
        // Read at the moment of the tap: this provider wraps every page, so it can't subscribe to the path while pages render.
        router.push(`/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);
        return;
      }
      const saved = ids.has(product.id);
      const before = items;
      const call = ++latest.current;
      setLoaded({ owner: ownerId, items: saved ? before.filter((item) => item.id !== product.id) : [product, ...before], failed: false });
      try {
        const list = saved ? await client().remove(product.id) : await client().add(product.id);
        if (call === latest.current) setLoaded({ owner: ownerId, items: list.items, failed: false });
      } catch {
        if (call === latest.current) setLoaded({ owner: ownerId, items: before, failed: false });
        toast(FAILED, { tone: "error" });
      }
    },
    [ownerId, ids, items, client, router, toast]
  );

  const value = useMemo<WishlistValue>(
    () => ({
      items,
      ready: sessionStatus !== "checking" && (ownerId === null || mine?.items != null),
      failed: mine?.failed ?? false,
      has: (productId) => ids.has(productId),
      toggle,
      retry: () => setAttempt((n) => n + 1),
    }),
    [items, sessionStatus, ownerId, mine, ids, toggle]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const value = useContext(WishlistContext);
  if (!value) throw new Error("useWishlist must be used inside <WishlistProvider>.");
  return value;
}
