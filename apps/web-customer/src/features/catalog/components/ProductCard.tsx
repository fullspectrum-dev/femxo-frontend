import Image from "next/image";
import Link from "next/link";
import { discountPercent } from "@femxo/shared";
import type { ProductSummary } from "@femxo/shared/contracts";
import { cn, Rating } from "@femxo/ui";
import { CardAction } from "@/features/cart/components/CardAction";
import { WishlistButton } from "@/features/wishlist/components/WishlistButton";
import { CardPrice } from "./CardPrice";

const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/**
 * A product in a list or rail, in the quick-commerce shape: picture first, the add
 * control on the picture's corner, then pack size, name and price. The whole card
 * is one link to the product page (stretched link); the add control and heart sit
 * above it. Rendered on the server; only the price (who is shopping), the heart
 * and the add control hydrate.
 */
export function ProductCard({ product, priority = false, quickAdd = true }: { product: ProductSummary; priority?: boolean; quickAdd?: boolean }) {
  const off = discountPercent(product.mrp, product.fromPrice);
  const canAdd = quickAdd && product.inStock;
  const art = product.image.startsWith("/art/");
  return (
    <article className="group relative flex h-full flex-col rounded-card border border-line bg-surface p-2 transition-colors duration-150 motion-reduce:transition-none md:hover:border-primary">
      <div className="relative">
        <div className="relative aspect-square overflow-hidden rounded-[12px] bg-surface-sunken">
          {/* The name below says what this is, so the picture is decorative. */}
          <Image
            src={product.image}
            alt=""
            fill
            sizes="(min-width: 1280px) 16vw, (min-width: 768px) 22vw, 45vw"
            loading={priority ? "eager" : undefined}
            fetchPriority={priority ? "high" : undefined}
            className={cn(
              // Drawn pack art sits inside the frame, clear of the ADD pill; photos fill it.
              art ? "object-contain p-1.5 pb-8" : "object-cover",
              product.inStock ? "transition-transform duration-300 motion-reduce:transition-none md:group-hover:scale-[1.03]" : "opacity-50 grayscale",
            )}
          />
          {!product.inStock ? (
            <span className="absolute inset-x-0 bottom-0 bg-ink/75 py-1.5 text-center font-display text-xs font-semibold text-white">Out of stock</span>
          ) : null}
        </div>

        {/* Ribbon flag, the shape shoppers already read as "saving". */}
        {off > 0 && product.inStock ? (
          <span className="absolute left-0 top-2 rounded-r-full bg-success py-1 pl-2 pr-3 font-display text-[11px] font-bold uppercase leading-none tracking-wide text-white">{off}% off</span>
        ) : null}
        <WishlistButton product={product} className="absolute right-1.5 top-1.5 z-10" />

        {canAdd ? (
          <div className="absolute -bottom-3 right-1.5 z-10 flex flex-col items-end">
            {product.variantCount === 1 ? (
              <CardAction variant="pill" variantId={product.variantId} itemName={product.name} />
            ) : (
              <Link
                href={`/p/${product.slug}`}
                aria-label={`Choose a size of ${product.name}`}
                className={`grid h-11 min-w-[4.75rem] place-items-center rounded-control border-[1.5px] border-primary bg-surface px-4 font-display text-sm font-bold uppercase tracking-wide text-primary shadow-raised transition-colors duration-150 hover:bg-primary hover:text-on-primary ${ring}`}
              >
                Add
              </Link>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 px-1 pb-1 pt-4">
        <p className="flex min-h-4 items-center gap-1.5 text-xs text-ink-muted">
          {product.packLabel ? <span>{product.packLabel}</span> : null}
          {product.variantCount > 1 ? <span className="font-semibold text-primary">· {product.variantCount} options</span> : null}
        </p>
        <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-snug text-ink">
          {/* Stretched link: the whole card is the target, with one link for assistive tech. */}
          <Link href={`/p/${product.slug}`} className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus">
            {product.name}
          </Link>
        </h3>
        <p className="truncate text-[11px] text-ink-muted">{product.brand.name}</p>
        {product.ratingCount > 0 ? <Rating value={product.rating} count={product.ratingCount} /> : null}
        <CardPrice price={product.fromPrice} mrp={product.mrp} primePrice={product.fromPrimePrice} />
      </div>
    </article>
  );
}
