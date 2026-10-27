import { z } from "zod";
import { MockHttpError } from "../../adapters/mock/errors";
import type { MockContext, MockResult, MockRouter } from "../../adapters/mock/router";
import { PaymentMethod } from "../../contracts/commerce";
import type { CheckoutSession, DeliveryOption, OrderLine } from "../../contracts/commerce";
import { newId } from "../../lib/ids";
import { CART_TTL_MS, indexVariants, liveCoupon, toCart } from "../domain/cart-view";
import type { Shopper } from "../domain/cart-view";
import { stockFor } from "../domain/mappers";
import { isPrimeMember } from "../domain/membership";
import { canCancel } from "../domain/order-lifecycle";
import { intentView, newIntent, nextOrderNumber, toOrderSummary } from "../domain/payments";
import type { Catalog, MockState, StoredCheckout, StoredOrder } from "../domain/types";
import { authenticate } from "./auth";

/** Cash on delivery only for orders up to ₹2,000. */
export const COD_LIMIT = 200_000;
const DEFAULT_ETA = { min: 2, max: 4 };

const Update = z.object({ addressId: z.string().min(1).optional(), deliveryId: z.literal("standard").optional() });
const PlaceOrder = z.object({ method: PaymentMethod });

/** Checkout: choose an address and delivery for the cart, then place the order. */
export function registerCheckoutRoutes(router: MockRouter<MockState>, catalog: Catalog) {
  const variants = indexVariants(catalog);

  function who(ctx: MockContext<MockState>): Shopper & { customerId: string } {
    const { customer } = authenticate(ctx);
    return { customerId: customer.id, member: isPrimeMember(ctx.state, customer.id, ctx.clock.now()) };
  }

  /** The cart being checked out; an empty or expired one is a 422 (nothing to buy). */
  function cartOf(ctx: MockContext<MockState>, shopper: Shopper & { customerId: string }) {
    const stored = ctx.state.carts[shopper.customerId];
    if (!stored || stored.lines.length === 0 || ctx.clock.now() >= stored.updatedAt + CART_TTL_MS) {
      throw new MockHttpError(422, "VALIDATION_FAILED", "Your cart is empty.");
    }
    return stored;
  }

  function find(ctx: MockContext<MockState>, customerId: string): StoredCheckout {
    const checkout = ctx.state.checkouts?.[ctx.params.id!];
    if (!checkout || checkout.customerId !== customerId) throw new MockHttpError(404, "NOT_FOUND", "We couldn't find that checkout. Start again from your cart.");
    return checkout;
  }

  function view(ctx: MockContext<MockState>, checkout: StoredCheckout, shopper: Shopper & { customerId: string }): CheckoutSession {
    const stored = cartOf(ctx, shopper);
    const cart = toCart(stored, catalog, ctx.state, variants, shopper, ctx.clock.now());
    const address = (ctx.state.addresses[shopper.customerId] ?? []).find((entry) => entry.id === checkout.addressId) ?? null;
    const place = address ? ctx.state.pincodes[address.pincode] : undefined;
    const standard: DeliveryOption = { id: "standard", label: "Standard delivery", fee: cart.breakup.delivery, etaDays: place?.etaDays ?? DEFAULT_ETA };
    return {
      id: checkout.id,
      cartId: cart.id,
      address,
      delivery: checkout.deliveryId ? standard : null,
      options: [standard],
      breakup: cart.breakup,
      codAllowed: Boolean(address && place?.codAvailable && cart.breakup.total <= COD_LIMIT),
    };
  }

  router.post("/checkout", (ctx): MockResult => {
    const shopper = who(ctx);
    cartOf(ctx, shopper);
    const book = ctx.state.addresses[shopper.customerId] ?? [];
    const servable = book.filter((entry) => ctx.state.pincodes[entry.pincode]?.serviceable);
    const checkouts = (ctx.state.checkouts ??= {});
    // One checkout at a time per customer: starting again replaces the old one.
    for (const [id, entry] of Object.entries(checkouts)) if (entry.customerId === shopper.customerId) delete checkouts[id];
    const checkout: StoredCheckout = { id: newId("chk"), customerId: shopper.customerId, addressId: (servable.find((entry) => entry.isDefault) ?? servable[0])?.id ?? null, deliveryId: null };
    checkouts[checkout.id] = checkout;
    return { status: 200, body: view(ctx, checkout, shopper) };
  });

  router.get("/checkout/:id", (ctx): MockResult => {
    const shopper = who(ctx);
    return { status: 200, body: view(ctx, find(ctx, shopper.customerId), shopper) };
  });

  router.patch("/checkout/:id", (ctx): MockResult => {
    const shopper = who(ctx);
    const checkout = find(ctx, shopper.customerId);
    const { addressId, deliveryId } = Update.parse(ctx.body);
    if (addressId !== undefined) {
      const address = (ctx.state.addresses[shopper.customerId] ?? []).find((entry) => entry.id === addressId);
      if (!address) throw new MockHttpError(404, "NOT_FOUND", "We couldn't find that address.");
      if (!ctx.state.pincodes[address.pincode]?.serviceable) {
        throw new MockHttpError(422, "NOT_SERVICEABLE", `Sorry, we don't deliver to ${address.pincode} yet.`, { pincode: address.pincode });
      }
      checkout.addressId = addressId;
    }
    if (deliveryId !== undefined) checkout.deliveryId = deliveryId;
    return { status: 200, body: view(ctx, checkout, shopper) };
  });

  router.post("/checkout/:id/order", (ctx): MockResult => {
    const shopper = who(ctx);
    const checkout = find(ctx, shopper.customerId);
    const { method } = PlaceOrder.parse(ctx.body);
    const session = view(ctx, checkout, shopper);
    if (!session.address) throw new MockHttpError(422, "VALIDATION_FAILED", "Choose a delivery address first.", { fields: { address: "Choose a delivery address" } });
    if (!session.delivery) throw new MockHttpError(422, "VALIDATION_FAILED", "Choose how you'd like it delivered.", { fields: { delivery: "Choose a delivery option" } });
    if (method === "cod" && !session.codAllowed) {
      throw new MockHttpError(422, "VALIDATION_FAILED", "Cash on delivery isn't available for this order. Please pay online.", { fields: { method: "Cash on delivery isn't available" } });
    }

    const stored = cartOf(ctx, shopper);
    const stock = stockFor(ctx.state);
    const short = stored.lines.flatMap((line) => {
      const { variant } = variants.get(line.variantId)!;
      const available = stock(variant);
      return line.quantity > available ? [{ variantId: variant.id, available }] : [];
    });
    if (short.length > 0) throw new MockHttpError(409, "OUT_OF_STOCK", "Some items are no longer available in the quantity you chose.", { lines: short });

    const cart = toCart(stored, catalog, ctx.state, variants, shopper, ctx.clock.now());
    const now = ctx.clock.now();
    const lines: OrderLine[] = cart.lines.map(({ available: _available, ...line }) => ({
      ...line,
      id: newId("ordline"),
      returnable: variants.get(line.variant.id)!.product.returnable,
    }));
    const placedAt = new Date(now).toISOString();
    const online = method !== "cod";
    const order: StoredOrder = {
      id: newId("ord"),
      customerId: shopper.customerId,
      number: nextOrderNumber(ctx.state),
      placedAt,
      status: "placed",
      paymentStatus: online ? "pending" : "cod",
      total: cart.breakup.total,
      itemCount: cart.itemCount,
      thumbnail: lines[0]!.product.image,
      lines,
      breakup: cart.breakup,
      address: session.address,
      paymentMethod: method,
      timeline: [{ status: "placed", at: placedAt }],
      canCancel: canCancel("placed"),
      canReturnUntil: null,
      // An online order is waiting for its payment: the customer can pay now, or come back to it from their orders.
      paymentRetryable: online,
    };
    if (!online) {
      order.status = "confirmed";
      order.timeline.push({ status: "confirmed", at: placedAt });
      order.lifecycle = { confirmedAt: now };
    }

    for (const line of stored.lines) {
      const { variant } = variants.get(line.variantId)!;
      ctx.state.stock[variant.id] = stock(variant) - line.quantity;
    }
    const coupon = liveCoupon(stored, ctx.state, variants, shopper, now);
    if (coupon) ctx.state.coupons[coupon.coupon.code]!.used += 1;

    ctx.state.orders[order.id] = order;
    delete ctx.state.carts[shopper.customerId];
    delete ctx.state.checkouts![checkout.id];
    const intent = online ? intentView(newIntent(ctx.state, order)) : null;
    return { status: 200, body: { order: toOrderSummary(order), intent } };
  });
}
