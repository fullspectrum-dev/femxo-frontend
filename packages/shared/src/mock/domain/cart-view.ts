import type { Cart, CartLine } from "../../contracts/commerce";
import { checkCoupon } from "./coupons";
import { stockFor, toProductSummary, toVariant } from "./mappers";
import { priceLines } from "./pricing";
import type { Catalog, MockState, SeedProduct, SeedVariant, StoredCart } from "./types";

export const CART_TTL_MS = 7 * 24 * 3600 * 1000;

export interface VariantEntry {
  product: SeedProduct;
  variant: SeedVariant;
}

/** Every variant by id, so a cart line can find its product. */
export function indexVariants(catalog: Catalog) {
  const index = new Map<string, VariantEntry>();
  for (const product of catalog.products) for (const variant of product.variants) index.set(variant.id, { product, variant });
  return index;
}

/** The most of a variant one cart can hold: what's in stock, or the per-order limit if that's lower. */
export const purchaseLimit = (variant: SeedVariant, state: MockState) => Math.min(stockFor(state)(variant), variant.maxPerOrder);

export interface Shopper {
  customerId: string | null;
  member: boolean;
}

/** What the shopper would pay for these lines before any coupon (paise). */
export function itemsTotal(cart: StoredCart, variants: Map<string, VariantEntry>, member: boolean) {
  return cart.lines.reduce((sum, line) => {
    const entry = variants.get(line.variantId);
    return entry ? sum + (member ? entry.variant.primePrice : entry.variant.price) * line.quantity : sum;
  }, 0);
}

export const hasOrdered = (state: MockState, customerId: string | null) =>
  customerId !== null && Object.values(state.orders).some((order) => order.customerId === customerId);

/** The coupon on a cart only counts while the cart still qualifies for it. */
export function liveCoupon(cart: StoredCart, state: MockState, variants: Map<string, VariantEntry>, shopper: Shopper, now: number) {
  if (!cart.couponCode) return null;
  const coupon = state.coupons[cart.couponCode];
  const check = checkCoupon(coupon, {
    itemsTotal: itemsTotal(cart, variants, shopper.member),
    member: shopper.member,
    hasOrders: hasOrdered(state, shopper.customerId),
    now,
  });
  return check.ok && coupon ? { coupon, discount: check.discount } : null;
}

/** An empty cart that isn't stored anywhere yet (nothing has been added). */
export const emptyStoredCart = (now: number): StoredCart => ({ id: "crt-empty", lines: [], couponCode: null, updatedAt: now });

/** The Cart the API returns: stored variants and counts, priced and stock-checked as of now. */
export function toCart(stored: StoredCart, catalog: Catalog, state: MockState, variants: Map<string, VariantEntry>, shopper: Shopper, nowMs: number): Cart {
  const now = new Date(nowMs);
  const stock = stockFor(state);
  const lines: CartLine[] = [];
  for (const line of stored.lines) {
    const entry = variants.get(line.variantId);
    if (!entry) continue;
    const unitPrice = shopper.member ? entry.variant.primePrice : entry.variant.price;
    lines.push({
      id: line.id,
      product: toProductSummary(entry.product, catalog, stock),
      variant: toVariant(entry.variant, now, stock),
      quantity: line.quantity,
      unitPrice,
      lineTotal: unitPrice * line.quantity,
      available: stock(entry.variant),
    });
  }

  const applied = liveCoupon(stored, state, variants, shopper, nowMs);
  const breakup = priceLines(
    stored.lines.flatMap((line) => {
      const entry = variants.get(line.variantId);
      return entry ? [{ ...entry.variant, quantity: line.quantity }] : [];
    }),
    { member: shopper.member, couponDiscount: applied?.discount ?? 0 }
  );

  return {
    id: stored.id,
    lines,
    coupon: applied ? { code: applied.coupon.code, label: applied.coupon.label } : null,
    breakup,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    expiresAt: new Date(stored.updatedAt + CART_TTL_MS).toISOString(),
  };
}
