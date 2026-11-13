import Image from "next/image";
import Link from "next/link";
import type { Category } from "@femxo/shared/contracts";

/** Top categories as a compact, swipeable rail of rounded pictures: many choices above the fold, one tap each. */
export function CategoryTiles({ categories }: { categories: readonly Category[] }) {
  if (categories.length === 0) return null;
  return (
    <nav aria-label="Shop by category" className="mx-auto w-full max-w-7xl px-4 py-5">
      <h2 className="mb-3 font-display text-xl font-bold md:text-2xl">Shop by category</h2>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        {categories.map((category) => (
          <li key={category.id} className="w-20 flex-none snap-start md:w-auto">
            <Link
              href={`/c/${category.slug}`}
              className="group flex touch-manipulation flex-col items-center gap-2 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span className="relative aspect-square w-full overflow-hidden rounded-card bg-primary-soft ring-1 ring-line transition-transform group-active:scale-95 motion-reduce:transition-none md:group-hover:-translate-y-0.5">
                {category.image ? (
                  <Image src={category.image} alt="" fill sizes="(min-width: 1024px) 12vw, 80px" className="object-cover" />
                ) : (
                  // No picture uploaded yet: a lettered tile, so the rail never shows empty boxes.
                  <span aria-hidden="true" className="grid h-full w-full place-items-center bg-gradient-to-br from-primary-soft to-gold-soft font-display text-3xl font-bold text-primary">
                    {category.name.charAt(0)}
                  </span>
                )}
              </span>
              <span className="line-clamp-2 text-center text-xs font-semibold leading-tight text-ink">{category.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
