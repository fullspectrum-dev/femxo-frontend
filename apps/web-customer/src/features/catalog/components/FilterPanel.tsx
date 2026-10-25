"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { formatINR } from "@femxo/shared";
import type { Facets } from "@femxo/shared/contracts";
import { Button } from "@femxo/ui";
import { hasActiveFilters, type ListingFilters } from "../query-string";

/** "Under ₹100", "₹100 – ₹250", "₹1,000 & above". */
export function priceLabel(min: number, max: number | null) {
  if (max === null) return `${formatINR(min)} & above`;
  return min === 0 ? `Under ${formatINR(max)}` : `${formatINR(min)} – ${formatINR(max)}`;
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-2 border-0 p-0">
      <legend className="mb-1 font-display text-sm font-bold text-ink">{legend}</legend>
      {children}
    </fieldset>
  );
}

const optionClasses = "flex min-h-9 cursor-pointer items-center gap-2.5 text-sm text-ink";
const inputClasses = "h-4 w-4 flex-none accent-primary";

/** Brand, price, rating and Prime filters, with how many products each choice would show. */
export function FilterPanel({
  facets,
  filters,
  onChange,
  onClear,
}: {
  facets: Facets;
  filters: ListingFilters;
  onChange: (patch: Partial<ListingFilters>) => void;
  onClear: () => void;
}) {
  const id = useId();
  const noPrice = filters.minPrice === undefined && filters.maxPrice === undefined;

  return (
    <div className="grid gap-5">
      {hasActiveFilters(filters) ? (
        <Button variant="ghost" size="sm" className="w-max" onClick={onClear}>
          Clear all filters
        </Button>
      ) : null}

      {facets.brands.length > 0 ? (
        <Group legend="Brand">
          <div className="grid max-h-56 gap-0.5 overflow-y-auto pr-1">
            {facets.brands.map((brand) => (
              <label key={brand.id} className={optionClasses}>
                <input
                  type="checkbox"
                  className={inputClasses}
                  checked={filters.brand.includes(brand.id)}
                  onChange={(event) => onChange({ brand: event.target.checked ? [...filters.brand, brand.id] : filters.brand.filter((entry) => entry !== brand.id) })}
                />
                {brand.name} ({brand.count})
              </label>
            ))}
          </div>
        </Group>
      ) : null}

      {facets.priceBuckets.length > 0 ? (
        <Group legend="Price">
          <label className={optionClasses}>
            <input type="radio" name={`${id}-price`} className={inputClasses} checked={noPrice} onChange={() => onChange({ minPrice: undefined, maxPrice: undefined })} />
            Any price
          </label>
          {facets.priceBuckets.map((bucket) => {
            // A bucket's top edge belongs to the next one, so the filter stops a paisa short of it.
            const maxPrice = bucket.max === null ? undefined : bucket.max - 1;
            return (
              <label key={bucket.min} className={optionClasses}>
                <input
                  type="radio"
                  name={`${id}-price`}
                  className={inputClasses}
                  checked={filters.minPrice === bucket.min && filters.maxPrice === maxPrice}
                  onChange={() => onChange({ minPrice: bucket.min, maxPrice })}
                />
                {priceLabel(bucket.min, bucket.max)} ({bucket.count})
              </label>
            );
          })}
        </Group>
      ) : null}

      {facets.ratings.length > 0 ? (
        <Group legend="Customer rating">
          <label className={optionClasses}>
            <input type="radio" name={`${id}-rating`} className={inputClasses} checked={filters.rating === undefined} onChange={() => onChange({ rating: undefined })} />
            Any rating
          </label>
          {facets.ratings.map((entry) => (
            <label key={entry.atLeast} className={optionClasses}>
              <input type="radio" name={`${id}-rating`} className={inputClasses} checked={filters.rating === entry.atLeast} onChange={() => onChange({ rating: entry.atLeast })} />
              {entry.atLeast}★ &amp; up ({entry.count})
            </label>
          ))}
        </Group>
      ) : null}

      {facets.primeCount > 0 || filters.prime ? (
        <Group legend="Prime">
          <label className={optionClasses}>
            <input type="checkbox" className={inputClasses} checked={filters.prime} onChange={(event) => onChange({ prime: event.target.checked })} />
            Prime deals ({facets.primeCount})
          </label>
        </Group>
      ) : null}
    </div>
  );
}
