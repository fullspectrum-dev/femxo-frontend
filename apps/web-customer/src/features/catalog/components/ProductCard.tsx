import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@femxo/shared/contracts";
import { Badge, Card, Rating } from "@femxo/ui";
import { AddToCartButton } from "@/features/cart/components/AddToCartButton";
import { WishlistButton } from "@/features/wishlist/components/WishlistButton";
import { CardPrice } from "./CardPrice";

/**
 * A product in a list or rail. The picture leads; the whole card is one link
 * to the product page. Rendered on the server; only the price (who is shopping),
 * the heart and quick-add are client islands, so a page of cards hydrates little.
 */
export function ProductCard({ product, priority = false, quickAdd = true }: { product: ProductSummary; priority?: boolean; quickAdd?: boolean }) {
  return (
    <Card as="article" padded={false} className="group relative flex h-full flex-col overflow-hidden transition-shadow hover:shadow-raised">
      <div className="relative aspect-square bg-surface-sunken">
        {/* The name below says what this is, so the picture is decorative. */}
        <Image
          src={product.image}
          alt=""
          fill
          sizes="(min-width: 1280px) 20vw, (min-width: 768px) 25vw, 50vw"
          loading={priority ? "eager" : undefined}
          fetchPriority={priority ? "high" : undefined}
          className={product.inStock ? "object-cover" : "object-cover opacity-50 grayscale"}
        />
        <WishlistButton product={product} className="absolute right-2 top-2 z-10" />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {!product.inStock ? <Badge tone="neutral">Out of stock</Badge> : null}
          {product.primeExclusive ? <Badge tone="gold">Prime only</Badge> : null}
          {product.badges.map((badge) => (
            <Badge key={badge} tone="primary">
              {badge}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="text-xs font-medium text-ink-muted">{product.brand.name}</p>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
          {/* Stretched link: the whole card is the target, with one link for assistive tech. */}
          <Link href={`/p/${product.slug}`} className="after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
            {product.name}
          </Link>
        </h3>
        <Rating value={product.rating} count={product.ratingCount} />
        <CardPrice price={product.fromPrice} mrp={product.mrp} primePrice={product.fromPrimePrice} />
        {/* One size to choose from: add it right here. Otherwise the card opens the page to choose. Above the card's stretched link. */}
        {quickAdd && product.inStock && product.variantCount === 1 ? (
          <AddToCartButton variantId={product.variantId} itemName={product.name} label="Add" variant="secondary" size="sm" block className="relative z-10 mt-2" />
        ) : null}
      </div>
    </Card>
  );
}
