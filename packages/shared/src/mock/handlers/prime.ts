import { z } from "zod";
import { MockHttpError } from "../../adapters/mock/errors";
import type { MockContext, MockResult, MockRouter } from "../../adapters/mock/router";
import type { OrderLine } from "../../contracts/commerce";
import type { BirthdayReward, Coupon } from "../../contracts/people";
import { gstIncluded } from "../../lib/gst";
import { newId } from "../../lib/ids";
import { istDate } from "../domain/mappers";
import { isPrimeMember } from "../domain/membership";
import { DAY } from "../domain/order-lifecycle";
import { intentView, newIntent, nextOrderNumber, toOrderSummary } from "../domain/payments";
import { findPlan } from "../domain/prime";
import type { MockState, StoredCoupon, StoredOrder } from "../domain/types";
import { PRIME_PLANS } from "../seed/state";
import { authenticate } from "./auth";

const Purchase = z.object({ planId: z.string().min(1) });
const GST_BPS = 1800;

/** The order record for a membership: one line, nothing to ship, nothing to deliver. */
function primeOrder(state: MockState, customerId: string, planId: string, now: number): StoredOrder {
  const plan = findPlan(planId)!;
  const customer = state.customers.find((entry) => entry.id === customerId)!;
  const tax = gstIncluded(plan.price, GST_BPS);
  const brand = { id: "brd-femxo", slug: "femxo", name: "Femxo" };
  const at = new Date(now).toISOString();
  const line: OrderLine = {
    id: newId("ordline"),
    product: {
      id: `prd-${plan.id}`,
      slug: "prime",
      name: plan.name,
      brand,
      categoryId: "cat-prime",
      image: "/images/femxo-mark.png",
      rating: 0,
      ratingCount: 0,
      fromPrice: plan.price,
      variantId: plan.id,
      variantCount: 1,
      fromPrimePrice: plan.price,
      mrp: plan.price,
      inStock: true,
      primeExclusive: false,
      badges: [],
    },
    variant: { id: plan.id, sku: plan.id.toUpperCase(), label: `${plan.durationDays} days`, mrp: plan.price, price: plan.price, primePrice: plan.price, gstBps: GST_BPS, stock: 1, maxPerOrder: 1, bestBefore: null },
    quantity: 1,
    unitPrice: plan.price,
    lineTotal: plan.price,
    returnable: false,
  };
  return {
    id: newId("ord"),
    customerId,
    number: nextOrderNumber(state),
    placedAt: at,
    status: "placed",
    paymentStatus: "pending",
    total: plan.price,
    itemCount: 1,
    thumbnail: line.product.image,
    lines: [line],
    breakup: { mrpTotal: plan.price, discount: 0, primeSavings: 0, couponDiscount: 0, delivery: 0, total: plan.price, gstIncluded: { cgst: tax.cgst, sgst: tax.sgst }, youSave: 0 },
    // A membership isn't delivered; the order record still needs an address.
    address: {
      id: "adr-none",
      name: customer.name.length >= 2 ? customer.name : "Femxo customer",
      mobile: customer.mobile,
      line1: "Digital membership, nothing to deliver",
      city: "Patna",
      district: "Patna",
      state: "Bihar",
      pincode: "800001",
      isDefault: false,
    },
    paymentMethod: "upi",
    timeline: [{ status: "placed", at }],
    canCancel: false,
    canReturnUntil: null,
    paymentRetryable: true,
    prime: { planId },
  };
}

const publicCoupon = ({ usageLimit: _limit, used: _used, firstOrderOnly: _first, ...coupon }: StoredCoupon): Coupon => coupon;

/** Prime: the plans, joining, the member's card, coupons, referral link and birthday reward. */
export function registerPrimeRoutes(router: MockRouter<MockState>) {
  /** A signed-in customer who is a member now; anyone else is refused. */
  function member(ctx: MockContext<MockState>) {
    const { customer } = authenticate(ctx);
    if (!isPrimeMember(ctx.state, customer.id, ctx.clock.now())) throw new MockHttpError(403, "FORBIDDEN", "This is for Prime members.");
    return customer;
  }

  router.get("/prime/plans", (): MockResult => ({ status: 200, body: PRIME_PLANS }));

  router.get("/prime/membership", (ctx): MockResult => {
    const { customer } = authenticate(ctx);
    const membership = ctx.state.memberships[customer.id] ?? null;
    return { status: 200, body: { membership, active: isPrimeMember(ctx.state, customer.id, ctx.clock.now()) } };
  });

  router.post("/prime/purchase", (ctx): MockResult => {
    const { customer } = authenticate(ctx);
    const { planId } = Purchase.parse(ctx.body);
    if (!findPlan(planId)) throw new MockHttpError(404, "NOT_FOUND", "We couldn't find that plan.");
    const order = primeOrder(ctx.state, customer.id, planId, ctx.clock.now());
    ctx.state.orders[order.id] = order;
    return { status: 200, body: { order: toOrderSummary(order), intent: intentView(newIntent(ctx.state, order)) } };
  });

  router.get("/prime/coupons", (ctx): MockResult => {
    member(ctx);
    const now = ctx.clock.now();
    const list = Object.values(ctx.state.coupons)
      .filter((coupon) => coupon.primeOnly && !coupon.code.startsWith("BDAY-") && Date.parse(coupon.validTill) > now)
      .map(publicCoupon);
    return { status: 200, body: list };
  });

  router.get("/prime/referral", (ctx): MockResult => {
    const customer = member(ctx);
    const referral = ctx.state.referrals[customer.id];
    if (!referral) throw new MockHttpError(404, "NOT_FOUND", "No referral link yet.");
    return { status: 200, body: referral };
  });

  /** On a member's birthday (if their plan includes it): a one-week coupon, made once per year. */
  router.get("/prime/birthday", (ctx): MockResult => {
    const { customer } = authenticate(ctx);
    const now = ctx.clock.now();
    const membership = ctx.state.memberships[customer.id];
    const stored = ctx.state.customers.find((entry) => entry.id === customer.id);
    const today = istDate(ctx.clock.date());
    const eligible = isPrimeMember(ctx.state, customer.id, now) && membership?.plan.benefits.includes("Birthday reward") && stored?.birthday?.slice(5) === today.slice(5);
    if (!eligible || !membership) return { status: 200, body: null };

    const code = `BDAY-${membership.memberId.slice(-6)}-${today.slice(0, 4)}`;
    ctx.state.coupons[code] ??= {
      code,
      label: "Birthday treat: 20% off, up to ₹300",
      kind: "percent",
      value: 2000,
      maxDiscount: 30000,
      minCart: 19900,
      primeOnly: true,
      validTill: new Date(now + 7 * DAY).toISOString(),
      usageLimit: 1,
      used: 0,
      firstOrderOnly: false,
    };
    const reward: BirthdayReward = { coupon: publicCoupon(ctx.state.coupons[code]!), message: `Happy birthday, ${customer.name.split(" ")[0]}! Here's a treat from Femxo.` };
    return { status: 200, body: reward };
  });
}
