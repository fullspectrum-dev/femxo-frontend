import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockBackend } from "../mock/backend";
import { priceLines } from "../mock/domain/pricing";
import type { SeedVariant } from "../mock/domain/types";
import { createAuthApi } from "./auth-api";
import { createCartApi } from "./cart-api";
import { withAuth } from "./with-auth";

const NOW = Date.UTC(2026, 9, 24, 5, 0);
const DAY = 86_400_000;

let token: string | undefined;
let backend: ReturnType<typeof createMockBackend>;
let cart: ReturnType<typeof createCartApi>;
let auth: ReturnType<typeof createAuthApi>;

beforeEach(() => {
  token = undefined;
  backend = createMockBackend({ storage: "memory", latency: false, realNow: () => NOW });
  const adapter = withAuth(backend.adapter, () => token);
  cart = createCartApi(adapter);
  auth = createAuthApi(adapter);
});

/** Plenty of stock, so a test only runs into the limit it sets up. */
const variants = (count = Infinity): SeedVariant[] =>
  backend.catalog.products.flatMap((product) => product.variants).filter((variant) => variant.stock >= 50 && variant.maxPerOrder >= 5).slice(0, count);

async function setStock(variant: SeedVariant, stock: number) {
  const state = await backend.store.load();
  state.stock[variant.id] = stock;
  await backend.store.save(state);
  backend.adapter.controls.reload();
}

async function signIn(mobile = "9000000003") {
  const challenge = await auth.requestOtp(mobile);
  token = (await auth.verifyOtp(challenge.requestId, "123456")).accessToken;
}

