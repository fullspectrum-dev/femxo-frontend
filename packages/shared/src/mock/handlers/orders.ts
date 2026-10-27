import { z } from "zod";
import { MockHttpError } from "../../adapters/mock/errors";
import { paginate } from "../../adapters/mock/pagination";
import type { MockContext, MockResult, MockRouter } from "../../adapters/mock/router";
import { OrderStatus } from "../../contracts/commerce";
import { istDate, stockFor } from "../domain/mappers";
import { advanceOrder, canCancel } from "../domain/order-lifecycle";
import { settlePending, toOrderSummary } from "../domain/payments";
import type { MockState, StoredOrder } from "../domain/types";
import { authenticate } from "./auth";

const ReturnRequest = z.object({
  lineIds: z.array(z.string()).min(1, "Choose at least one item to return"),
  reason: z.string().trim().min(3, "Tell us why you're returning it").max(300),
});

const toArray = (value: string | string[] | undefined) => (value === undefined ? [] : [value].flat());

/** Order history, tracking, cancelling and returns. Orders placed here move on by themselves with the demo clock. */
export function registerOrderRoutes(router: MockRouter<MockState>) {
  /** Brings every order up to date with the clock before it is read or changed. */
  function refresh(ctx: MockContext<MockState>) {
    const now = ctx.clock.now();
    settlePending(ctx.state, now);
    for (const [id, order] of Object.entries(ctx.state.orders)) {
      const next = advanceOrder(order, now);
      if (next !== order) ctx.state.orders[id] = next;
    }
  }

  function mine(ctx: MockContext<MockState>): StoredOrder {
    const { customer } = authenticate(ctx);
    refresh(ctx);
    const order = ctx.state.orders[ctx.params.id!];
    if (!order || order.customerId !== customer.id) throw new MockHttpError(404, "NOT_FOUND", "We couldn't find that order.");
    return order;
  }

  const detail = ({ customerId: _customerId, lifecycle: _lifecycle, prime, ...order }: StoredOrder) => (prime ? { ...order, kind: "prime" as const } : order);

  router.get("/orders", (ctx): MockResult => {
    const { customer } = authenticate(ctx);
    refresh(ctx);
    const statuses = toArray(ctx.query.status).map((status) => OrderStatus.parse(status));
    const list = Object.values(ctx.state.orders)
      .filter((order) => order.customerId === customer.id && (statuses.length === 0 || statuses.includes(order.status)))
      .sort((a, b) => (a.placedAt < b.placedAt ? 1 : a.placedAt > b.placedAt ? -1 : a.id < b.id ? 1 : -1))
      .map(toOrderSummary);
    return { status: 200, body: paginate(list, ctx.query, 10) };
  });

  router.get("/orders/:id", (ctx): MockResult => ({ status: 200, body: detail(mine(ctx)) }));

  router.post("/orders/:id/cancel", (ctx): MockResult => {
    const order = mine(ctx);
    if (!canCancel(order.status)) {
      throw new MockHttpError(409, "ORDER_STATE", order.status === "cancelled" ? "This order is already cancelled." : "This order has been packed and can no longer be cancelled.");
    }
    const now = ctx.clock.now();
    const stock = stockFor(ctx.state);
    // The items go back on the shelf.
    for (const line of order.lines) ctx.state.stock[line.variant.id] = stock({ ...line.variant, batches: [] }) + line.quantity;
    order.status = "cancelled";
    order.timeline.push({ status: "cancelled", at: new Date(now).toISOString(), note: order.paymentStatus === "paid" ? "Refund started" : undefined });
    if (order.paymentStatus === "paid") order.paymentStatus = "refunded";
    order.canCancel = false;
    order.paymentRetryable = false;
    return { status: 200, body: detail(order) };
  });

  router.post("/orders/:id/return", (ctx): MockResult => {
    const order = mine(ctx);
    const { lineIds, reason: _reason } = ReturnRequest.parse(ctx.body);
    const open = order.status === "delivered" && order.canReturnUntil !== null && istDate(ctx.clock.date()) <= order.canReturnUntil;
    if (!open) {
      throw new MockHttpError(409, "ORDER_STATE", order.status === "delivered" ? "The 7-day return window for this order has closed." : "Returns open once the order has been delivered.");
    }
    for (const id of lineIds) {
      const line = order.lines.find((entry) => entry.id === id);
      if (!line) throw new MockHttpError(404, "NOT_FOUND", "That item isn't in this order.");
      if (!line.returnable) throw new MockHttpError(422, "VALIDATION_FAILED", `${line.product.name} can't be returned.`, { fields: { lineIds: `${line.product.name} can't be returned` } });
    }
    order.status = "return_requested";
    order.timeline.push({ status: "return_requested", at: ctx.clock.date().toISOString() });
    order.canReturnUntil = null;
    return { status: 200, body: detail(order) };
  });
}
