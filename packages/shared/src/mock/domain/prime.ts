import type { Membership } from "../../contracts/people";
import { PRIME_PLANS } from "../seed/state";
import { DAY } from "./order-lifecycle";
import type { MockState, StoredOrder } from "./types";

export const findPlan = (planId: string) => PRIME_PLANS.find((plan) => plan.id === planId);

/** The next member number, one after the highest so far (FXP-000232 …). */
function nextMemberId(state: MockState) {
  const highest = Math.max(0, ...Object.values(state.memberships).map((entry) => Number(entry.memberId.replace(/\D/g, "")) || 0));
  return `FXP-${String(highest + 1).padStart(6, "0")}`;
}

/**
 * A paid Prime purchase becomes (or extends) the customer's membership. An
 * active one is extended from where it ends; a lapsed one restarts from
 * now. The member number stays with the customer for good.
 */
export function startMembership(state: MockState, order: StoredOrder, at: number) {
  const plan = findPlan(order.prime!.planId)!;
  const customerId = order.customerId;
  const existing = state.memberships[customerId];
  const extending = existing !== undefined && Date.parse(existing.validTill) > at;
  const memberId = existing?.memberId ?? nextMemberId(state);
  const membership: Membership = {
    memberId,
    plan,
    startedAt: extending ? existing.startedAt : new Date(at).toISOString(),
    validTill: new Date((extending ? Date.parse(existing.validTill) : at) + plan.durationDays * DAY).toISOString(),
    qrPayload: `femxo:prime:${memberId}`,
  };
  state.memberships[customerId] = membership;

  if (!state.referrals[customerId]) {
    const customer = state.customers.find((entry) => entry.id === customerId);
    const name = (customer?.name.split(" ")[0] ?? "FRIEND").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "FRIEND";
    const code = `${name}${memberId.slice(-2)}`;
    state.referrals[customerId] = { code, link: `https://shop.femxo.in/join?ref=${code}`, invited: 0, joined: 0, rewardsEarned: 0 };
  }
}
