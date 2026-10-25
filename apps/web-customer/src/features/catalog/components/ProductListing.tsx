"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useOptimistic, useRef, useState } from "react";
import type { ApiError, SearchApi } from "@femxo/shared/api";
import type { Facets, ProductSummary, SearchQueryInput, SearchResult, SearchSort } from "@femxo/shared/contracts";
import { Button, EmptyState, ErrorState, Sheet, Skeleton } from "@femxo/ui";
import { getSearchApi } from "@/lib/api";
import { hasActiveFilters, listingQueryString, parseListingParams, type ListingFilters } from "../query-string";
import { FilterPanel, priceLabel } from "./FilterPanel";
import { ProductCard } from "./ProductCard";

const SORT_LABELS: Record<SearchSort, string> = {
  relevance: "Relevance",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  rating: "Top rated",
  newest: "Newest",
  discount: "Biggest discount",
};

interface Loaded {
  /** Which filters these results are for. */
  key: string;
  items: ProductSummary[];
  nextCursor: string | null;
  total: number;
  facets: Facets;
  correctedQuery: string | null;
}

const keyOf = (category: string | undefined, filters: ListingFilters) =>
  JSON.stringify([category, filters.q, filters.brand, filters.minPrice, filters.maxPrice, filters.rating, filters.prime, filters.sort]);

const fromResult = (key: string, result: SearchResult): Loaded => ({
  key,
  items: result.items,
  nextCursor: result.nextCursor,
  total: result.total,
  facets: result.facets,
  correctedQuery: result.correctedQuery,
});

/**
 * A product list with filters and sorting that live in the address bar (so
 * a filtered page can be shared and reloaded) and a "Load more" button.
 * The first page can arrive pre-rendered from the server; it's used as long
 * as the address carries no filters.
 */
