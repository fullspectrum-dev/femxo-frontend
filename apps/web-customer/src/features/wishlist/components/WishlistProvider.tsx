"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { userMessage } from "@femxo/shared/api";
import type { WishlistApi } from "@femxo/shared/api";
import type { ProductSummary, WishlistEntry } from "@femxo/shared/contracts";
import { useToast } from "@femxo/ui";
import { useSession } from "@/features/auth/components/SessionProvider";
import { getProductsApi, getWishlistApi } from "@/lib/api";

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
  /** Newest first, as products (the backend keeps ids; names and pictures come from the catalogue). */
  items: ProductSummary[];
  /** Safe to tap the heart: a guest (it leads to sign-in) or a customer whose list has loaded. */
  ready: boolean;
  failed: boolean;
  has(productId: string): boolean;
  /** Save or unsave. A guest is sent to sign in first and the product is saved when they return. */
  toggle(product: Pick<ProductSummary, "id" | "name"> & Partial<ProductSummary>): Promise<void>;
  retry(): void;
}

const WishlistContext = createContext<WishlistValue | null>(null);

interface Loaded {
  /** Whose list this is. */
  owner: string;
  entries: WishlistEntry[] | null;
  failed: boolean;
}

/** Entries newest first. */
export const newestFirst = (entries: readonly WishlistEntry[]) => [...entries].sort((a, b) => b.addedAt.localeCompare(a.addedAt));

/**
 * The signed-in customer's saved products, shared by every heart and the wishlist page. Changes show at once and are put back
 * if the server says no. The backend stores ids; the products shown come from one catalogue lookup per change of list.
 */
export function WishlistProvider({ api, children }: { api?: WishlistApi; children: ReactNode }) {
  const toast = useToast();
  const router = useRouter();
  const { status: sessionStatus, user } = useSession();
  const apiRef = useRef(api);
  const client = useCallback(() => (apiRef.current ??= getWishlistApi()), []);

  const ownerId = sessionStatus === "signed-in" && user ? user.id : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [products, setProducts] = useState<Record<string, ProductSummary>>({});
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    (async () => {
      try {
        let entries = await client().list();
        const pending = read();
        if (pending) {
          write(null);
          try {
            entries = await client().replace([...entries.map((e) => ({ productId: e.productId, variantId: e.variantId })), { productId: pending }]);
            toast("Saved to your wishlist");
          } catch {
            // The wanted product can't be saved right now; the list itself is still good.
          }
        }
        if (!cancelled) setLoaded({ owner: ownerId, entries, failed: false });
      } catch {
        if (!cancelled) setLoaded({ owner: ownerId, entries: null, failed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerId, attempt, client, toast]);

  const mine = loaded && loaded.owner === ownerId ? loaded : null;
  const entries = useMemo(() => mine?.entries ?? [], [mine]);
  const ids = useMemo(() => new Set(entries.map((e) => e.productId)), [entries]);

  // Products we have ids for but no details yet.
  const missing = entries.map((e) => e.productId).filter((id) => !products[id]);
  const missingKey = [...new Set(missing)].join(",");
  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    getProductsApi()
      .lookup({ productIds: missingKey.split(",") })
      .then((found) => !cancelled && setProducts((current) => ({ ...current, ...Object.fromEntries(found.products.map((p) => [p.id, p])) })))
      .catch(() => undefined); // the hearts still work; the page just lists what it can
    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  const items = useMemo(() => newestFirst(entries).flatMap((e) => (products[e.productId] ? [products[e.productId]!] : [])), [entries, products]);

  const toggle = useCallback<WishlistValue["toggle"]>(
    async (product) => {
      if (!ownerId) {
        write(product.id);
        // Read at the moment of the tap: this provider wraps every page, so it can't subscribe to the path while pages render.
        router.push(`/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);
        return;
      }
      const saved = ids.has(product.id);
      const before = entries;
      const call = ++latest.current;
      if (!saved && product.slug) setProducts((current) => ({ ...current, [product.id]: product as ProductSummary }));
      setLoaded({
        owner: ownerId,
        entries: saved ? before.filter((e) => e.productId !== product.id) : [...before, { productId: product.id, variantId: null, addedAt: new Date().toISOString() }],
        failed: false,
      });
      try {
        const list = saved
          ? await client().remove(product.id)
          : await client().replace([...before.map((e) => ({ productId: e.productId, variantId: e.variantId })), { productId: product.id }]);
        if (call === latest.current) setLoaded({ owner: ownerId, entries: list, failed: false });
      } catch (error) {
        if (call === latest.current) setLoaded({ owner: ownerId, entries: before, failed: false });
        toast(userMessage(error, "We couldn't update your wishlist. Please try again."), { tone: "error" });
      }
    },
    [ownerId, ids, entries, client, router, toast]
  );

  const value = useMemo<WishlistValue>(
    () => ({
      items,
      ready: sessionStatus !== "checking" && (ownerId === null || mine?.entries != null),
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
