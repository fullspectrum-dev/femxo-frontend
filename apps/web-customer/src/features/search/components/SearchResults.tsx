"use client";

import { useSearchParams } from "next/navigation";
import { ProductListing } from "@/features/catalog/components/ProductListing";
import { parseListingParams } from "@/features/catalog/query-string";

/** The search page: a heading for what was searched, then the same filterable list as a category. */
export function SearchResults() {
  const { q } = parseListingParams(useSearchParams());
  return (
    <>
      <h1 className="mb-4 font-display text-2xl font-bold md:text-3xl">{q ? `Results for “${q}”` : "All products"}</h1>
      <ProductListing />
    </>
  );
}
