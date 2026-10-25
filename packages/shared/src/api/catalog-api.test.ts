import { beforeEach, describe, expect, it } from "vitest";
import { createMockBackend } from "../mock/backend";
import { createProductsApi } from "./products-api";
import { createSearchApi } from "./search-api";

let backend: ReturnType<typeof createMockBackend>;
let products: ReturnType<typeof createProductsApi>;
let search: ReturnType<typeof createSearchApi>;

beforeEach(() => {
  backend = createMockBackend({ storage: "memory", latency: false, realNow: () => Date.UTC(2026, 9, 24, 5, 0) });
  products = createProductsApi(backend.adapter);
  search = createSearchApi(backend.adapter);
});

describe("storefront home", () => {
  it("has banners, 8 deals in stock, 8 categories and Prime picks", async () => {
    const home = await products.home();
    expect(home.banners).toHaveLength(3);
    expect(home.deals).toHaveLength(8);
    for (const deal of home.deals) expect(deal.inStock).toBe(true);
    expect(home.featuredCategories).toHaveLength(8);
    expect(home.featuredCategories.every((category) => category.parentId === null)).toBe(true);
    expect(home.primePicks.length).toBeGreaterThan(0);
  });

  it("puts the biggest discounts first in deals", async () => {
    const { deals } = await products.home();
    const off = deals.map((deal) => (deal.mrp - deal.fromPrice) / deal.mrp);
    expect(off).toEqual([...off].sort((a, b) => b - a));
  });
});

describe("categories and brands", () => {
  it("lists the category tree and the brands", async () => {
    const categories = await products.categories();
    expect(categories.filter((category) => category.parentId === null)).toHaveLength(8);
    expect(categories.length).toBeGreaterThanOrEqual(36);
    expect((await products.brands()).length).toBeGreaterThanOrEqual(20);
  });

  it("counts a top category's products across its subcategories", async () => {
    const categories = await products.categories();
    const staples = categories.find((category) => category.slug === "staples")!;
    const subs = categories.filter((category) => category.parentId === staples.id);
    expect(staples.productCount).toBe(subs.reduce((sum, sub) => sum + sub.productCount, 0));
  });
});

describe("product lists and search", () => {
  it("walks a category page by page without repeats or gaps", async () => {
    const total = (await search.search({ category: "snacks" })).total;
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await products.list({ category: "snacks", limit: 7, cursor });
      expect(page.items.length).toBeLessThanOrEqual(7);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
  });

  it("returns search results with facets, a total and the corrected query", async () => {
    const result = await search.search({ q: "biskit" });
    expect(result.correctedQuery).toBe("biscuits");
    expect(result.total).toBeGreaterThan(0);
    expect(result.items.length).toBeLessThanOrEqual(24);
    expect(result.facets.brands.length).toBeGreaterThan(0);
  });

  it("pages search results the same way", async () => {
    const first = await search.search({ q: "oil", limit: 5 });
    expect(first.items).toHaveLength(5);
    expect(first.nextCursor).not.toBeNull();
    const second = await search.search({ q: "oil", limit: 5, cursor: first.nextCursor });
    expect(second.items.map((item) => item.id)).not.toEqual(expect.arrayContaining(first.items.map((item) => item.id)));
    expect(second.total).toBe(first.total);
  });

  it("applies filters and sorting from the query string", async () => {
    const result = await search.search({ category: "staples", brand: [], minPrice: 10000, maxPrice: 30000, sort: "price_asc", prime: false });
    const prices = result.items.map((item) => item.fromPrice);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    for (const price of prices) expect(price).toBeGreaterThanOrEqual(10000);
    const brand = (await search.search({ category: "staples" })).facets.brands[0]!;
    const filtered = await search.search({ category: "staples", brand: [brand.id] });
    expect(filtered.total).toBe(brand.count);
  });

  it("answers an unknown category with an empty list, not an error", async () => {
    await expect(search.search({ category: "no-such-category" })).resolves.toMatchObject({ total: 0, items: [] });
  });

  it("refuses bad queries with 422", async () => {
    await expect(search.search({ limit: 101 })).rejects.toMatchObject({ status: 422 });
    await expect(search.search({ sort: "cheapest" as never })).rejects.toMatchObject({ status: 422 });
    await expect(search.search({ rating: 9 })).rejects.toMatchObject({ status: 422 });
  });

  it("shows stock changes made in this browser", async () => {
    const before = (await search.search({ category: "snacks", limit: 100 })).items.find((item) => item.inStock)!;
    const state = await backend.store.load();
    const product = backend.catalog.products.find((entry) => entry.id === before.id)!;
    for (const variant of product.variants) state.stock[variant.id] = 0;
    await backend.store.save(state);
    backend.adapter.controls.reload();
    const after = (await search.search({ category: "snacks", limit: 100 })).items.find((item) => item.id === before.id)!;
    expect(after.inStock).toBe(false);
  });
});

describe("suggestions", () => {
  it("gives up to 8 suggestions for what is typed", async () => {
    const found = await search.suggest("mus");
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThanOrEqual(8);
  });

  it("gives none for an empty box", async () => {
    await expect(search.suggest("")).resolves.toEqual([]);
  });
});

describe("a product page", () => {
  it("gives the full detail with variants, gallery and breadcrumbs", async () => {
    const { items } = await products.list({ limit: 1 });
    const detail = await products.detail(items[0]!.slug);
    expect(detail.id).toBe(items[0]!.id);
    expect(detail.variants.length).toBeGreaterThan(0);
    expect(detail.images[0]!.src).toBe(detail.image);
    expect(detail.breadcrumbs).toHaveLength(2);
  });

  it("answers 404 for an unknown product", async () => {
    await expect(products.detail("nope")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("lists related products, never the product itself", async () => {
    const { items } = await products.list({ limit: 1 });
    const related = await products.related(items[0]!.slug);
    expect(related.length).toBeGreaterThan(0);
    expect(related.map((entry) => entry.id)).not.toContain(items[0]!.id);
  });

  it("pages reviews newest first with a summary over all of them", async () => {
    const { items } = await products.list({ limit: 100 });
    const product = items.find((entry) => entry.ratingCount > 5)!;
    const first = await products.reviews(product.slug);
    expect(first.items.length).toBe(5);
    expect(first.summary.count).toBe(product.ratingCount);
    expect(first.summary.histogram.reduce((a, b) => a + b, 0)).toBe(product.ratingCount);
    const dates = first.items.map((review) => review.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
    const second = await products.reviews(product.slug, first.nextCursor!);
    expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
  });

  it("reports live stock per variant", async () => {
    const { items } = await products.list({ limit: 1 });
    const detail = await products.detail(items[0]!.slug);
    const live = await products.availability(items[0]!.slug);
    expect(live.map((entry) => entry.variantId)).toEqual(detail.variants.map((variant) => variant.id));
    expect(live[0]!.appliedPrice).toBe(live[0]!.price);
  });

  it("checks a pincode: served, not served, and malformed", async () => {
    expect(await products.serviceability("800001")).toMatchObject({ serviceable: true, district: "Patna" });
    expect(await products.serviceability("855107")).toMatchObject({ serviceable: false, etaDays: null });
    expect(await products.serviceability("999999")).toMatchObject({ serviceable: false });
    await expect(products.serviceability("12")).rejects.toMatchObject({ status: 422 });
  });
});
