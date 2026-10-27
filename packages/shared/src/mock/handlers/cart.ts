import { z } from "zod";
import { failure, MockHttpError } from "../../adapters/mock/errors";
import type { MockContext, MockResult, MockRouter } from "../../adapters/mock/router";
import type { CouponRefusal } from "../../contracts/commerce";
import { newId } from "../../lib/ids";
import { CART_TTL_MS, emptyStoredCart, hasOrdered, indexVariants, itemsTotal, liveCoupon, purchaseLimit, toCart } from "../domain/cart-view";
import type { Shopper } from "../domain/cart-view";
import { checkCoupon } from "../domain/coupons";
import { isPrimeMember } from "../domain/membership";
import type { Catalog, MockState, StoredCart } from "../domain/types";
import { authenticate } from "./auth";

const AddLine = z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1).max(99) });
const SetQuantity = z.object({ quantity: z.number().int().min(1).max(99) });
const ApplyCoupon = z.object({ code: z.string().trim().min(1).max(30) });

const REFUSALS: Record<CouponRefusal, string> = {
  not_found: "That coupon code isn't valid.",
  expired: "That coupon has expired.",
  exhausted: "That coupon has been fully used.",
  min_cart: "Add a little more to your cart to use that coupon.",
  prime_only: "That coupon is for Prime members.",
  first_order_only: "That coupon is only for a first order.",
};

/**
 * The cart endpoints. A signed-in customer has one cart; a guest fills the
 * cart named by the guest-cart cookie (kept in state like the refresh
 * cookie), and signing in merges it into the customer's.
 */
