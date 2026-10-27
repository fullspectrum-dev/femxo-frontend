import { describe, expect, it } from "vitest";
import { advanceOrder, HOUR, canCancel, returnWindowEnds } from "./order-lifecycle";
import type { StoredOrder } from "./types";

const T0 = Date.UTC(2026, 9, 24, 5, 0);

/** A just-confirmed order, placed in this browser. */
const order = (overrides: Partial<StoredOrder> = {}): StoredOrder =>
  ({
    id: "ord-x",
    customerId: "cus-1",
    status: "confirmed",
    paymentStatus: "paid",
    paymentRetryable: false,
    canCancel: true,
    canReturnUntil: null,
    lines: [{ returnable: true }, { returnable: true }],
    timeline: [
      { status: "placed", at: new Date(T0 - 1000).toISOString() },
      { status: "confirmed", at: new Date(T0).toISOString() },
    ],
    lifecycle: { confirmedAt: T0 },
    ...overrides,
  }) as unknown as StoredOrder;

describe("advanceOrder", () => {
  it("leaves a confirmed order alone before its next step is due", () => {
    const next = advanceOrder(order(), T0 + 5 * HOUR);
    expect(next.status).toBe("confirmed");
    expect(next.timeline).toHaveLength(2);
    expect(next.canCancel).toBe(true);
  });

  it("packs it after 6 hours, dated when it was due, and can then no longer be cancelled", () => {
    const next = advanceOrder(order(), T0 + 7 * HOUR);
    expect(next.status).toBe("packed");
    expect(next.timeline.at(-1)).toEqual({ status: "packed", at: new Date(T0 + 6 * HOUR).toISOString() });
    expect(next.canCancel).toBe(false);
  });

  it("goes through shipped and out for delivery as time passes, one event each, in order", () => {
    const next = advanceOrder(order(), T0 + 50 * HOUR);
    expect(next.timeline.map((event) => event.status)).toEqual(["placed", "confirmed", "packed", "shipped", "out_for_delivery"]);
    expect(next.status).toBe("out_for_delivery");
  });

  it("delivers at 60 hours, and opens a 7-day return window when something can be returned", () => {
    const next = advanceOrder(order(), T0 + 61 * HOUR);
    expect(next.status).toBe("delivered");
    expect(next.canReturnUntil).toBe(returnWindowEnds(T0 + 60 * HOUR));
    expect(next.canReturnUntil).toBe("2026-11-02");
  });

  it("opens no return window when nothing in the order is returnable", () => {
    const none = order({ lines: [{ returnable: false }] as never });
    expect(advanceOrder(none, T0 + 61 * HOUR).canReturnUntil).toBeNull();
  });

  it("doesn't advance an order that is still waiting for payment, or one that was cancelled", () => {
    expect(advanceOrder(order({ status: "placed", lifecycle: undefined }), T0 + 100 * HOUR).status).toBe("placed");
    expect(advanceOrder(order({ status: "cancelled" }), T0 + 100 * HOUR).status).toBe("cancelled");
  });

  it("doesn't touch orders that were seeded (no lifecycle)", () => {
    const seeded = order({ status: "shipped", lifecycle: undefined });
    expect(advanceOrder(seeded, T0 + 500 * HOUR)).toBe(seeded);
  });

  it("is steady: advancing twice gives the same answer", () => {
    const once = advanceOrder(order(), T0 + 30 * HOUR);
    expect(advanceOrder(once, T0 + 30 * HOUR)).toEqual(once);
  });
});

describe("canCancel", () => {
  it("is allowed until the order is packed", () => {
    expect(canCancel("placed")).toBe(true);
    expect(canCancel("confirmed")).toBe(true);
    expect(canCancel("packed")).toBe(false);
    expect(canCancel("delivered")).toBe(false);
  });
});
