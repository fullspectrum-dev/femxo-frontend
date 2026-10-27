"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ProductSummary } from "@femxo/shared/contracts";
import { Button, buttonClasses, EmptyState, ErrorState, Skeleton, useToast } from "@femxo/ui";
import { RequireCustomer } from "@/features/auth/components/Guards";
import { useCart } from "@/features/cart/components/CartProvider";
import { ProductCard } from "@/features/catalog/components/ProductCard";
import { useWishlist } from "./WishlistProvider";

/** One saved product, with the way to buy it: move it to the cart, or open it to choose a size. */
function SavedProduct({ product }: { product: ProductSummary }) {
  const { add } = useCart();
  const { toggle } = useWishlist();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function moveToCart() {
    setBusy(true);
    const result = await add(product.variantId, 1);
    if (result.ok) {
      await toggle(product);
      toast("Moved to cart");
    }
    setBusy(false);
  }

  return (
    <li className="flex flex-col gap-2">
      <ProductCard product={product} quickAdd={false} />
      {!product.inStock ? (
        <p className="text-center text-sm text-ink-muted">Out of stock right now</p>
      ) : product.variantCount > 1 ? (
        <Link href={`/p/${product.slug}`} className={buttonClasses({ variant: "secondary", size: "sm", block: true })}>
          Choose size
        </Link>
      ) : (
        <Button variant="secondary" size="sm" block busy={busy} aria-label={`Move to cart: ${product.name}`} onClick={() => void moveToCart()}>
          <ShoppingCart size={16} aria-hidden="true" />
          Move to cart
        </Button>
      )}
    </li>
  );
}

function SavedProducts() {
  const { items, ready, failed, retry } = useWishlist();

  if (failed) return <ErrorState title="We couldn't load your wishlist" message="Check your connection and try again." onRetry={retry} />;
  if (!ready) {
    return (
      <div role="status" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <span className="sr-only">Loading your wishlist…</span>
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} className="aspect-[3/4] w-full" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="Your wishlist is empty"
        message="Tap the heart on anything you like and it will wait here."
        action={
          <Link href="/" className={buttonClasses()}>
            Start shopping
          </Link>
        }
      />
    );
  }
  return (
    <>
      <h2 className="sr-only">Saved products</h2>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((product) => (
          <SavedProduct key={product.id} product={product} />
        ))}
      </ul>
    </>
  );
}

/** The wishlist page (customers only). */
export function WishlistPage() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6">
      <h1 className="mb-4 font-display text-2xl font-bold md:text-3xl">Your wishlist</h1>
      <RequireCustomer>
        <SavedProducts />
      </RequireCustomer>
    </section>
  );
}
