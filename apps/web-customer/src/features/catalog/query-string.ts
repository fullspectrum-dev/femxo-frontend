import type { SearchSort } from "@femxo/shared/contracts";

/** The listing's filters as they live in the address bar, so a filtered page can be shared and reloaded. */
export interface ListingFilters {
  q: string;
  brand: string[];
  minPrice: number | undefined;
  maxPrice: number | undefined;
  rating: number | undefined;
  prime: boolean;
  sort: SearchSort;
}

const SORTS: readonly SearchSort[] = ["relevance", "price_asc", "price_desc", "rating", "newest", "discount"];
const DEFAULT_SORT: SearchSort = "relevance";

const whole = (text: string | null) => {
  if (text === null || text === "") return undefined;
  const value = Number(text);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
};

export function parseListingParams(params: URLSearchParams | { get(name: string): string | null; getAll(name: string): string[] }): ListingFilters {
  const rating = whole(params.get("rating"));
  const sort = params.get("sort") as SearchSort | null;
  return {
    q: (params.get("q") ?? "").trim().slice(0, 100),
    brand: params.getAll("brand").filter(Boolean),
    minPrice: whole(params.get("minPrice")),
    maxPrice: whole(params.get("maxPrice")),
    rating: rating !== undefined && rating >= 1 && rating <= 4 ? rating : undefined,
    prime: params.get("prime") === "true",
    sort: sort && SORTS.includes(sort) ? sort : DEFAULT_SORT,
  };
}

/** "?brand=…&sort=…" with only what is set, or "" for the plain page. */
export function listingQueryString(filters: Partial<ListingFilters>) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  for (const brand of filters.brand ?? []) params.append("brand", brand);
  if (filters.minPrice !== undefined) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set("maxPrice", String(filters.maxPrice));
  if (filters.rating !== undefined) params.set("rating", String(filters.rating));
  if (filters.prime) params.set("prime", "true");
  if (filters.sort && filters.sort !== DEFAULT_SORT) params.set("sort", filters.sort);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Filters (not sorting or the search words) that narrow the results; they get a "Clear all". */
export const hasActiveFilters = (filters: ListingFilters) =>
  filters.brand.length > 0 || filters.minPrice !== undefined || filters.maxPrice !== undefined || filters.rating !== undefined || filters.prime;
