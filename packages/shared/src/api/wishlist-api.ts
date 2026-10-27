import { Wishlist } from "../contracts/catalog";
import type { ApiAdapter } from "./adapter";
import { request } from "./request";

/** WishlistApi: the signed-in customer's saved products (401 for a guest). */
export function createWishlistApi(adapter: ApiAdapter) {
  const item = (productId: string) => `/wishlist/${encodeURIComponent(productId)}`;
  return {
    list: (signal?: AbortSignal) => request(adapter, { method: "GET", path: "/wishlist", signal }, Wishlist),
    /** Saving something already saved changes nothing. */
    add: (productId: string) => request(adapter, { method: "POST", path: "/wishlist", body: { productId } }, Wishlist),
    /** Removing something that isn't saved changes nothing. */
    remove: (productId: string) => request(adapter, { method: "DELETE", path: item(productId) }, Wishlist),
  };
}

export type WishlistApi = ReturnType<typeof createWishlistApi>;