export function ProductListing({ categorySlug, initial, search }: { categorySlug?: string; initial?: SearchResult; search?: SearchApi }) {
  const router = useRouter();
  const pathname = usePathname();
  // Choices show at once and the address catches up, so a click never waits on the navigation.
  const [filters, setOptimisticFilters] = useOptimistic(parseListingParams(useSearchParams()));
  const key = keyOf(categorySlug, filters);
  const apiRef = useRef(search);
  const api = () => (apiRef.current ??= getSearchApi());

  const [loaded, setLoaded] = useState<Loaded | null>(() =>
    initial ? fromResult(keyOf(categorySlug, parseListingParams(new URLSearchParams())), initial) : null
  );
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const query = (cursor?: string | null): SearchQueryInput => ({
    q: filters.q,
    category: categorySlug,
    brand: filters.brand,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    rating: filters.rating,
    prime: filters.prime || undefined,
    sort: filters.sort,
    cursor,
  });

  // Fetch whenever the filters change, unless we already hold exactly these results.
  useEffect(() => {
    if (loaded?.key === key || failedKey === key) return;
    const controller = new AbortController();
    api()
      .search(query(), controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setLoaded(fromResult(key, result));
      })
      .catch((error: ApiError) => {
        if (!controller.signal.aborted && error.name !== "AbortError") setFailedKey(key);
      });
    return () => controller.abort();
    // `query` is derived from the filters that `key` already summarises.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, loaded?.key, failedKey]);

  const show = (next: ListingFilters) =>
    startTransition(() => {
      setOptimisticFilters(next);
      router.replace(`${pathname}${listingQueryString(next)}`, { scroll: false });
    });
  const go = (patch: Partial<ListingFilters>) => show({ ...filters, ...patch });
  const clear = () => show({ ...parseListingParams(new URLSearchParams()), q: filters.q });

  async function loadMore() {
    if (!loaded?.nextCursor) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const result = await api().search(query(loaded.nextCursor));
      setLoaded((current) => (current?.key === key ? { ...current, items: [...current.items, ...result.items], nextCursor: result.nextCursor, total: result.total } : current));
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const isCurrent = loaded?.key === key;
  const failed = failedKey === key && !isCurrent;
  const loading = !isCurrent && !failed;

  if (failed) {
    return (
      <ErrorState
        onRetry={() => {
          setFailedKey(null);
          setAttempt((count) => count + 1);
        }}
      />
    );
  }

  if (!loaded) {
    return (
      <div role="status" className="grid gap-4">
        <span className="sr-only">Loading products…</span>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <li key={index}>
              <Skeleton className="aspect-[3/4] w-full" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const activeCount = filters.brand.length + (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0) + (filters.rating !== undefined ? 1 : 0) + (filters.prime ? 1 : 0);
  const chips = [
    ...filters.brand.map((id) => ({ label: loaded.facets.brands.find((brand) => brand.id === id)?.name ?? "Brand", remove: () => go({ brand: filters.brand.filter((entry) => entry !== id) }) })),
    ...(filters.minPrice !== undefined || filters.maxPrice !== undefined
      ? [
          {
            label: filters.maxPrice === undefined ? `${priceLabel(filters.minPrice ?? 0, null)}` : filters.minPrice ? `${priceLabel(filters.minPrice, filters.maxPrice + 1)}` : priceLabel(0, filters.maxPrice + 1),
            remove: () => go({ minPrice: undefined, maxPrice: undefined }),
          },
        ]
      : []),
    ...(filters.rating !== undefined ? [{ label: `${filters.rating}★ & up`, remove: () => go({ rating: undefined }) }] : []),
    ...(filters.prime ? [{ label: "Prime deals", remove: () => go({ prime: false }) }] : []),
  ];

  const filterPanel = <FilterPanel facets={loaded.facets} filters={filters} onChange={go} onClear={clear} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
      <aside aria-label="Filters" className="hidden lg:block">
        {filterPanel}
      </aside>

      <div className="min-w-0" aria-busy={loading}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm font-medium text-ink-muted">
            {loaded.total} {loaded.total === 1 ? "product" : "products"}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setSheetOpen(true)}>
              <SlidersHorizontal size={16} aria-hidden="true" />
              Filters{activeCount > 0 ? ` (${activeCount})` : ""}
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only md:not-sr-only md:text-ink-muted">Sort by</span>
              <select
                aria-label="Sort by"
                value={filters.sort}
                onChange={(event) => go({ sort: event.target.value as SearchSort })}
                className="h-9 rounded-control border border-line-input bg-surface px-2 text-sm text-ink"
              >
                {(Object.keys(SORT_LABELS) as SearchSort[]).map((sort) => (
                  <option key={sort} value={sort}>
                    {SORT_LABELS[sort]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {loaded.correctedQuery ? (
          <p className="mb-3 text-sm text-ink-muted">
            Showing results for <strong className="text-ink">{loaded.correctedQuery}</strong>
          </p>
        ) : null}

        {chips.length > 0 ? (
          <ul aria-label="Active filters" className="mb-4 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li key={chip.label}>
                <button
                  type="button"
                  aria-label={`Remove filter: ${chip.label}`}
                  onClick={chip.remove}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary-soft px-3 text-xs font-semibold text-primary hover:bg-primary hover:text-on-primary focus-visible:outline-2 focus-visible:outline-focus"
                >
                  {chip.label}
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {loaded.total === 0 && isCurrent ? (
          <EmptyState
            title="No products match"
            message={hasActiveFilters(filters) ? "Try removing a filter or two." : "Try a different word, or browse a category."}
            action={
              hasActiveFilters(filters) ? (
                <Button variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className={`grid grid-cols-2 gap-3 transition-opacity md:grid-cols-3 xl:grid-cols-4 ${loading ? "opacity-60" : ""}`}>
              {loaded.items.map((product, index) => (
                <li key={product.id}>
                  <ProductCard product={product} priority={index < 4} />
                </li>
              ))}
            </ul>
            <div className="mt-6 grid justify-items-center gap-2">
              <p className="text-sm text-ink-muted">
                Showing {loaded.items.length} of {loaded.total}
              </p>
              {moreFailed ? (
                <p role="alert" className="text-sm font-medium text-danger">
                  Couldn&rsquo;t load more products.
                </p>
              ) : null}
              {loaded.nextCursor ? (
                <Button variant="secondary" busy={loadingMore} onClick={() => void loadMore()}>
                  Load more
                </Button>
              ) : null}
            </div>
          </>
        )}
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filters" footer={<Button onClick={() => setSheetOpen(false)}>{`Show ${loaded.total} ${loaded.total === 1 ? "product" : "products"}`}</Button>}>
        {filterPanel}
      </Sheet>
    </div>
  );
}
