import { z } from "zod";
import { BirthdayReward, Coupon, MembershipStatus, PrimePlan, PrimePurchase, Referral } from "../contracts/people";
import type { ApiAdapter } from "./adapter";
import { request } from "./request";

/** PrimeApi: plans, joining, the member's card and their perks. */
export function createPrimeApi(adapter: ApiAdapter) {
  return {
    /** Public. */
    plans: () => request(adapter, { method: "GET", path: "/prime/plans" }, z.array(PrimePlan)),
    membership: (signal?: AbortSignal) => request(adapter, { method: "GET", path: "/prime/membership", signal }, MembershipStatus),
    /** Starts a payment for the plan; the customer becomes a member when it succeeds (PaymentApi.confirm). */
    purchase: (planId: string) => request(adapter, { method: "POST", path: "/prime/purchase", body: { planId } }, PrimePurchase),
    /** 403 FORBIDDEN for non-members, on this and the next. */
    coupons: () => request(adapter, { method: "GET", path: "/prime/coupons" }, z.array(Coupon)),
    referral: () => request(adapter, { method: "GET", path: "/prime/referral" }, Referral),
    /** Null unless it is the member's birthday and their plan includes the reward. */
    birthday: () => request(adapter, { method: "GET", path: "/prime/birthday" }, BirthdayReward.nullable()),
  };
}

export type PrimeApi = ReturnType<typeof createPrimeApi>;
