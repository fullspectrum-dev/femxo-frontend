import Link from "next/link";
import { useId } from "react";
import type { ProductSummary } from "@femxo/shared/contracts";
import { ProductCard } from "./ProductCard";

/** A titled, sideways-scrolling row of products (deals, Prime picks, related items). */
export function ProductRail({ title, products, seeAllHref }: { title: string; products: readonly ProductSummary[]; seeAllHref?: string }) {
  const titleId = useId();
  if (products.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-3 flex items-end justify-between gap-4">
        <h2 id={titleId} className="font-display text-xl font-bold md:text-2xl">
          {title}
        </h2>
        {seeAllHref ? (
          <Link href={seeAllHref} className="whitespace-nowrap text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus">
            See all
          </Link>
        ) : null}
      </div>
      {/* Scrolls inside itself, so the page never scrolls sideways. */}
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] md:mx-0 md:px-0">
        {products.map((product, index) => (
          <li key={product.id} className="w-44 flex-none snap-start md:w-56">
            <ProductCard product={product} priority={index < 2} />
          </li>
        ))}
      </ul>
    </section>
  );
}
