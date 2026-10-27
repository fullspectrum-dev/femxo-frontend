import type { OrderStatus } from "../../contracts/commerce";
import type { StoredOrder } from "./types";

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const RETURN_WINDOW_DAYS = 7;

/** After payment (or at once, for cash on delivery) an order moves on by itself, on the demo clock. */
const STEPS: { status: OrderStatus; afterMs: number }[] = [
  { status: "packed", afterMs: 6 * HOUR },
  { status: "shipped", afterMs: 24 * HOUR },
  { status: "out_for_delivery", afterMs: 48 * HOUR },
  { status: "delivered", afterMs: 60 * HOUR },
];

const NOTES: Partial<Record<OrderStatus, string>> = {
  shipped: "Left the Patna warehouse",
  out_for_delivery: "With the delivery partner",
};

/** An order can be cancelled until it is packed. */
export const canCancel = (status: OrderStatus) => status === "placed" || status === "confirmed";

/** The last day returns are accepted (YYYY-MM-DD), counted from delivery. */
export const returnWindowEnds = (deliveredAt: number) => new Date(deliveredAt + RETURN_WINDOW_DAYS * DAY).toISOString().slice(0, 10);

/**
 * The order as it stands at `now`: steps that have come due are added to the
 * timeline, dated when they were due, so the result is the same however
 * often it is asked. Seeded orders (no `lifecycle`) are fixed in time.
 */
export function advanceOrder(order: StoredOrder, now: number): StoredOrder {
  const { lifecycle } = order;
  if (!lifecycle || (order.status !== "confirmed" && !STEPS.some((step) => step.status === order.status))) return order;

  const reached = new Set(order.timeline.map((event) => event.status));
  const due = STEPS.filter((step) => !reached.has(step.status) && lifecycle.confirmedAt + step.afterMs <= now);
  if (due.length === 0) return order;

  const timeline = [
    ...order.timeline,
    ...due.map((step) => ({
      status: step.status,
      at: new Date(lifecycle.confirmedAt + step.afterMs).toISOString(),
      ...(NOTES[step.status] ? { note: NOTES[step.status] } : {}),
    })),
  ];
  const status = due.at(-1)!.status;
  const deliveredAt = status === "delivered" ? lifecycle.confirmedAt + 60 * HOUR : null;
  return {
    ...order,
    status,
    timeline,
    canCancel: canCancel(status),
    canReturnUntil: deliveredAt !== null && order.lines.some((line) => line.returnable) ? returnWindowEnds(deliveredAt) : null,
  };
}
