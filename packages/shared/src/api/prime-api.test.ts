import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockBackend } from "../mock/backend";
import { DAY } from "../mock/domain/order-lifecycle";
import { createAuthApi } from "./auth-api";
import { createCartApi } from "./cart-api";
import { createOrdersApi } from "./orders-api";
import { createPaymentApi } from "./payment-api";
import { createPrimeApi } from "./prime-api";
import { withAuth } from "./with-auth";

const NOW = Date.UTC(2026, 9, 24, 5, 0);

let token: string | undefined;
let backend: ReturnType<typeof createMockBackend>;
let auth: ReturnType<typeof createAuthApi>;
let prime: ReturnType<typeof createPrimeApi>;
let payments: ReturnType<typeof createPaymentApi>;
let orders: ReturnType<typeof createOrdersApi>;
let cart: ReturnType<typeof createCartApi>;

beforeEach(() => {
  token = undefined;
  backend = createMockBackend({ storage: "memory", latency: false, realNow: () => NOW });
  const adapter = withAuth(backend.adapter, () => token);
  auth = createAuthApi(adapter);
  prime = createPrimeApi(adapter);
  payments = createPaymentApi(adapter);
  orders = createOrdersApi(adapter);
  cart = createCartApi(adapter);
});

async function signIn(mobile: string) {
  const challenge = await auth.requestOtp(mobile);
  token = (await auth.verifyOtp(challenge.requestId, "123456")).accessToken;
}

const REGULAR = "9000000002";
const MEMBER = "9000000003"; // Pooja, annual plan, birthday today
const LAPSED = "9000000004"; // Arif, monthly plan that ended 40 days ago

describe("plans", () => {
  it("are public: monthly, quarterly and annual, with their benefits", async () => {
    const plans = await prime.plans();
    expect(plans.map((plan) => plan.id)).toEqual(["pln-monthly", "pln-quarterly", "pln-annual"]);
    expect(plans.every((plan) => plan.benefits.length > 0 && plan.price > 0)).toBe(true);
  });
});

describe("membership", () => {
  it("is for signed-in customers only", async () => {
    await expect(prime.membership()).rejects.toMatchObject({ status: 401 });
  });

  it("is empty for a customer who never joined", async () => {
    await signIn(REGULAR);
    expect(await prime.membership()).toEqual({ membership: null, active: false });
  });

  it("is active for a member, with their card details", async () => {
    await signIn(MEMBER);
    const { membership, active } = await prime.membership();
    expect(active).toBe(true);
    expect(membership).toMatchObject({ memberId: "FXP-000231", qrPayload: "femxo:prime:FXP-000231" });
  });

  it("shows a lapsed member's old card, as not active", async () => {
    await signIn(LAPSED);
    const { membership, active } = await prime.membership();
    expect(active).toBe(false);
    expect(membership?.memberId).toBe("FXP-000118");
  });
});

