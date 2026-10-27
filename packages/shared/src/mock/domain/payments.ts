import type { OrderSummary, PaymentIntent, PaymentOutcome } from "../../contracts/commerce";
import { newId } from "../../lib/ids";
import { canCancel } from "./order-lifecycle";
import { startMembership } from "./prime";
import type { MockState, StoredIntent, StoredOrder } from "./types";

/** How long a "pending" payment stays pending before the bank answers (success). */
export const PENDING_SETTLES_MS = 5000;

export const intentView = ({ settlesAt: _settlesAt, ...intent }: StoredIntent): PaymentIntent => intent;

export const toOrderSummary = (order: StoredOrder): OrderSummary => ({
  id: order.id,
  number: order.number,
  placedAt: order.placedAt,
  status: order.status,
  paymentStatus: order.paymentStatus,
  total: order.total,
  itemCount: order.itemCount,
  thumbnail: order.thumbnail,
  ...(order.prime ? { kind: "prime" as const } : {}),
});

/** The next order number: one after the highest so far. */
export function nextOrderNumber(state: MockState) {
  const highest = Math.max(58099, ...Object.values(state.orders).map((order) => Number(order.number.replace(/\D/g, "")) || 0));
  return `FX-${highest + 1}`;
}

/** Money received: the order is confirmed from `at`, and starts moving on by itself. */
export function markPaid(state: MockState, order: StoredOrder, at: number) {
  order.paymentStatus = "paid";
  order.paymentRetryable = false;
  if (order.status === "placed" && order.prime) {
    // A membership has nothing to ship: paid means done, and it starts now.
    const when = new Date(at).toISOString();
    order.status = "delivered";
    order.timeline.push({ status: "confirmed", at: when }, { status: "delivered", at: when, note: "Prime is active" });
    order.canCancel = false;
    startMembership(state, order, at);
  } else if (order.status === "placed") {
    order.status = "confirmed";
    order.timeline.push({ status: "confirmed", at: new Date(at).toISOString() });
    order.canCancel = canCancel("confirmed");
    order.lifecycle = { confirmedAt: at };
  }
}

/** A new payment attempt for an order (attempt 1 at placement, then one per retry). */
export function newIntent(state: MockState, order: StoredOrder): StoredIntent {
  const intents = (state.intents ??= {});
  const attempt = Object.values(intents).filter((intent) => intent.orderId === order.id).length + 1;
  const intent: StoredIntent = { id: newId("pay"), orderId: order.id, amount: order.total, status: "created", attempt };
  intents[intent.id] = intent;
  return intent;
}

/** Records what the bank (the demo sheet) said about an attempt. */
export function applyOutcome(state: MockState, intent: StoredIntent, outcome: PaymentOutcome, now: number) {
  const order = state.orders[intent.orderId]!;
  if (outcome === "success") {
    intent.status = "succeeded";
    delete intent.settlesAt;
    markPaid(state, order, now);
  } else if (outcome === "failure") {
    intent.status = "failed";
    order.paymentStatus = "failed";
    order.paymentRetryable = true;
  } else {
    intent.status = "pending";
    intent.settlesAt = now + PENDING_SETTLES_MS;
    order.paymentStatus = "pending";
    order.paymentRetryable = false;
  }
}

/**
 * Pending payments whose time has come become successful, dated when they
 * were due. Called before anything reads a payment or an order, so the
 * answer is the same whenever it is asked.
 */
export function settlePending(state: MockState, now: number) {
  for (const intent of Object.values(state.intents ?? {})) {
    if (intent.status === "pending" && intent.settlesAt !== undefined && intent.settlesAt <= now) {
      applyOutcome(state, intent, "success", intent.settlesAt);
    }
  }
}
