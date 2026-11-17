import { z } from "zod";
import { Availability, Brand, CatalogLookup, Category, HomeContent, ProductDetail, ProductSummary } from "../contracts/catalog";
import { page } from "../contracts/common";
import { Review, ReviewList, type ReviewInput } from "../contracts/commerce";
import type { SearchQueryInput } from "../contracts/search";
import type { ApiAdapter, QueryValue } from "./adapter";
import { STORE_BASE } from "./auth-api";
import { request } from "./request";

/** A search/filter query as URL query values (arrays repeat the key; empty values are left out). */
export function toQueryParams(input: SearchQueryInput): Record<string, QueryValue> {
  return {
    q: input.q || undefined,
    category: input.category,
    brand: input.brand?.length ? input.brand : undefined,
    minPrice: input.minPrice,
    maxPrice: input.maxPrice,
    rating: input.rating,
    prime: input.prime ? true : undefined,
    sort: input.sort,
    cursor: input.cursor,
    limit: input.limit,
  };
}

/** ProductsApi: home content, the category tree, brands and product lists. */
export function createProductsApi(adapter: ApiAdapter) {
  return {
    home: () => request(adapter, { method: "GET", path: "/storefront/home" }, HomeContent),
    categories: () => request(adapter, { method: "GET", path: "/catalog/categories" }, z.array(Category)),
    brands: () => request(adapter, { method: "GET", path: "/catalog/brands" }, z.array(Brand)),
    list: (input: SearchQueryInput = {}) =>
      request(adapter, { method: "GET", path: "/catalog/products", query: toQueryParams(input) }, page(ProductSummary)),
    detail: (slug: string) => request(adapter, { method: "GET", path: `/catalog/products/${encodeURIComponent(slug)}` }, ProductDetail),
    related: (slug: string) =>
      request(adapter, { method: "GET", path: `/catalog/products/${encodeURIComponent(slug)}/related` }, z.array(ProductSummary)),
    /** Published reviews of a product (by its id) with the rating summary. Public. */
    reviews: (productId: string, cursor?: string, signal?: AbortSignal) =>
      request(adapter, { method: "GET", path: `${STORE_BASE}/products/${encodeURIComponent(productId)}/reviews`, query: { cursor, limit: 10 }, signal }, ReviewList),
    /** Needs a delivered order of this product (403 NOT_A_BUYER), one per customer (409 REVIEW_EXISTS). Staff publish it before it shows. */
    submitReview: async (productId: string, input: ReviewInput) =>
      (await request(adapter, { method: "POST", path: `${STORE_BASE}/products/${encodeURIComponent(productId)}/reviews`, body: input }, z.object({ review: Review.passthrough() }))).review,
    /** Names, pictures and packs for variant and product ids (the cart, orders and wishlist carry ids only). */
    lookup: ({ variantIds = [], productIds = [] }: { variantIds?: readonly string[]; productIds?: readonly string[] }) =>
      request(
        adapter,
        { method: "GET", path: "/catalog/lookup", query: { variantIds: variantIds.length ? variantIds.join(",") : undefined, productIds: productIds.length ? productIds.join(",") : undefined } },
        CatalogLookup
      ),
    /** Live stock and the price for the signed-in tier, to refresh a prerendered page. */
    availability: (slug: string, signal?: AbortSignal) =>
      request(adapter, { method: "GET", path: `/catalog/products/${encodeURIComponent(slug)}/availability`, signal }, z.array(Availability)),
  };
}

export type ProductsApi = ReturnType<typeof createProductsApi>;
