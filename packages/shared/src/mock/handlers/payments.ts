import { z } from "zod";
import { MockHttpError } from "../../adapters/mock/errors";
import type { MockContext, MockResult, MockRouter } from "../../adapters/mock/router";
import { PaymentOutcome } from "../../contracts/commerce";
import { applyOutcome, intentView, newIntent, settlePending } from "../domain/payments";
import type { MockState, StoredIntent } from "../domain/types";
import { authenticate } from "./auth";

const Confirm = z.object({ outcome: PaymentOutcome });
const Retry = z.object({ orderId: z.string().min(1) });

export interface PaymentControls {
  /** The outcome picked in the demo panel for the next payment (applies once), or null. */
  takeNextPayment(): PaymentOutcome | null;
}

/**
 * The demo payment gateway. The payment sheet reports how the bank answered
 * (or the demo panel decides); a "pending" payment turns successful a few
 * seconds later.
 */
export function registerPaymentRoutes(router: MockRouter<MockState>, controls: PaymentControls) {
  /** The customer's own attempt, after any pending payments that have come due have settled. */
  function mine(ctx: MockContext<MockState>): StoredIntent {
    const { customer } = authenticate(ctx);
    settlePending(ctx.state, ctx.clock.now());
    const intent = ctx.state.intents?.[ctx.params.id!];
    if (!intent || ctx.state.orders[intent.orderId]?.customerId !== customer.id) throw new MockHttpError(404, "NOT_FOUND", "We couldn't find that payment.");
    return intent;
  }

  router.get("/payments/:id", (ctx): MockResult => ({ status: 200, body: intentView(mine(ctx)) }));

  router.post("/payments/:id/confirm", (ctx): MockResult => {
    const { outcome: reported } = Confirm.parse(ctx.body);
    const intent = mine(ctx);
    // Only an attempt that hasn't been answered yet takes an answer; a later one changes nothing.
    if (intent.status === "created") applyOutcome(ctx.state, intent, controls.takeNextPayment() ?? reported, ctx.clock.now());
    return { status: 200, body: intentView(intent) };
  });

  /** A new attempt for an order that is waiting for payment (it failed, or the sheet was closed unpaid). */
  router.post("/payments", (ctx): MockResult => {
    const { customer } = authenticate(ctx);
    const { orderId } = Retry.parse(ctx.body);
    settlePending(ctx.state, ctx.clock.now());
    const order = ctx.state.orders[orderId];
    if (!order || order.customerId !== customer.id) throw new MockHttpError(404, "NOT_FOUND", "We couldn't find that order.");
    if (!order.paymentRetryable) throw new MockHttpError(409, "ORDER_STATE", "This order doesn't need another payment attempt.");
    // An attempt nobody answered is given up in favour of the new one.
    for (const old of Object.values(ctx.state.intents ?? {})) if (old.orderId === order.id && old.status === "created") old.status = "failed";
    order.paymentStatus = "pending";
    order.paymentRetryable = false;
    return { status: 200, body: intentView(newIntent(ctx.state, order)) };
  });
}
