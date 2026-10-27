import { formatINR } from "@femxo/shared";
import type { CouponRefusal } from "@femxo/shared/contracts";

/**
 * What to tell a shopper whose coupon was refused. For a small cart it says
 * how much more is needed, which the server's generic message can't.
 */
export function couponRefusalCopy(reason: CouponRefusal | undefined, { minCart, itemsTotal, fallback }: { minCart?: number; itemsTotal: number; fallback: string }) {
  switch (reason) {
    case "not_found":
      return "That coupon code isn't valid. Check it and try again.";
    case "expired":
      return "That coupon has expired.";
    case "exhausted":
      return "That coupon has been fully used.";
    case "prime_only":
      return "That coupon is for Prime members.";
    case "first_order_only":
      return "That coupon is only for a first order.";
    case "min_cart":
      return minCart ? `Add ${formatINR(Math.max(minCart - itemsTotal, 0))} more to use this coupon (minimum cart ${formatINR(minCart)}).` : fallback;
    default:
      return fallback;
  }
}
