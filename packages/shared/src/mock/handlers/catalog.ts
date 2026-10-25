import { paginate } from "../../adapters/mock/pagination";
import type { MockQuery, MockResult, MockRouter } from "../../adapters/mock/router";
import { MockHttpError } from "../../adapters/mock/errors";
import type { Availability, HomeContent, ProductSummary } from "../../contracts/catalog";
import { Pincode } from "../../contracts/common";
import type { Review, ReviewSummary } from "../../contracts/people";
import { SearchQuery } from "../../contracts/search";
import type { StockLookup } from "../domain/mappers";
import { toProductDetail, toProductSummary } from "../domain/mappers";
import { createSearchIndex } from "../domain/search";
import type { Catalog, MockState, SeedProduct } from "../domain/types";
import { SEARCH_SYNONYMS } from "../seed/state";
import { authenticate } from "./auth";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const number = (value: string | string[] | undefined) => {
  const text = one(value);
  return text === undefined || text === "" ? undefined : Number(text);
};

/** Query-string values (always text) into a typed search query; anything invalid is a 422 from the schema. */
export function toSearchQuery(query: MockQuery): SearchQuery {
  return SearchQuery.parse({
    q: one(query.q) ?? "",
    category: one(query.category) || undefined,
    brand: [query.brand ?? []].flat().filter(Boolean),
    minPrice: number(query.minPrice),
    maxPrice: number(query.maxPrice),
    rating: number(query.rating),
    prime: one(query.prime) === "true" ? true : undefined,
    sort: one(query.sort) || undefined,
    cursor: one(query.cursor) || undefined,
    limit: number(query.limit),
  });
}

/** Stock as this browser sees it: the seed, less what its orders took. */
const stockFor =
  (state: MockState): StockLookup =>
  (variant) =>
    state.stock[variant.id] ?? variant.stock;

const saving = (summary: ProductSummary) => (summary.mrp - summary.fromPrice) / summary.mrp;
const primeSaving = (summary: ProductSummary) => (summary.fromPrice - summary.fromPrimePrice) / summary.fromPrice;

const RELATED_COUNT = 8;

function summarise(reviews: readonly Review[]): ReviewSummary {
  const histogram: ReviewSummary["histogram"] = [0, 0, 0, 0, 0];
  for (const review of reviews) histogram[review.rating - 1]!++;
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  return { average: Math.round(average * 10) / 10, count: reviews.length, histogram };
}

export function registerCatalogRoutes(router: MockRouter<MockState>, catalog: Catalog) {
  const index = createSearchIndex(catalog, SEARCH_SYNONYMS);

  router.get("/storefront/home", ({ state }): MockResult => {
    const stock = stockFor(state);
    const summaries = catalog.products.map((product) => toProductSummary(product, catalog, stock));
    const home: HomeContent = {
      banners: catalog.banners,
      deals: summaries
        .filter((summary) => summary.inStock)
        .sort((a, b) => saving(b) - saving(a) || (a.id < b.id ? -1 : 1))
        .slice(0, 8),
      featuredCategories: catalog.categories.filter((category) => category.parentId === null),
      primePicks: summaries
        .filter((summary) => summary.inStock && (summary.primeExclusive || primeSaving(summary) >= 0.05))
        .sort((a, b) => Number(b.primeExclusive) - Number(a.primeExclusive) || primeSaving(b) - primeSaving(a) || (a.id < b.id ? -1 : 1))
        .slice(0, 8),
    };
    return { status: 200, body: home };
  });

  router.get("/catalog/categories", (): MockResult => ({ status: 200, body: catalog.categories }));
  router.get("/catalog/brands", (): MockResult => ({ status: 200, body: catalog.brands }));

  router.get("/catalog/products", ({ query, state }): MockResult => {
    const { products } = index.search(toSearchQuery(query), { stock: stockFor(state) });
    return { status: 200, body: paginate(products, query) };
  });

  router.get("/search", ({ query, state }): MockResult => {
    const { products, total, facets, correctedQuery } = index.search(toSearchQuery(query), { stock: stockFor(state) });
    return { status: 200, body: { ...paginate(products, query), total, facets, correctedQuery } };
  });

  router.get("/search/suggest", ({ query, state }): MockResult => ({
    status: 200,
    body: index.suggest(one(query.q) ?? "", 8, { stock: stockFor(state) }),
  }));

  const bySlug = (slug: string): SeedProduct => {
    const product = catalog.products.find((entry) => entry.slug === slug);
    if (!product) throw new MockHttpError(404, "NOT_FOUND", "We couldn't find that product.");
    return product;
  };

  router.get("/catalog/products/:slug", ({ params, state, clock }): MockResult => ({
    status: 200,
    body: toProductDetail(bySlug(params.slug!), catalog, new Date(clock.now()), stockFor(state)),
  }));

  /** The same sub-category first, then the rest of the top category; never the product itself. */
  router.get("/catalog/products/:slug/related", ({ params, state }): MockResult => {
    const product = bySlug(params.slug!);
    const stock = stockFor(state);
    const rank = (other: SeedProduct) => (other.categoryId === product.categoryId ? 0 : 1);
    const related = catalog.products
      .filter((other) => other.id !== product.id && other.topCategoryId === product.topCategoryId)
      .sort((a, b) => rank(a) - rank(b) || b.rating - a.rating || (a.id < b.id ? -1 : 1))
      .slice(0, RELATED_COUNT)
      .map((other) => toProductSummary(other, catalog, stock));
    return { status: 200, body: related };
  });

  router.get("/catalog/products/:slug/reviews", ({ params, query }): MockResult => {
    const reviews = [...(catalog.reviews[bySlug(params.slug!).id] ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return { status: 200, body: { ...paginate(reviews, query, 5), summary: summarise(reviews) } };
  });

  /** Live stock, and the price for this shopper's tier (Prime members pay the Prime price). */
  router.get("/catalog/products/:slug/availability", (context): MockResult => {
    const product = bySlug(context.params.slug!);
    let member = false;
    if (context.accessToken) {
      try {
        const { customer } = authenticate(context);
        const membership = context.state.memberships[customer.id];
        member = Boolean(membership && Date.parse(membership.validTill) > context.clock.now());
      } catch {
        // An expired token just means the guest price.
      }
    }
    const stock = stockFor(context.state);
    const body: Availability[] = product.variants.map((variant) => ({
      variantId: variant.id,
      stock: stock(variant),
      price: variant.price,
      primePrice: variant.primePrice,
      appliedPrice: member ? variant.primePrice : variant.price,
    }));
    return { status: 200, body };
  });

  router.get("/delivery/serviceability/:pincode", ({ params, state }): MockResult => {
    const parsed = Pincode.safeParse(params.pincode);
    if (!parsed.success) {
      const message = parsed.error.issues[0]!.message;
      throw new MockHttpError(422, "VALIDATION_FAILED", message, { fields: { pincode: message } });
    }
    const known = state.pincodes[parsed.data];
    return { status: 200, body: known ?? { pincode: parsed.data, serviceable: false, district: null, etaDays: null, codAvailable: false } };
  });
}
