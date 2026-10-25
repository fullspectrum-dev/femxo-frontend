"use client";

import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@femxo/shared/contracts";
import { Badge, Card, Price, Rating } from "@femxo/ui";
import { useSession } from "@/features/auth/components/SessionProvider";

/**
 * A product in a list or rail. The picture leads; the whole card is one link
 * to the product page. The price shown is the one this shopper pays: Prime
 * members see the Prime price, everyone else sees it as an offer.
 */
export function ProductCard({ product, priority = false }: { product: ProductSummary; priority?: boolean }) {
  const { user } = useSession();

  return (
    <Card as="article" padded={false} className="group relative flex h-full flex-col overflow-hidden transition-shadow hover:shadow-raised">
      <div className="relative aspect-square bg-surface-sunken">
        {/* The name below says what this is, so the picture is decorative. */}
        <Image
          src={product.image}
          alt=""
          fill
          sizes="(min-width: 1280px) 20vw, (min-width: 768px) 25vw, 50vw"
          priority={priority}
          className={product.inStock ? "object-cover" : "object-cover opacity-50 grayscale"}
        />
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
        <Price className="mt-auto pt-1" size="md" price={product.fromPrice} mrp={product.mrp} primePrice={product.fromPrimePrice} member={user?.isPrime ?? false} />
      </div>
    </Card>
  );
}
