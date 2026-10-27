import type { CouponRefusal } from "../../contracts/commerce";
import type { StoredCoupon } from "./types";

export type CouponCheck = { ok: true; discount: number } | { ok: false; reason: CouponRefusal; minCart?: number };

export interface CouponContext {
  /** The items after Prime pricing, before the coupon (paise). */
  itemsTotal: number;
  member: boolean;
  /** Has this shopper ever placed an order (false for guests). */
  hasOrders: boolean;
  now: number;
}

/**
 * Whether a coupon applies to this cart, and what it takes off. Refusals
 * come one at a time in the order a shopper would fix them: does it exist,
 * is it live, is it theirs, is the cart big enough.
 */
export function checkCoupon(coupon: StoredCoupon | undefined, { itemsTotal, member, hasOrders, now }: CouponContext): CouponCheck {
  if (!coupon) return { ok: false, reason: "not_found" };
  if (Date.parse(coupon.validTill) <= now) return { ok: false, reason: "expired" };
  if (coupon.usageLimit !== null && coupon.used >= coupon.usageLimit) return { ok: false, reason: "exhausted" };
  if (coupon.primeOnly && !member) return { ok: false, reason: "prime_only" };
  if (coupon.firstOrderOnly && hasOrders) return { ok: false, reason: "first_order_only" };
  if (itemsTotal < coupon.minCart) return { ok: false, reason: "min_cart", minCart: coupon.minCart };

  const raw = coupon.kind === "flat" ? coupon.value : Math.floor((itemsTotal * coupon.value) / 10_000);
  const capped = coupon.maxDiscount === null ? raw : Math.min(raw, coupon.maxDiscount);
  return { ok: true, discount: Math.min(capped, itemsTotal) };
}
