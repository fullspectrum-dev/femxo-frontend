import { describe, expect, it } from "vitest";
import { SearchQuery, type SearchQueryInput } from "../../contracts/search";
import { buildCatalog } from "../seed/catalog";
import { SEARCH_SYNONYMS } from "../seed/state";
import { createSearchIndex } from "./search";

const catalog = buildCatalog();
const index = createSearchIndex(catalog, SEARCH_SYNONYMS);
const run = (input: SearchQueryInput = {}) => index.search(SearchQuery.parse(input));
const names = (input: SearchQueryInput) => run(input).products.map((product) => product.name.toLowerCase());

describe("finding products", () => {
  it("matches every word of the query in the name, brand or category", () => {
    const found = names({ q: "mustard oil" });
    expect(found.length).toBeGreaterThanOrEqual(3);
    for (const name of found) expect(name).toMatch(/mustard/);
  });

  it("matches the start of a word as you type", () => {
    expect(names({ q: "bisc" }).some((name) => name.includes("biscuit"))).toBe(true);
  });

  it("understands Hindi and spelling variants, without calling them typos", () => {
    const aata = run({ q: "aata" });
    expect(aata.products.some((product) => product.name.toLowerCase().includes("atta"))).toBe(true);
    expect(aata.correctedQuery).toBeNull();
    expect(names({ q: "chawal" }).some((name) => name.includes("rice"))).toBe(true);
    expect(names({ q: "tel" }).some((name) => name.includes("oil"))).toBe(true);
  });

  it("forgives typos and says what it searched for instead", () => {
    const result = run({ q: "biskit" });
    expect(result.products.some((product) => product.name.toLowerCase().includes("biscuit"))).toBe(true);
    expect(result.correctedQuery).toBe("biscuits");
    const mustard = run({ q: "mustrad oil" });
    expect(mustard.correctedQuery).toBe("mustard oil");
    expect(mustard.products.length).toBeGreaterThan(0);
  });

  it("finds nothing for nonsense, with empty facets", () => {
    const result = run({ q: "zzzzqqxx" });
    expect(result.total).toBe(0);
    expect(result.correctedQuery).toBeNull();
    expect(result.facets.brands).toEqual([]);
  });

  it("ranks real name matches first", () => {
    const first = run({ q: "atta" }).products.slice(0, 3);
    for (const product of first) expect(product.name.toLowerCase()).toContain("atta");
  });

  it("lists the whole catalogue (or a category) when there is no query", () => {
    expect(run().total).toBe(catalog.products.length);
    const staples = run({ category: "staples" });
    const sub = run({ category: "atta-flours" });
    expect(staples.total).toBeGreaterThan(sub.total);
    expect(sub.total).toBeGreaterThan(0);
    expect(run({ category: "no-such-category" }).total).toBe(0);
  });
});

describe("filters and facets", () => {
  it("filters by brand, while the brand facet still shows the other brands to switch to", () => {
    const all = run({ category: "staples" });
    const brand = all.facets.brands[0]!;
    const filtered = run({ category: "staples", brand: [brand.id] });
    expect(filtered.total).toBe(brand.count);
    for (const product of filtered.products) expect(product.brand.id).toBe(brand.id);
    expect(filtered.facets.brands).toEqual(all.facets.brands);
  });

  it("brand counts add up to the results", () => {
    const result = run({ category: "snacks" });
    expect(result.facets.brands.reduce((sum, entry) => sum + entry.count, 0)).toBe(result.total);
  });

  it("filters by price, and the other facets follow the price range", () => {
    const result = run({ category: "staples", minPrice: 10000, maxPrice: 30000 });
    for (const product of result.products) {
      expect(product.fromPrice).toBeGreaterThanOrEqual(10000);
      expect(product.fromPrice).toBeLessThanOrEqual(30000);
    }
    expect(result.facets.brands.reduce((sum, entry) => sum + entry.count, 0)).toBe(result.total);
  });

  it("offers price buckets that add up to the results (ignoring the price filter itself)", () => {
    const result = run({ category: "staples", minPrice: 10000, maxPrice: 30000 });
    const everyPrice = run({ category: "staples" });
    expect(result.facets.priceBuckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(everyPrice.total);
    expect(result.facets.priceBuckets[0]).toMatchObject({ min: 0 });
    expect(result.facets.priceBuckets.at(-1)!.max).toBeNull();
  });

  it("filters by rating, with 'and up' counts", () => {
    const result = run({ rating: 4 });
    for (const product of result.products) expect(product.rating).toBeGreaterThanOrEqual(4);
    const all = run();
    expect(all.facets.ratings.find((entry) => entry.atLeast === 4)!.count).toBe(result.total);
    expect(all.facets.ratings.find((entry) => entry.atLeast === 1)!.count).toBeGreaterThanOrEqual(all.facets.ratings.find((entry) => entry.atLeast === 4)!.count);
  });

  it("filters to products with a Prime benefit", () => {
    const result = run({ prime: true });
    expect(result.total).toBeGreaterThan(0);
    expect(result.total).toBe(run().facets.primeCount);
    for (const product of result.products) expect(product.primeExclusive || product.fromPrimePrice <= product.fromPrice * 0.95).toBe(true);
  });
});

describe("sorting", () => {
  const prices = (sort: SearchQueryInput["sort"]) => run({ category: "staples", sort }).products.map((product) => product.fromPrice);

  it("sorts by price both ways", () => {
    const up = prices("price_asc");
    const down = prices("price_desc");
    expect(up).toEqual([...up].sort((a, b) => a - b));
    expect(down).toEqual([...down].sort((a, b) => b - a));
  });

  it("sorts by rating, discount and newest", () => {
    const rated = run({ sort: "rating" }).products.map((product) => product.rating);
    expect(rated).toEqual([...rated].sort((a, b) => b - a));
    const off = run({ sort: "discount" }).products.map((product) => (product.mrp - product.fromPrice) / product.mrp);
    expect(off).toEqual([...off].sort((a, b) => b - a));
    const created = run({ sort: "newest" }).products.map((product) => catalog.products.find((entry) => entry.id === product.id)!.createdAt);
    expect(created).toEqual([...created].sort().reverse());
  });

  it("is stable: the same query always gives the same order, so pages never repeat or skip", () => {
    expect(run({ sort: "rating" }).products.map((product) => product.id)).toEqual(run({ sort: "rating" }).products.map((product) => product.id));
    const ids = run({ sort: "price_asc" }).products.map((product) => product.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("suggestions", () => {
  it("suggests products, categories and brands for the start of a word", () => {
    const found = index.suggest("must");
    expect(found.length).toBeLessThanOrEqual(8);
    expect(found.some((entry) => entry.kind === "product" && entry.href.startsWith("/p/"))).toBe(true);
    expect(index.suggest("snack").some((entry) => entry.kind === "category" && entry.href === "/c/snacks")).toBe(true);
    expect(index.suggest("bodhi").some((entry) => entry.kind === "brand")).toBe(true);
  });

  it("copes with typos, and gives nothing for an empty box", () => {
    expect(index.suggest("mustrad").some((entry) => entry.label.toLowerCase().includes("mustard"))).toBe(true);
    expect(index.suggest("")).toEqual([]);
    expect(index.suggest("  ")).toEqual([]);
  });
});
