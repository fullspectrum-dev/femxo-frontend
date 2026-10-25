import { z } from "zod";
import { Availability, Brand, Category, HomeContent, ProductDetail, ProductSummary } from "../contracts/catalog";
import { page } from "../contracts/common";
import { Serviceability } from "../contracts/commerce";
import { ReviewList } from "../contracts/people";
import type { SearchQueryInput } from "../contracts/search";
import type { ApiAdapter, QueryValue } from "./adapter";
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
    reviews: (slug: string, cursor?: string) =>
      request(adapter, { method: "GET", path: `/catalog/products/${encodeURIComponent(slug)}/reviews`, query: { cursor } }, ReviewList),
    /** Live stock and the price for the signed-in tier, to refresh a prerendered page. */
    availability: (slug: string, signal?: AbortSignal) =>
      request(adapter, { method: "GET", path: `/catalog/products/${encodeURIComponent(slug)}/availability`, signal }, z.array(Availability)),
    /** Whether (and how fast) we deliver to a pincode. An unserviceable pincode is an answer, not an error. */
    serviceability: (pincode: string, signal?: AbortSignal) =>
      request(adapter, { method: "GET", path: `/delivery/serviceability/${encodeURIComponent(pincode)}`, signal }, Serviceability),
  };
}

export type ProductsApi = ReturnType<typeof createProductsApi>;
