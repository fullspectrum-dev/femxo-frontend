import { CheckoutSession, PlacedOrder, type PaymentMethod } from "../contracts/commerce";
import type { ApiAdapter } from "./adapter";
import { request } from "./request";

/** CheckoutApi: from the cart to a placed order. */
export function createCheckoutApi(adapter: ApiAdapter) {
  const one = (id: string) => `/checkout/${encodeURIComponent(id)}`;
  return {
    /** Starts from the signed-in customer's cart, with their default address chosen. 422 if the cart is empty. */
    start: () => request(adapter, { method: "POST", path: "/checkout", body: {} }, CheckoutSession),
    get: (id: string) => request(adapter, { method: "GET", path: one(id) }, CheckoutSession),
    update: (id: string, change: { addressId?: string; deliveryId?: "standard" }) =>
      request(adapter, { method: "PATCH", path: one(id), body: change }, CheckoutSession),
    /**
     * Places the order. Keep one `idempotencyKey` for one attempt: a repeat (double tap, retry after a bad
     * connection) then gets the same order back instead of a second one. 409 OUT_OF_STOCK lists what ran short.
     */
    placeOrder: (id: string, method: PaymentMethod, idempotencyKey?: string) =>
      request(adapter, { method: "POST", path: `${one(id)}/order`, body: { method }, idempotencyKey }, PlacedOrder),
  };
}

export type CheckoutApi = ReturnType<typeof createCheckoutApi>;
