import { describe, expect, it } from "vitest";
import { canPay, describeOrder, ORDER_FILTERS, paymentLine, timelineText } from "./status";

describe("describeOrder", () => {
  it("names every display status the backend sends", () => {
    for (const s of ["awaiting_payment", "payment_expired", "payment_failed", "awaiting_approval", "confirmed", "partially_delivered", "delivered", "cancelled"]) {
      expect(describeOrder({ displayStatus: s }).label).not.toMatch(/_/);
    }
    expect(describeOrder({ displayStatus: "awaiting_payment" })).toMatchObject({ label: "Awaiting payment", tone: "warning" });
    expect(describeOrder({ displayStatus: "delivered" }).tone).toBe("success");
  });
  it("never crashes on a status it doesn't know", () => {
    expect(describeOrder({ displayStatus: "on_the_moon" }).label).toBe("On the moon");
  });
});

describe("paymentLine", () => {
  it("describes COD and online payments", () => {
    expect(paymentLine({ paymentMethod: "cod", paymentStatus: "none", status: "placed" })).toBe("Cash on delivery");
    expect(paymentLine({ paymentMethod: "cod", paymentStatus: "none", status: "completed" })).toBe("Cash on delivery (paid)");
    expect(paymentLine({ paymentMethod: "online", paymentStatus: "captured", status: "placed" })).toBe("Paid online");
    expect(paymentLine({ paymentMethod: "online", paymentStatus: "failed", status: "payment_failed" })).toBe("Online payment failed");
    expect(paymentLine({ paymentMethod: "online", paymentStatus: "pending", status: "pending_payment" })).toBe("Online payment pending");
  });
});

describe("canPay", () => {
  it("only an online order still waiting inside its window can be paid", () => {
    expect(canPay({ status: "pending_payment", paymentMethod: "online", displayStatus: "awaiting_payment" })).toBe(true);
    expect(canPay({ status: "pending_payment", paymentMethod: "online", displayStatus: "payment_expired" })).toBe(false);
    expect(canPay({ status: "payment_failed", paymentMethod: "online", displayStatus: "payment_failed" })).toBe(false);
    expect(canPay({ status: "placed", paymentMethod: "cod", displayStatus: "confirmed" })).toBe(false);
  });
});

describe("timelineText", () => {
  it("reads the timeline in the customer's terms", () => {
    expect(timelineText({ type: "order_placed" })).toBe("Order placed");
    expect(timelineText({ type: "payment_captured" })).toBe("Payment received");
    expect(timelineText({ type: "order_cancelled", detail: { reason: "Cancelled by the customer" } })).toBe("Order cancelled: Cancelled by the customer");
    expect(timelineText({ type: "order_cancelled", detail: { reason: "OUT_OF_STOCK_AFTER_PAYMENT" } })).toMatch(/ran out of stock/);
    expect(timelineText({ type: "something_new" })).toBe("Something new");
  });
});

describe("ORDER_FILTERS", () => {
  it("uses single statuses the backend accepts", () => {
    expect(ORDER_FILTERS.map((f) => f.status)).toEqual([undefined, "pending_payment", "placed", "completed", "cancelled"]);
  });
});
