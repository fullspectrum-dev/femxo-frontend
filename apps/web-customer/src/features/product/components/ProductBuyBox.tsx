"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductsApi } from "@femxo/shared/api";
import type { Availability, ProductDetail } from "@femxo/shared/contracts";
import { Badge, Price, QuantityStepper, Rating, cn } from "@femxo/ui";
import { WishlistButton } from "@/features/wishlist/components/WishlistButton";
import { AddToCartButton } from "@/features/cart/components/AddToCartButton";
import { useSession } from "@/features/auth/components/SessionProvider";
import { getProductsApi } from "@/lib/api";
import { PincodeCheck } from "./PincodeCheck";
import { ProductGallery } from "./ProductGallery";

const LOW_STOCK = 5;

const BEST_BEFORE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** "Best before 12 Mar 2027" from a YYYY-MM-DD date. */
export const formatBestBefore = (date: string) => BEST_BEFORE.format(new Date(`${date}T00:00:00Z`));

function stockMessage(stock: number) {
  if (stock <= 0) return { tone: "neutral", text: "Out of stock" } as const;
  if (stock <= LOW_STOCK) return { tone: "warning", text: `Only ${stock} left` } as const;
  return { tone: "success", text: "In stock" } as const;
}

/**
 * The part of the product page that depends on the shopper: gallery, variant
 * choice, price for their tier, and live stock. The page itself is prerendered
 * with the catalogue's stock; after load this asks for the current numbers
 * and quietly swaps them in.
 */
export function ProductBuyBox({ product, products }: { product: ProductDetail; products?: ProductsApi }) {
  const { user } = useSession();
  const apiRef = useRef(products);
  const [selectedId, setSelectedId] = useState(() => (product.variants.find((variant) => variant.stock > 0) ?? product.variants[0]!).id);
  const [live, setLive] = useState<Record<string, Availability>>({});
  const [wanted, setWanted] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    (apiRef.current ??= getProductsApi())
      .availability(product.slug, controller.signal)
      .then((list) => setLive(Object.fromEntries(list.map((entry) => [entry.variantId, entry]))))
      .catch(() => undefined); // the prerendered numbers are still right enough to show
    return () => controller.abort();
  }, [product.slug, user?.id, user?.isPrime]);

  const variant = product.variants.find((entry) => entry.id === selectedId)!;
  const stock = live[variant.id]?.stock ?? variant.stock;
  const message = stockMessage(stock);
  const member = user?.isPrime ?? false;
  const limit = Math.max(Math.min(stock, variant.maxPerOrder), 1);
  const quantity = Math.min(wanted, limit);

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
      <ProductGallery images={product.images} soldOut={!product.inStock} />

      <div className="grid content-start gap-4">
        <div className="grid gap-1.5">
          <p className="text-sm font-medium text-ink-muted">{product.brand.name}</p>
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-2xl font-bold leading-tight md:text-3xl">{product.name}</h1>
            <WishlistButton product={product} className="flex-none border border-line" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Rating value={product.rating} count={product.ratingCount} />
            {product.primeExclusive ? <Badge tone="gold">Prime only</Badge> : null}
            {product.badges.map((badge) => (
              <Badge key={badge} tone="primary">
                {badge}
              </Badge>
            ))}
          </div>
        </div>

        <Price size="lg" price={variant.price} mrp={variant.mrp} primePrice={variant.primePrice} member={member} />
        <p className="-mt-2 text-xs text-ink-muted">Inclusive of all taxes</p>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">Size / pack</legend>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((entry) => {
              const out = (live[entry.id]?.stock ?? entry.stock) <= 0;
              return (
                <label
                  key={entry.id}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center rounded-control border px-4 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                    entry.id === selectedId ? "border-primary bg-primary-soft text-primary" : "border-line-input bg-surface text-ink",
                    out && "text-ink-muted"
                  )}
                >
                  <input type="radio" name="variant" value={entry.id} checked={entry.id === selectedId} onChange={() => {
                      setSelectedId(entry.id);
                      setWanted(1);
                    }} className="sr-only" />
                  {entry.label}
                  {out ? <span className="sr-only"> (out of stock)</span> : null}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-1">
          <p role="status" aria-live="polite">
            <Badge tone={message.tone}>{message.text}</Badge>
          </p>
          {variant.bestBefore ? <p className="text-sm text-ink-muted">Best before {formatBestBefore(variant.bestBefore)}</p> : null}
        </div>

        {stock > 0 ? (
          <div className="flex flex-wrap items-start gap-3">
            <QuantityStepper value={quantity} max={limit} onChange={setWanted} itemName={`${product.name} ${variant.label}`} />
            <AddToCartButton
              size="lg"
              variantId={variant.id}
              quantity={quantity}
              itemName={`${product.name}, ${variant.label}`}
              className="flex-1 sm:flex-none sm:min-w-56"
            />
          </div>
        ) : null}

        <PincodeCheck />

        {product.highlights.length > 0 ? (
          <section aria-labelledby="highlights-heading">
            <h2 id="highlights-heading" className="mb-2 text-base font-semibold">
              Highlights
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {product.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
