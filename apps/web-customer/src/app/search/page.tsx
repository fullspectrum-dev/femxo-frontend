import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@femxo/ui";
import { SearchResults } from "@/features/search/components/SearchResults";

// Results depend on what was typed, so search pages stay out of search engines.
export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };

export default function SearchPage() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-5">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <SearchResults />
      </Suspense>
    </section>
  );
}