describe("a guest's cart", () => {
  it("starts empty and expires 7 days after its last change", async () => {
    const empty = await cart.get();
    expect(empty).toMatchObject({ lines: [], itemCount: 0, coupon: null });
    expect(empty.breakup.total).toBe(0);
    expect(Date.parse(empty.expiresAt)).toBe(NOW + 7 * DAY);
  });

  it("adds a variant, and adds to the line when it's added again", async () => {
    const [variant] = variants(1);
    await cart.add(variant!.id, 2);
    const result = await cart.add(variant!.id, 1);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ quantity: 3, unitPrice: variant!.price, lineTotal: variant!.price * 3, available: variant!.stock });
    expect(result.itemCount).toBe(3);
    expect((await cart.get()).itemCount).toBe(3);
  });

  it("prices the bill the way checkout will", async () => {
    const [a, b] = variants(2);
    await cart.add(a!.id, 2);
    const result = await cart.add(b!.id, 1);
    const expected = priceLines(
      [
        { ...a!, quantity: 2 },
        { ...b!, quantity: 1 },
      ],
      { member: false }
    );
    expect(result.breakup).toEqual(expected);
  });

  it("changes a quantity, and removes a line", async () => {
    const [a, b] = variants(2);
    await cart.add(a!.id, 1);
    const added = await cart.add(b!.id, 1);
    const changed = await cart.setQuantity(added.lines[0]!.id, 4);
    expect(changed.lines[0]!.quantity).toBe(4);
    const removed = await cart.remove(added.lines[1]!.id);
    expect(removed.lines).toHaveLength(1);
    await expect(cart.remove("line-nope")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("refuses more than is in stock with a 409 that says how many are left, and leaves the cart alone", async () => {
    const [variant] = variants(1);
    await setStock(variant!, 3);
    await cart.add(variant!.id, 2);
    await expect(cart.add(variant!.id, 2)).rejects.toMatchObject({ status: 409, code: "OUT_OF_STOCK", details: { variantId: variant!.id, available: 3 } });
    expect((await cart.get()).itemCount).toBe(2);
  });

  it("refuses an out-of-stock variant, and more than the per-order limit", async () => {
    const [variant] = variants(1);
    await expect(cart.add(variant!.id, variant!.maxPerOrder + 1)).rejects.toMatchObject({
      status: 409,
      code: "OUT_OF_STOCK",
      details: { available: variant!.maxPerOrder },
    });
    await setStock(variant!, 0);
    await expect(cart.add(variant!.id, 1)).rejects.toMatchObject({ status: 409, details: { available: 0 } });
  });

  it("rejects an unknown variant, a zero quantity and a fractional one", async () => {
    await expect(cart.add("var-nope", 1)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    const [variant] = variants(1);
    await expect(cart.add(variant!.id, 0)).rejects.toMatchObject({ status: 422, code: "VALIDATION_FAILED" });
    await expect(cart.add(variant!.id, 1.5)).rejects.toMatchObject({ status: 422 });
  });

  it("is told it expired (410), then gets a fresh empty cart", async () => {
    const [variant] = variants(1);
    await cart.add(variant!.id, 1);
    backend.clock.advance(7 * DAY + 1000);
    await expect(cart.get()).rejects.toMatchObject({ status: 410, code: "CART_EXPIRED" });
    expect((await cart.get()).lines).toEqual([]);
  });

  it("keeps a cart alive by changing it: the 7 days run from the last change", async () => {
    const [variant] = variants(1);
    await cart.add(variant!.id, 1);
    backend.clock.advance(6 * DAY);
    await cart.add(variant!.id, 1);
    backend.clock.advance(6 * DAY);
    expect((await cart.get()).itemCount).toBe(2);
  });
});

describe("coupons", () => {
  async function cartWorth(paise: number) {
    const variant = variants().sort((a, b) => b.price - a.price).find((entry) => entry.price * 2 >= paise)!;
    return cart.add(variant.id, 2);
  }

  it("applies a coupon and shows its discount in the bill", async () => {
    const before = await cartWorth(40000);
    const after = await cart.applyCoupon("flat50");
    expect(after.coupon).toEqual({ code: "FLAT50", label: "₹50 off orders above ₹299" });
    expect(after.breakup.couponDiscount).toBe(5000);
    expect(after.breakup.total).toBe(before.breakup.total - 5000);
    expect((await cart.removeCoupon()).coupon).toBeNull();
  });

  it.each([
    ["NOPE", "not_found"],
    ["OLD20", "expired"],
    ["FEST25", "exhausted"],
    ["PRIME15", "prime_only"],
  ])("refuses %s: %s", async (code, reason) => {
    await cartWorth(40000);
    await expect(cart.applyCoupon(code)).rejects.toMatchObject({ status: 422, code: "COUPON_INVALID", details: { reason } });
  });

  it("refuses a coupon the cart is too small for, and says how much it needs", async () => {
    const cheap = variants().find((variant) => variant.price < 15000)!;
    await cart.add(cheap.id, 1);
    await expect(cart.applyCoupon("FLAT50")).rejects.toMatchObject({ details: { reason: "min_cart", minCart: 29900 } });
  });

  it("refuses a first-order coupon to someone who has ordered before", async () => {
    await signIn("9000000002");
    await cartWorth(60000);
    await expect(cart.applyCoupon("WELCOME100")).rejects.toMatchObject({ details: { reason: "first_order_only" } });
  });

  it("lets a Prime member use a Prime coupon", async () => {
    await signIn("9000000003");
    await cartWorth(40000);
    expect((await cart.applyCoupon("PRIME15")).breakup.couponDiscount).toBeGreaterThan(0);
  });

  it("drops a coupon the cart no longer qualifies for", async () => {
    const variant = variants().find((entry) => entry.price >= 15000 && entry.price < 30000)!;
    const two = await cart.add(variant.id, 2);
    await cart.applyCoupon("FLAT50");
    const one = await cart.setQuantity(two.lines[0]!.id, 1);
    expect(one.coupon).toBeNull();
    expect(one.breakup.couponDiscount).toBe(0);
  });
});

describe("signing in", () => {
  it("gives a Prime member Prime prices and free delivery", async () => {
    await signIn("9000000003");
    const [variant] = variants(1);
    const result = await cart.add(variant!.id, 1);
    expect(result.lines[0]).toMatchObject({ unitPrice: variant!.primePrice });
    expect(result.breakup.delivery).toBe(0);
  });

  it("keeps each customer's cart separate from the guest's", async () => {
    const [a, b] = variants(2);
    await cart.add(a!.id, 1);
    await signIn("9000000002");
    expect((await cart.get()).lines).toEqual([]);
    await cart.add(b!.id, 1);
    expect((await cart.get()).lines.map((line) => line.variant.id)).toEqual([b!.id]);
  });

  it("merges the guest's cart into the customer's, adding quantities of the same item", async () => {
    const [a, b] = variants(2);
    await signIn("9000000002");
    await cart.add(a!.id, 1);
    token = undefined;
    await cart.add(a!.id, 2);
    await cart.add(b!.id, 1);
    await signIn("9000000002");
    const merged = await cart.merge();
    expect(merged.lines.map((line) => [line.variant.id, line.quantity])).toEqual([
      [a!.id, 3],
      [b!.id, 1],
    ]);
    token = undefined;
    expect((await cart.get()).lines).toEqual([]);
  });

  it("caps a merge at the per-order limit and at stock instead of failing", async () => {
    const [a, b] = variants(2);
    await signIn("9000000002");
    await cart.add(a!.id, a!.maxPerOrder - 1);
    await setStock(b!, 2);
    token = undefined;
    await cart.add(a!.id, 3);
    await cart.add(b!.id, 2);
    await setStock(b!, 1);
    await signIn("9000000002");
    const merged = await cart.merge();
    expect(merged.lines.find((line) => line.variant.id === a!.id)!.quantity).toBe(a!.maxPerOrder);
    expect(merged.lines.find((line) => line.variant.id === b!.id)!.quantity).toBe(1);
  });

  it("needs a signed-in customer to merge", async () => {
    await expect(cart.merge()).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });
});

describe("a coupon picked as a guest", () => {
  it("is kept through sign-in, as long as the cart still qualifies for it", async () => {
    const variant = variants().sort((a, b) => b.price - a.price)[0]!;
    await cart.add(variant.id, 2);
    await cart.applyCoupon("FLAT50");
    await signIn("9000000002");
    const merged = await cart.merge();
    expect(merged.coupon).toMatchObject({ code: "FLAT50" });
    expect(merged.breakup.couponDiscount).toBe(5000);
  });

  it("is dropped if it doesn't apply to the customer (a first-order coupon, for someone who has ordered before)", async () => {
    const variant = variants().sort((a, b) => b.price - a.price)[0]!;
    await cart.add(variant.id, 3);
    await cart.applyCoupon("WELCOME100");
    await signIn("9000000002");
    const merged = await cart.merge();
    expect(merged.lines).toHaveLength(1);
    expect(merged.coupon).toBeNull();
    expect(merged.breakup.couponDiscount).toBe(0);
  });
});
