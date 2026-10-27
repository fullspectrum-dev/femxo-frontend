import type { MockState } from "./types";

/** Whether a customer's Prime membership is active at `now` (clock ms). Guests never are. */
export function isPrimeMember(state: MockState, customerId: string | null, now: number) {
  const membership = customerId ? state.memberships[customerId] : undefined;
  return Boolean(membership && Date.parse(membership.validTill) > now);
}
