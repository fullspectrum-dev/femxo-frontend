import { describe, expect, it } from "vitest";
import type { StoredCoupon } from "./types";
import { checkCoupon } from "./coupons";

const NOW = Date.UTC(2026, 9, 24, 5, 0);
const base: StoredCoupon = {
  code: "SAVE10",
  label: "10% off, up to ₹150",
  kind: "percent",
  value: 1000,
  maxDiscount: 15000,
  minCart: 19900,
  primeOnly: false,
  validTill: new Date(NOW + 86_400_000).toISOString(),
  usageLimit: null,
  used: 0,
  firstOrderOnly: false,
};
const ctx = { itemsTotal: 50000, member: false, hasOrders: true, now: NOW };

describe("checkCoupon", () => {
  it("takes a percentage off the item total, up to the cap", () => {
    expect(checkCoupon(base, ctx)).toEqual({ ok: true, discount: 5000 });
    expect(checkCoupon(base, { ...ctx, itemsTotal: 400000 })).toEqual({ ok: true, discount: 15000 });
  });

  it("takes a flat amount off, never more than the items cost", () => {
    const flat = { ...base, kind: "flat", value: 5000, maxDiscount: null } as const;
    expect(checkCoupon(flat, ctx)).toEqual({ ok: true, discount: 5000 });
    expect(checkCoupon(flat, { ...ctx, itemsTotal: 19900 })).toMatchObject({ ok: true, discount: 5000 });
    expect(checkCoupon({ ...flat, value: 99_999, minCart: 0 }, { ...ctx, itemsTotal: 3000 })).toEqual({ ok: true, discount: 3000 });
  });

  it("says why it refuses, one reason at a time", () => {
    expect(checkCoupon(undefined, ctx)).toEqual({ ok: false, reason: "not_found" });
    expect(checkCoupon({ ...base, validTill: new Date(NOW - 1).toISOString() }, ctx)).toEqual({ ok: false, reason: "expired" });
    expect(checkCoupon({ ...base, usageLimit: 5, used: 5 }, ctx)).toEqual({ ok: false, reason: "exhausted" });
    expect(checkCoupon(base, { ...ctx, itemsTotal: 10000 })).toEqual({ ok: false, reason: "min_cart", minCart: 19900 });
    expect(checkCoupon({ ...base, primeOnly: true }, ctx)).toEqual({ ok: false, reason: "prime_only" });
    expect(checkCoupon({ ...base, firstOrderOnly: true }, ctx)).toEqual({ ok: false, reason: "first_order_only" });
  });

  it("lets Prime members use Prime coupons and first-time shoppers use first-order ones", () => {
    expect(checkCoupon({ ...base, primeOnly: true }, { ...ctx, member: true }).ok).toBe(true);
    expect(checkCoupon({ ...base, firstOrderOnly: true }, { ...ctx, hasOrders: false }).ok).toBe(true);
  });
});