export function registerCartRoutes(router: MockRouter<MockState>, catalog: Catalog) {
  const variants = indexVariants(catalog);

  /** Who is asking: a customer (valid token), or a guest. A token that's present but bad is a 401. */
  function shopper(ctx: MockContext<MockState>): Shopper {
    if (!ctx.accessToken) return { customerId: null, member: false };
    const { customer } = authenticate(ctx);
    return { customerId: customer.id, member: isPrimeMember(ctx.state, customer.id, ctx.clock.now()) };
  }

  const ownerKey = (state: MockState, who: Shopper) => who.customerId ?? state.guestCartId ?? null;

  /** The shopper's stored cart, if they have one; an expired one is removed and reported. */
  function find(ctx: MockContext<MockState>, who: Shopper): { cart?: StoredCart; expired?: true } {
    const key = ownerKey(ctx.state, who);
    const cart = key ? ctx.state.carts[key] : undefined;
    if (!key || !cart) return {};
    if (ctx.clock.now() >= cart.updatedAt + CART_TTL_MS) {
      delete ctx.state.carts[key];
      if (!who.customerId) ctx.state.guestCartId = null;
      return { expired: true };
    }
    return { cart };
  }

  // Answered with failure() rather than thrown, so the removal of the expired cart is kept.
  const expiredAnswer = () => failure(410, "CART_EXPIRED", "Your cart expired, so we've started a fresh one.");

  /** The cart to change: the existing one, or a new one created for this shopper. */
  function forWrite(ctx: MockContext<MockState>, who: Shopper): { cart: StoredCart } | { expired: true } {
    const found = find(ctx, who);
    if (found.expired) return { expired: true };
    if (found.cart) return { cart: found.cart };
    const cart: StoredCart = { id: newId("crt"), lines: [], couponCode: null, updatedAt: ctx.clock.now() };
    if (who.customerId) ctx.state.carts[who.customerId] = cart;
    else {
      ctx.state.carts[cart.id] = cart;
      ctx.state.guestCartId = cart.id;
    }
    return { cart };
  }

  /** After any change: stamp it, and drop a coupon the cart no longer qualifies for. */
  function settle(ctx: MockContext<MockState>, cart: StoredCart, who: Shopper): MockResult {
    cart.updatedAt = ctx.clock.now();
    if (cart.couponCode && !liveCoupon(cart, ctx.state, variants, who, cart.updatedAt)) cart.couponCode = null;
    return { status: 200, body: toCart(cart, catalog, ctx.state, variants, who, cart.updatedAt) };
  }

  function overLimit(variantId: string, wanted: number, state: MockState) {
    const { variant } = variants.get(variantId)!;
    const limit = purchaseLimit(variant, state);
    if (wanted <= limit) return null;
    const message =
      limit === 0
        ? "That item is out of stock."
        : limit < variant.maxPerOrder
          ? `Only ${limit} left in stock.`
          : `You can buy up to ${variant.maxPerOrder} of this per order.`;
    return new MockHttpError(409, "OUT_OF_STOCK", message, { variantId, available: limit });
  }

  router.get("/cart", (ctx): MockResult => {
    const who = shopper(ctx);
    const found = find(ctx, who);
    // A GET isn't saved, so the expired cart goes on the next write; the shopper is told either way.
    if (found.expired) return expiredAnswer();
    const cart = found.cart ?? emptyStoredCart(ctx.clock.now());
    return { status: 200, body: toCart(cart, catalog, ctx.state, variants, who, cart.updatedAt) };
  });

  router.post("/cart/lines", (ctx): MockResult => {
    const who = shopper(ctx);
    const { variantId, quantity } = AddLine.parse(ctx.body);
    if (!variants.has(variantId)) throw new MockHttpError(404, "NOT_FOUND", "We couldn't find that item.");
    const target = forWrite(ctx, who);
    if ("expired" in target) return expiredAnswer();
    const existing = target.cart.lines.find((line) => line.variantId === variantId);
    const refusal = overLimit(variantId, (existing?.quantity ?? 0) + quantity, ctx.state);
    if (refusal) throw refusal;
    if (existing) existing.quantity += quantity;
    else target.cart.lines.push({ id: newId("line"), variantId, quantity });
    return settle(ctx, target.cart, who);
  });

  router.patch("/cart/lines/:lineId", (ctx): MockResult => {
    const who = shopper(ctx);
    const { quantity } = SetQuantity.parse(ctx.body);
    const found = find(ctx, who);
    if (found.expired) return expiredAnswer();
    const line = found.cart?.lines.find((entry) => entry.id === ctx.params.lineId);
    if (!found.cart || !line) throw new MockHttpError(404, "NOT_FOUND", "That item isn't in your cart.");
    const refusal = overLimit(line.variantId, quantity, ctx.state);
    if (refusal) throw refusal;
    line.quantity = quantity;
    return settle(ctx, found.cart, who);
  });

  router.delete("/cart/lines/:lineId", (ctx): MockResult => {
    const who = shopper(ctx);
    const found = find(ctx, who);
    if (found.expired) return expiredAnswer();
    if (!found.cart?.lines.some((entry) => entry.id === ctx.params.lineId)) throw new MockHttpError(404, "NOT_FOUND", "That item isn't in your cart.");
    found.cart.lines = found.cart.lines.filter((entry) => entry.id !== ctx.params.lineId);
    return settle(ctx, found.cart, who);
  });

  router.post("/cart/coupon", (ctx): MockResult => {
    const who = shopper(ctx);
    const code = ApplyCoupon.parse(ctx.body).code.toUpperCase();
    const found = find(ctx, who);
    if (found.expired) return expiredAnswer();
    const cart = found.cart ?? emptyStoredCart(ctx.clock.now());
    const check = checkCoupon(ctx.state.coupons[code], {
      itemsTotal: itemsTotal(cart, variants, who.member),
      member: who.member,
      hasOrders: hasOrdered(ctx.state, who.customerId),
      now: ctx.clock.now(),
    });
    if (!check.ok) {
      const details = check.minCart === undefined ? { reason: check.reason } : { reason: check.reason, minCart: check.minCart };
      throw new MockHttpError(422, "COUPON_INVALID", REFUSALS[check.reason], details);
    }
    // A valid coupon can't be attached to a cart that doesn't exist yet; with no items it never reaches here (min cart).
    const target = found.cart ?? (forWrite(ctx, who) as { cart: StoredCart }).cart;
    target.couponCode = code;
    return settle(ctx, target, who);
  });

  router.delete("/cart/coupon", (ctx): MockResult => {
    const who = shopper(ctx);
    const found = find(ctx, who);
    if (found.expired) return expiredAnswer();
    if (!found.cart) return { status: 200, body: toCart(emptyStoredCart(ctx.clock.now()), catalog, ctx.state, variants, who, ctx.clock.now()) };
    found.cart.couponCode = null;
    return settle(ctx, found.cart, who);
  });

  /** After sign-in: the guest cart's items join the customer's cart, trimmed to stock and the per-order limit. */
  router.post("/cart/merge", (ctx): MockResult => {
    if (!ctx.accessToken) throw new MockHttpError(401, "UNAUTHENTICATED", "Please sign in to continue.");
    const who = shopper(ctx);
    const guest = ctx.state.guestCartId ? ctx.state.carts[ctx.state.guestCartId] : undefined;
    const mine = forWrite(ctx, who);
    if ("expired" in mine) return expiredAnswer();
    if (guest && ctx.clock.now() < guest.updatedAt + CART_TTL_MS) {
      for (const line of guest.lines) {
        const target = mine.cart.lines.find((entry) => entry.variantId === line.variantId);
        const room = purchaseLimit(variants.get(line.variantId)!.variant, ctx.state);
        const quantity = Math.min((target?.quantity ?? 0) + line.quantity, room);
        if (quantity <= 0) continue;
        if (target) target.quantity = quantity;
        else mine.cart.lines.push({ id: newId("line"), variantId: line.variantId, quantity });
      }
    }
    // A coupon chosen as a guest comes along unless the customer already has one; settle() drops it if it no longer applies.
    if (guest && ctx.clock.now() < guest.updatedAt + CART_TTL_MS && guest.couponCode && !mine.cart.couponCode) mine.cart.couponCode = guest.couponCode;
    if (guest) delete ctx.state.carts[guest.id];
    ctx.state.guestCartId = null;
    return settle(ctx, mine.cart, who);
  });
}
