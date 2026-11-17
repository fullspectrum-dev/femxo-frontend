import type { Order, TimelineEntry } from "@femxo/shared/contracts";
import type { BadgeTone } from "@femxo/ui";

/** What to call an order, from the server's `displayStatus` (ADR 0020). Unknown values fall back to a plain label, never a crash. */
export const DISPLAY_STATUS: Record<string, { label: string; tone: BadgeTone; hint: string }> = {
  awaiting_payment: { label: "Awaiting payment", tone: "warning", hint: "Pay to confirm your order. It is held for a short while." },
  payment_expired: { label: "Payment time over", tone: "neutral", hint: "The time to pay ran out. Your items are back in your cart." },
  payment_failed: { label: "Payment failed", tone: "danger", hint: "The payment didn't go through, so the order wasn't placed. Your items are back in your cart." },
  awaiting_approval: { label: "Awaiting approval", tone: "warning", hint: "We're checking this order. It will be confirmed shortly." },
  confirmed: { label: "Confirmed", tone: "info", hint: "We've got your order and are getting it ready." },
  partially_delivered: { label: "Partly delivered", tone: "primary", hint: "Some of your items have been delivered." },
  delivered: { label: "Delivered", tone: "success", hint: "Your order has been delivered." },
  cancelled: { label: "Cancelled", tone: "neutral", hint: "This order was cancelled." },
};

export const describeOrder = (order: Pick<Order, "displayStatus">) =>
  DISPLAY_STATUS[order.displayStatus] ?? { label: order.displayStatus.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()), tone: "neutral" as BadgeTone, hint: "" };

export const PAYMENT_METHOD_LABEL = { cod: "Cash on delivery", online: "Paid online" } as const;

/** The order's payment in a few words. */
export function paymentLine(order: Pick<Order, "paymentMethod" | "paymentStatus" | "status">): string {
  if (order.paymentMethod === "cod") return order.status === "completed" ? "Cash on delivery (paid)" : "Cash on delivery";
  if (order.paymentStatus === "captured") return "Paid online";
  if (order.paymentStatus === "failed") return "Online payment failed";
  if (order.paymentStatus === "pending") return "Online payment pending";
  return "Online payment";
}

/** The order list's filter tabs (one status per request, as the backend takes it). */
export const ORDER_FILTERS = [
  { key: "all", label: "All", status: undefined },
  { key: "pending_payment", label: "Awaiting payment", status: "pending_payment" },
  { key: "placed", label: "Confirmed", status: "placed" },
  { key: "completed", label: "Delivered", status: "completed" },
  { key: "cancelled", label: "Cancelled", status: "cancelled" },
] as const;
export type OrderFilterKey = (typeof ORDER_FILTERS)[number]["key"];

/** The words for a timeline entry: what happened, in the customer's terms. */
export function timelineText(entry: Pick<TimelineEntry, "type" | "detail">): string {
  switch (entry.type) {
    case "order_placed":
      return "Order placed";
    case "approval_requested":
      return "Sent for approval";
    case "approval_granted":
      return "Approved";
    case "approval_rejected":
      return "Not approved";
    case "payment_pending":
      return "Waiting for your payment";
    case "payment_captured":
      return "Payment received";
    case "payment_failed":
      return "Payment failed";
    case "payment_expired":
      return "Payment time ran out";
    case "order_confirmed":
      return "Order confirmed";
    case "order_cancelled": {
      const reason = entry.detail && typeof entry.detail.reason === "string" ? entry.detail.reason : null;
      return reason ? `Order cancelled: ${reason === "OUT_OF_STOCK_AFTER_PAYMENT" ? "an item ran out of stock after you paid" : reason}` : "Order cancelled";
    }
    case "refund_requested":
      return "Refund started";
    case "late_payment_recovered":
      return "Late payment received, order restored";
    default:
      return entry.type.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
  }
}

/** Whether the order can still be paid for (the server also refuses an expired one with PAYMENT_WINDOW_LAPSED). */
export const canPay = (order: Pick<Order, "status" | "paymentMethod" | "displayStatus">) =>
  order.status === "pending_payment" && order.paymentMethod === "online" && order.displayStatus === "awaiting_payment";
