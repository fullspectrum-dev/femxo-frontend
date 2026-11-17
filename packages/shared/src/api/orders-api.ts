import { z } from "zod";
import {
  CancelResult,
  CheckoutResult,
  OrderDetail,
  OrderPage,
  PayAgainResult,
  PaymentEnvelope,
  TimelineEntry,
  VerifyResult,
  type PaymentMethod,
  type RazorpaySuccess,
} from "../contracts/commerce";
import type { ApiAdapter } from "./adapter";
import { STORE_BASE } from "./auth-api";
import { request } from "./request";

export interface OrderQuery {
  status?: string;
  cursor?: string;
  limit?: number;
}

export interface CheckoutInput {
  addressId: string;
  paymentMethod: PaymentMethod;
  /** The cart revision the customer reviewed: a cart that changed since is 409 CART_CHANGED. */
  cartRev: number;
  /** The total the customer was shown; a different total today is 409 PRICE_CHANGED. Never used to charge. */
  expectedTotalPaise?: number;
}

const Timeline = z.object({ items: z.array(TimelineEntry) });

/**
 * OrdersApi: checkout, the customer's orders, cancelling, paying an online order again, and the payment callbacks.
 * One `idempotencyKey` is one attempt: a retry of the same attempt (double tap, bad connection) gets the same order
 * back (`replayed: true`) instead of a second one. A new attempt takes a new key.
 */
export function createOrdersApi(adapter: ApiAdapter) {
  const order = (id: string) => `${STORE_BASE}/orders/${encodeURIComponent(id)}`;
  return {
    checkout: (input: CheckoutInput, idempotencyKey: string) =>
      request(adapter, { method: "POST", path: `${STORE_BASE}/checkout`, body: input, idempotencyKey }, CheckoutResult),
    list: ({ status, cursor, limit }: OrderQuery = {}, signal?: AbortSignal) =>
      request(adapter, { method: "GET", path: `${STORE_BASE}/orders`, query: { status, cursor, limit }, signal }, OrderPage),
    get: (id: string, signal?: AbortSignal) => request(adapter, { method: "GET", path: order(id), signal }, OrderDetail),
    timeline: async (id: string, signal?: AbortSignal) => (await request(adapter, { method: "GET", path: `${order(id)}/timeline`, signal }, Timeline)).items,
    cancel: (id: string, idempotencyKey: string, reason?: string) =>
      request(adapter, { method: "POST", path: `${order(id)}/cancel`, body: reason ? { reason } : {}, idempotencyKey }, CancelResult),
    /** The Razorpay order to pay again (a closed tab, a provider hiccup, a failed attempt while the window is still open). */
    pay: async (id: string) => (await request(adapter, { method: "POST", path: `${order(id)}/pay`, body: {} }, PayAgainResult)).payment,

    /** Checkout's success callback. It only speeds the UI up: the webhook decides. `confirmed: false` means "ask again". */
    verifyPayment: (success: RazorpaySuccess) => request(adapter, { method: "POST", path: `${STORE_BASE}/payments/verify`, body: success }, VerifyResult),
    payment: async (id: string, signal?: AbortSignal) =>
      (await request(adapter, { method: "GET", path: `${STORE_BASE}/payments/${encodeURIComponent(id)}`, signal }, PaymentEnvelope)).payment,
  };
}

export type OrdersApi = ReturnType<typeof createOrdersApi>;
