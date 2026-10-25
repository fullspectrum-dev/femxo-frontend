import Image from "next/image";
import Link from "next/link";
import type { Category } from "@femxo/shared/contracts";

/** The top categories as picture tiles. */
export function CategoryTiles({ categories }: { categories: readonly Category[] }) {
  return (
    <nav aria-label="Shop by category" className="mx-auto w-full max-w-7xl px-4 py-6">
      <h2 className="mb-3 font-display text-xl font-bold md:text-2xl">Shop by category</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              href={`/c/${category.slug}`}
              className="group relative block aspect-[3/2] overflow-hidden rounded-card border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <Image src={category.image} alt="" fill sizes="(min-width: 640px) 25vw, 50vw" className="object-cover transition-transform duration-300 group-hover:scale-105" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-3 text-on-primary">
                <span className="block text-sm font-semibold">{category.name}</span>
                <span className="block text-xs opacity-90">
                  {category.productCount} {category.productCount === 1 ? "product" : "products"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
