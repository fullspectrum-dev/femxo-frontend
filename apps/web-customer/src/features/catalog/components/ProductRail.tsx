import Link from "next/link";
import { useId } from "react";
import type { ProductSummary } from "@femxo/shared/contracts";
import { ProductCard } from "./ProductCard";

/** A titled, sideways-scrolling row of products (deals, Prime picks, related items). */
export function ProductRail({
  title,
  products,
  seeAllHref,
  compact = false,
}: {
  title: string;
  products: readonly ProductSummary[];
  seeAllHref?: string;
  /** Inside another section (a home department): no page padding, a smaller heading, no "See all" of its own. */
  compact?: boolean;
}) {
  const titleId = useId();
  if (products.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className={compact ? "pt-4" : "mx-auto w-full max-w-7xl px-4 py-6"}>
      <div className="mb-3 flex items-end justify-between gap-4">
        {compact ? (
          <h3 id={titleId} className="font-display text-base font-semibold text-ink-muted">
            {title}
          </h3>
        ) : (
          <h2 id={titleId} className="font-display text-xl font-bold tracking-tight md:text-2xl">
            {title}
          </h2>
        )}
        {seeAllHref && !compact ? (
          <Link href={seeAllHref} className="inline-flex h-9 items-center whitespace-nowrap rounded-full bg-primary-soft px-4 font-display text-sm font-semibold text-primary transition-colors duration-150 hover:bg-primary hover:text-on-primary focus-visible:outline-2 focus-visible:outline-focus">
            See all
          </Link>
        ) : null}
      </div>
      {/* Scrolls inside itself, so the page never scrolls sideways. */}
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] md:mx-0 md:px-0">
        {products.map((product) => (
          <li key={product.id} className="w-[9.5rem] flex-none snap-start sm:w-44 md:w-48">
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
}
