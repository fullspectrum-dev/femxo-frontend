import { z } from "zod";
import { PrimeMembership, PrimePlan, PrimePurchase } from "../contracts/commerce";
import type { ApiAdapter } from "./adapter";
import { STORE_BASE } from "./auth-api";
import { request } from "./request";

const Plans = z.object({ items: z.array(PrimePlan) });

/** PrimeApi: plans, the customer's membership, and buying (the payment itself is Razorpay Checkout, like an order's). */
export function createPrimeApi(adapter: ApiAdapter) {
  return {
    /** Public. */
    plans: async (signal?: AbortSignal) => (await request(adapter, { method: "GET", path: `${STORE_BASE}/membership/plans`, signal }, Plans)).items,
    membership: (signal?: AbortSignal) => request(adapter, { method: "GET", path: `${STORE_BASE}/membership/current`, signal }, PrimeMembership),
    /**
     * Creates the payment for a plan (the price is the plan's, on the server). The same `idempotencyKey` returns the same
     * payment, so keep one per attempt and reuse it on retry. Prime starts when the payment is captured, not when this returns.
     */
    purchase: (planId: string, idempotencyKey: string) =>
      request(adapter, { method: "POST", path: `${STORE_BASE}/membership/purchase`, body: { planId, idempotencyKey } }, PrimePurchase),
  };
}

export type PrimeApi = ReturnType<typeof createPrimeApi>;
