import { z } from "zod";
import { MockHttpError } from "../../adapters/mock/errors";
import type { MockContext, MockResult, MockRouter } from "../../adapters/mock/router";
import type { Wishlist } from "../../contracts/catalog";
import { stockFor, toProductSummary } from "../domain/mappers";
import type { Catalog, MockState } from "../domain/types";
import { authenticate } from "./auth";

const AddProduct = z.object({ productId: z.string().min(1) });

/** Saved products, per signed-in customer, newest first. */
export function registerWishlistRoutes(router: MockRouter<MockState>, catalog: Catalog) {
  const byId = new Map(catalog.products.map((product) => [product.id, product]));

  function body(ctx: MockContext<MockState>, customerId: string): Wishlist {
    const stock = stockFor(ctx.state);
    const items = (ctx.state.wishlists[customerId] ?? []).flatMap((id) => {
      const product = byId.get(id);
      return product ? [toProductSummary(product, catalog, stock)] : [];
    });
    return { items };
  }

  router.get("/wishlist", (ctx): MockResult => ({ status: 200, body: body(ctx, authenticate(ctx).customer.id) }));

  router.post("/wishlist", (ctx): MockResult => {
    const { customer } = authenticate(ctx);
    const { productId: id } = AddProduct.parse(ctx.body);
    if (!byId.has(id)) throw new MockHttpError(404, "NOT_FOUND", "We couldn't find that product.");
    const saved = ctx.state.wishlists[customer.id] ?? [];
    ctx.state.wishlists[customer.id] = saved.includes(id) ? saved : [id, ...saved];
    return { status: 200, body: body(ctx, customer.id) };
  });

  router.delete("/wishlist/:productId", (ctx): MockResult => {
    const { customer } = authenticate(ctx);
    ctx.state.wishlists[customer.id] = (ctx.state.wishlists[customer.id] ?? []).filter((id) => id !== ctx.params.productId);
    return { status: 200, body: body(ctx, customer.id) };
  });
}
