import { CartEnvelope, type Cart, type CartEntry, type CartLine, type ServerCartLine } from "../contracts/commerce";
import type { ApiAdapter } from "./adapter";
import { STORE_BASE } from "./auth-api";
import type { ProductsApi } from "./products-api";
import { request } from "./request";

/** What a catalogue lookup gives the cart: enough to show a line (name, picture, pack, MRP). */
type Lookup = Awaited<ReturnType<ProductsApi["lookup"]>>;
type ServerCart = ReturnType<typeof CartEnvelope.parse>["cart"];

/** Joins the backend's cart (variant ids, quantities, server prices) with catalogue details. Pure, so it is tested alone. */
export function toCart(server: ServerCart, lookup: Lookup | null): Cart {
  const products = new Map((lookup?.products ?? []).map((p) => [p.id, p]));
  const line = (item: ServerCartLine): CartLine => {
    const found = lookup?.variants[item.variantId];
    const productId = item.productId ?? found?.productId ?? null;
    return {
      id: item.variantId,
      variantId: item.variantId,
      productId,
      product: productId ? (products.get(productId) ?? null) : null,
      variant: found?.variant ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPricePaise,
      lineTotal: item.linePaise,
      priceChanged: item.priceChanged,
      previousUnitPrice: item.previousUnitPricePaise,
      problem: item.problem,
      available: item.availableQty,
      inStock: item.inStock,
      sufficient: item.sufficient,
    };
  };
  const lines = server.items.map(line);
  return {
    rev: server.rev,
    tier: server.tier,
    lines,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    subtotal: server.subtotalPaise,
    delivery: server.deliveryChargePaise,
    total: server.totalPaise,
    hasPriceChange: server.hasPriceChange,
    hasStockIssue: server.hasStockIssue,
    canCheckout: server.canCheckout,
    expiresAt: server.expiresAt,
  };
}

/**
 * CartApi: the signed-in customer's cart (GET and PUT /store/v1/cart). The cart is replaced as a whole with the
 * revision the caller last saw: a cart that changed meanwhile answers 409 CART_CHANGED. The prices in an answer are
 * the server's, at the customer's tier; checkout compares against what the cart last showed.
 */
export function createCartApi(adapter: ApiAdapter, catalog: Pick<ProductsApi, "lookup">) {
  async function hydrate(server: ServerCart): Promise<Cart> {
    let lookup: Lookup | null = null;
    if (server.items.length > 0) {
      try {
        lookup = await catalog.lookup({ variantIds: server.items.map((i) => i.variantId) });
      } catch {
        // The cart is still right without pictures and names.
      }
    }
    return toCart(server, lookup);
  }
  return {
    get: async (signal?: AbortSignal) => hydrate((await request(adapter, { method: "GET", path: `${STORE_BASE}/cart`, signal }, CartEnvelope)).cart),
    /** Replaces the lines (an empty list clears the cart). `rev` makes it compare-and-set. */
    replace: async (items: readonly CartEntry[], rev?: number) =>
      hydrate((await request(adapter, { method: "PUT", path: `${STORE_BASE}/cart`, body: { items, ...(rev === undefined ? {} : { rev }) } }, CartEnvelope)).cart),
  };
}

export type CartApi = ReturnType<typeof createCartApi>;
