"use client";

import { Heart } from "lucide-react";
import type { ProductSummary } from "@femxo/shared/contracts";
import { cn } from "@femxo/ui";
import { useWishlist } from "./WishlistProvider";

/** The heart on a product: pressed when it is saved. A guest is taken to sign in. */
export function WishlistButton({ product, className }: { product: ProductSummary; className?: string }) {
  const { has, toggle, ready } = useWishlist();
  const saved = has(product.id);

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={`Save ${product.name} to wishlist`}
      title={saved ? "Remove from wishlist" : "Save to wishlist"}
      disabled={!ready}
      onClick={() => void toggle(product)}
      className={cn(
        "grid size-10 place-items-center rounded-full bg-surface/90 shadow-card backdrop-blur transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:scale-100",
        saved ? "text-danger" : "text-ink-muted hover:text-danger",
        className
      )}
    >
      <Heart size={20} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}
