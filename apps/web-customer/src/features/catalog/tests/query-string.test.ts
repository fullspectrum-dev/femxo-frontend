import { describe, expect, it } from "vitest";
import { hasActiveFilters, listingQueryString, parseListingParams } from "../query-string";

const parse = (search: string) => parseListingParams(new URLSearchParams(search));

describe("parseListingParams", () => {
  it("starts from the defaults", () => {
    expect(parse("")).toEqual({ q: "", brand: [], minPrice: undefined, maxPrice: undefined, rating: undefined, prime: false, sort: "relevance" });
  });

  it("reads every filter from the address", () => {
    expect(parse("q=oil&brand=brd-a&brand=brd-b&minPrice=10000&maxPrice=25000&rating=4&prime=true&sort=price_asc")).toEqual({
      q: "oil",
      brand: ["brd-a", "brd-b"],
      minPrice: 10000,
      maxPrice: 25000,
      rating: 4,
      prime: true,
      sort: "price_asc",
    });
  });

  it("ignores values that make no sense instead of breaking the page", () => {
    expect(parse("sort=cheapest&rating=9&minPrice=-5&maxPrice=abc&prime=yes")).toMatchObject({
      sort: "relevance",
      rating: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      prime: false,
    });
  });

  it("trims the search text and caps it at 100 characters", () => {
    expect(parse("q=%20%20atta%20%20").q).toBe("atta");
    expect(parse(`q=${"x".repeat(150)}`).q).toHaveLength(100);
  });
});

describe("listingQueryString", () => {
  it("is empty when nothing is set, so the plain page keeps its plain address", () => {
    expect(listingQueryString({})).toBe("");
    expect(listingQueryString({ sort: "relevance", brand: [], prime: false })).toBe("");
  });

  it("writes only what is set, in a stable order", () => {
    expect(listingQueryString({ sort: "price_asc", prime: true, brand: ["brd-a", "brd-b"], q: "oil", rating: 3, minPrice: 0, maxPrice: 25000 })).toBe(
      "?q=oil&brand=brd-a&brand=brd-b&minPrice=0&maxPrice=25000&rating=3&prime=true&sort=price_asc"
    );
  });

  it("round-trips through the parser", () => {
    const filters = { q: "ghee", brand: ["brd-mithila-gold"], minPrice: 25000, maxPrice: undefined, rating: 4, prime: true, sort: "rating" as const };
    expect(parse(listingQueryString(filters).slice(1))).toEqual(filters);
  });
});

describe("hasActiveFilters", () => {
  it("counts brand, price, rating and Prime, but not sorting or the search words", () => {
    expect(hasActiveFilters(parse("sort=price_asc&q=oil"))).toBe(false);
    expect(hasActiveFilters(parse("brand=brd-a"))).toBe(true);
    expect(hasActiveFilters(parse("minPrice=100"))).toBe(true);
    expect(hasActiveFilters(parse("rating=4"))).toBe(true);
    expect(hasActiveFilters(parse("prime=true"))).toBe(true);
  });
});
