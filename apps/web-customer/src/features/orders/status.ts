import type { OrderStatus, PaymentStatus } from "@femxo/shared/contracts";
import type { BadgeTone } from "@femxo/ui";

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  placed: { label: "Order placed", tone: "info" },
  confirmed: { label: "Confirmed", tone: "info" },
  packed: { label: "Packed", tone: "info" },
  shipped: { label: "Shipped", tone: "info" },
  out_for_delivery: { label: "Out for delivery", tone: "primary" },
  delivered: { label: "Delivered", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  delivery_failed: { label: "Delivery failed", tone: "danger" },
  return_requested: { label: "Return requested", tone: "warning" },
  returned: { label: "Returned", tone: "neutral" },
  refunded: { label: "Refunded", tone: "neutral" },
};

export const PAYMENT_STATUS: Record<PaymentStatus, string> = {
  pending: "Payment pending",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded",
  cod: "Pay on delivery",
};

/** The steps an order normally goes through, in order. */
export const NORMAL_PATH: OrderStatus[] = ["placed", "confirmed", "packed", "shipped", "out_for_delivery", "delivered"];

/** The order list's filter tabs. */
export const ORDER_FILTERS = [
  { key: "all", label: "All", statuses: undefined },
  { key: "open", label: "In progress", statuses: ["placed", "confirmed", "packed", "shipped", "out_for_delivery"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
  { key: "closed", label: "Cancelled & returns", statuses: ["cancelled", "delivery_failed", "return_requested", "returned", "refunded"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly OrderStatus[] | undefined }[];

export type OrderFilterKey = (typeof ORDER_FILTERS)[number]["key"];