describe("joining", () => {
  it("needs sign-in and a real plan", async () => {
    await expect(prime.purchase("pln-monthly")).rejects.toMatchObject({ status: 401 });
    await signIn(REGULAR);
    await expect(prime.purchase("pln-nope")).rejects.toMatchObject({ status: 404 });
  });

  it("starts a payment for the plan's price, and isn't a member until it is paid", async () => {
    await signIn(REGULAR);
    const { order, intent } = await prime.purchase("pln-quarterly");
    expect(order).toMatchObject({ total: 26900, kind: "prime", paymentStatus: "pending" });
    expect(intent).toMatchObject({ amount: 26900, status: "created", attempt: 1 });
    expect((await prime.membership()).active).toBe(false);
  });

  it("makes the customer a member once paid: Prime prices, free delivery, isPrime", async () => {
    await signIn(REGULAR);
    const { intent } = await prime.purchase("pln-quarterly");
    await payments.confirm(intent.id, "success");
    const { membership, active } = await prime.membership();
    expect(active).toBe(true);
    expect(membership!.plan.id).toBe("pln-quarterly");
    expect(Date.parse(membership!.validTill) - Date.parse(membership!.startedAt)).toBe(90 * DAY);
    expect(membership!.memberId).toMatch(/^FXP-\d{6}$/);
    expect(membership!.qrPayload).toBe(`femxo:prime:${membership!.memberId}`);
    expect((await auth.me()).isPrime).toBe(true);

    const variant = backend.catalog.products.flatMap((product) => product.variants).find((entry) => entry.stock >= 50 && entry.maxPerOrder >= 2)!;
    const added = await cart.add(variant.id, 1);
    expect(added.lines[0]!.unitPrice).toBe(variant.primePrice);
    expect(added.breakup.delivery).toBe(0);
  });

  it("leaves the customer a non-member when the payment fails, and can be retried", async () => {
    await signIn(REGULAR);
    const { order, intent } = await prime.purchase("pln-monthly");
    await payments.confirm(intent.id, "failure");
    expect((await prime.membership()).active).toBe(false);
    const again = await payments.retry(order.id);
    await payments.confirm(again.id, "success");
    expect((await prime.membership()).active).toBe(true);
  });

  it("is one membership however often the payment is confirmed", async () => {
    await signIn(REGULAR);
    const { intent } = await prime.purchase("pln-monthly");
    await payments.confirm(intent.id, "success");
    const first = (await prime.membership()).membership!;
    await payments.confirm(intent.id, "success");
    expect((await prime.membership()).membership).toEqual(first);
  });

  it("extends an active membership from where it ends", async () => {
    await signIn(MEMBER);
    const before = (await prime.membership()).membership!;
    const { intent } = await prime.purchase("pln-monthly");
    await payments.confirm(intent.id, "success");
    const after = (await prime.membership()).membership!;
    expect(after.memberId).toBe(before.memberId);
    expect(Date.parse(after.validTill)).toBe(Date.parse(before.validTill) + 30 * DAY);
  });

  it("restarts a lapsed membership from now, keeping the member number", async () => {
    await signIn(LAPSED);
    const { intent } = await prime.purchase("pln-monthly");
    await payments.confirm(intent.id, "success");
    const { membership, active } = await prime.membership();
    expect(active).toBe(true);
    expect(membership!.memberId).toBe("FXP-000118");
    expect(Date.parse(membership!.validTill)).toBe(NOW + 30 * DAY);
  });

  it("shows up in the order history as a membership, not a parcel", async () => {
    await signIn(REGULAR);
    const { order, intent } = await prime.purchase("pln-monthly");
    await payments.confirm(intent.id, "success");
    const detail = await orders.get(order.id);
    expect(detail).toMatchObject({ kind: "prime", status: "delivered", paymentStatus: "paid", canCancel: false, canReturnUntil: null });
    expect(detail.lines[0]!.product.name).toBe("Prime Monthly");
    expect((await orders.list()).items[0]!.id).toBe(order.id);
  });
});

describe("member perks", () => {
  it("coupons are for members: they see the Prime-only ones that are still good", async () => {
    await signIn(REGULAR);
    await expect(prime.coupons()).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    await signIn(MEMBER);
    const coupons = await prime.coupons();
    expect(coupons.map((coupon) => coupon.code)).toContain("PRIME15");
    expect(coupons.every((coupon) => coupon.primeOnly && Date.parse(coupon.validTill) > NOW)).toBe(true);
  });

  it("a referral link comes with membership, and counts what it has brought in", async () => {
    await signIn(REGULAR);
    await expect(prime.referral()).rejects.toMatchObject({ status: 403 });
    await signIn(MEMBER);
    expect(await prime.referral()).toMatchObject({ code: "POOJA50", link: expect.stringContaining("POOJA50"), invited: 9, joined: 4 });
    const { intent } = await (async () => {
      await signIn(REGULAR);
      return prime.purchase("pln-monthly");
    })();
    await payments.confirm(intent.id, "success");
    expect(await prime.referral()).toMatchObject({ invited: 0, joined: 0 });
  });

  it("a birthday reward appears on the birthday, for plans that include it", async () => {
    await signIn(MEMBER);
    const reward = await prime.birthday();
    expect(reward).not.toBeNull();
    expect(reward!.coupon).toMatchObject({ primeOnly: true });
    expect(reward!.message).toMatch(/birthday/i);
  });

  it("doesn't appear on any other day, for non-members, or on a plan without the benefit", async () => {
    await signIn(REGULAR);
    expect(await prime.birthday()).toBeNull();

    backend.clock.advance(DAY);
    await signIn(MEMBER);
    expect(await prime.birthday()).toBeNull();

    backend.clock.reset();
    await signIn(LAPSED);
    const { intent } = await prime.purchase("pln-monthly");
    await payments.confirm(intent.id, "success");
    expect(await prime.birthday()).toBeNull();
  });

  it("the birthday coupon works on the member's cart", async () => {
    await signIn(MEMBER);
    const reward = (await prime.birthday())!;
    const variant = backend.catalog.products.flatMap((product) => product.variants).filter((entry) => entry.stock >= 50 && entry.maxPerOrder >= 5).sort((a, b) => b.price - a.price)[0]!;
    await cart.add(variant.id, 3);
    expect((await cart.applyCoupon(reward.coupon.code)).breakup.couponDiscount).toBeGreaterThan(0);
  });
});
