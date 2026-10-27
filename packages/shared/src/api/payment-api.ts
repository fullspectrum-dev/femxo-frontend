import { PaymentIntent, type PaymentOutcome } from "../contracts/commerce";
import type { ApiAdapter } from "./adapter";
import { request } from "./request";

/** PaymentApi: the demo payment gateway behind the payment sheet. */
export function createPaymentApi(adapter: ApiAdapter) {
  const one = (id: string) => `/payments/${encodeURIComponent(id)}`;
  return {
    /** Reports how the bank answered. Only the first answer counts; a later one returns the intent as it is. */
    confirm: (intentId: string, outcome: PaymentOutcome) => request(adapter, { method: "POST", path: `${one(intentId)}/confirm`, body: { outcome } }, PaymentIntent),
    /** For a payment left pending: ask again until it settles. */
    get: (intentId: string, signal?: AbortSignal) => request(adapter, { method: "GET", path: one(intentId), signal }, PaymentIntent),
    /** A new attempt for an order whose payment failed (409 ORDER_STATE otherwise). */
    retry: (orderId: string) => request(adapter, { method: "POST", path: "/payments", body: { orderId } }, PaymentIntent),
  };
}

export type PaymentApi = ReturnType<typeof createPaymentApi>;
