import { WishlistEnvelope, type WishlistEntry } from "../contracts/commerce";
import type { ApiAdapter } from "./adapter";
import { STORE_BASE } from "./auth-api";
import { request } from "./request";

/** WishlistApi: the signed-in customer's saved products (ids only; the page joins them with the catalogue). Up to 200. */
export function createWishlistApi(adapter: ApiAdapter) {
  const path = `${STORE_BASE}/me/wishlist`;
  return {
    list: async (signal?: AbortSignal): Promise<WishlistEntry[]> => (await request(adapter, { method: "GET", path, signal }, WishlistEnvelope)).items,
    /** Replaces the whole list (422 WISHLIST_FULL, PRODUCT_NOT_FOUND). */
    replace: async (items: readonly { productId: string; variantId?: string | null }[]): Promise<WishlistEntry[]> =>
      (await request(adapter, { method: "PUT", path, body: { items } }, WishlistEnvelope)).items,
    /** Removes one product. */
    remove: async (productId: string): Promise<WishlistEntry[]> => (await request(adapter, { method: "DELETE", path, query: { productId } }, WishlistEnvelope)).items,
  };
}

export type WishlistApi = ReturnType<typeof createWishlistApi>;
