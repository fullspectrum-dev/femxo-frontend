import { Cart } from "../contracts/commerce";
import type { ApiAdapter } from "./adapter";
import { request } from "./request";

/** CartApi: the signed-in customer's cart, or a guest's (the backend tells them apart by token and cookie). */
export function createCartApi(adapter: ApiAdapter) {
  const line = (lineId: string) => `/cart/lines/${encodeURIComponent(lineId)}`;
  return {
    get: (signal?: AbortSignal) => request(adapter, { method: "GET", path: "/cart", signal }, Cart),
    /** Adds to the quantity already in the cart. 409 OUT_OF_STOCK says how many can be had. */
    add: (variantId: string, quantity = 1) => request(adapter, { method: "POST", path: "/cart/lines", body: { variantId, quantity } }, Cart),
    setQuantity: (lineId: string, quantity: number) => request(adapter, { method: "PATCH", path: line(lineId), body: { quantity } }, Cart),
    remove: (lineId: string) => request(adapter, { method: "DELETE", path: line(lineId) }, Cart),
    /** 422 COUPON_INVALID carries a `reason` (see CouponRefusal). */
    applyCoupon: (code: string) => request(adapter, { method: "POST", path: "/cart/coupon", body: { code } }, Cart),
    removeCoupon: () => request(adapter, { method: "DELETE", path: "/cart/coupon" }, Cart),
    /** Right after sign-in: fold the guest cart into the customer's. */
    merge: () => request(adapter, { method: "POST", path: "/cart/merge", body: {} }, Cart),
  };
}

export type CartApi = ReturnType<typeof createCartApi>;
