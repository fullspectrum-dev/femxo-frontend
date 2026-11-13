"use client";

import { Crown, X } from "lucide-react";
import Link from "next/link";
import { formatINR } from "@femxo/shared";
import { buttonClasses, cn, EmptyState, ErrorState, Skeleton } from "@femxo/ui";
import { useSession } from "@/features/auth/components/SessionProvider";
import { BillSummary } from "./BillSummary";
import { CartLineItem, lineProblem } from "./CartLineItem";
import { useCart } from "./CartProvider";
import { CouponBox } from "./CouponBox";

/** Free delivery starts here (paise); the server's bill is the truth, this only drives the nudge. */
const FREE_DELIVERY_FROM = 49900;

function CartSkeleton() {
  return (
    <div role="status" className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <span className="sr-only">Loading your cart…</span>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** The cart page: items, coupon, bill and the way on to checkout. */
export function CartPage() {
  const { cart, status, notice, dismissNotice, refresh } = useCart();
  const { user } = useSession();

  let body;
  if (!cart && status === "coming-soon") {
    body = (
      <EmptyState
        title="Your cart opens soon"
        message="Ordering isn't switched on yet. Browse the catalogue now and add items as soon as it opens."
        action={
          <Link href="/" className={buttonClasses()}>
            Keep browsing
          </Link>
        }
      />
    );
  } else if (!cart && status === "error") {
    body = <ErrorState title="We couldn't load your cart" message="Check your connection and try again." onRetry={() => void refresh()} />;
  } else if (!cart) {
    body = <CartSkeleton />;
  } else if (cart.lines.length === 0) {
    body = (
      <EmptyState
        title="Your cart is empty"
        message="Add something you need and it will wait here for 7 days."
        action={
          <Link href="/" className={buttonClasses()}>
            Start shopping
          </Link>
        }
      />
    );
  } else {
    const blocked = cart.lines.some((line) => lineProblem(line) !== null);
    const primeSaving = cart.lines.reduce((sum, line) => sum + (line.variant.price - line.variant.primePrice) * line.quantity, 0);
    const toFreeDelivery = FREE_DELIVERY_FROM - (cart.breakup.total - cart.breakup.delivery);

    body = (
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="items-heading" className="rounded-card border border-line bg-surface px-4 shadow-card">
          <h2 id="items-heading" className="sr-only">
            Items in your cart
          </h2>
          {cart.breakup.delivery > 0 && toFreeDelivery > 0 ? (
            <div className="mt-4 grid gap-2 rounded-control bg-gold-soft px-3 py-2.5">
              <p className="text-sm">
                Add <strong className="tabular-nums">{formatINR(toFreeDelivery)}</strong> more for free delivery.
              </p>
              <div
                role="progressbar"
                aria-label="Progress to free delivery"
                aria-valuemin={0}
                aria-valuemax={FREE_DELIVERY_FROM}
                aria-valuenow={FREE_DELIVERY_FROM - toFreeDelivery}
                className="h-1.5 overflow-hidden rounded-full bg-surface"
              >
                <div className="h-full rounded-full bg-gold-deep transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.round(((FREE_DELIVERY_FROM - toFreeDelivery) / FREE_DELIVERY_FROM) * 100)}%` }} />
              </div>
            </div>
          ) : null}
          <ul>
            {cart.lines.map((line) => (
              <CartLineItem key={line.id} line={line} />
            ))}
          </ul>
        </section>

        <div className="grid gap-4 lg:sticky lg:top-24">
          {!user?.isPrime && primeSaving > 0 ? (
            <Link href="/prime" className="flex items-center gap-2 rounded-card border border-gold bg-gold-soft px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-focus">
              <Crown size={18} className="text-gold-deep" aria-hidden="true" />
              Save {formatINR(primeSaving)} more on this cart, plus free delivery, with Prime
            </Link>
          ) : null}
          <CouponBox />
          <BillSummary cart={cart} />
          <Link
            href="/checkout"
            aria-disabled={blocked || undefined}
            onClick={(event) => blocked && event.preventDefault()}
            className={buttonClasses({ size: "lg", block: true, className: cn("hidden md:inline-flex", blocked && "pointer-events-none opacity-60") })}
          >
            Proceed to checkout
          </Link>
          {/* Phones: total and checkout pinned above the bottom bar, one tap from anywhere in the list. */}
          <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur md:hidden">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-xs text-ink-muted">
                {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"} · To pay
              </p>
              <p className="text-lg font-bold tabular-nums">{formatINR(cart.breakup.total)}</p>
            </div>
            <Link
              href="/checkout"
              aria-disabled={blocked || undefined}
              onClick={(event) => blocked && event.preventDefault()}
              className={buttonClasses({ size: "lg", className: cn("flex-none", blocked && "pointer-events-none opacity-60") })}
            >
              Checkout
            </Link>
          </div>
          {blocked ? <p className="text-center text-sm text-danger">Fix the items marked above to continue.</p> : null}
          {!user ? (
            <p className="text-center text-sm text-ink-muted">
              <Link href="/login?next=/cart" className="font-semibold text-primary hover:underline">
                Sign in
              </Link>{" "}
              to keep this cart on every device and get Prime prices.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6">
      <h1 className="mb-4 font-display text-2xl font-bold md:text-3xl">Your cart</h1>
      {notice ? (
        <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-control bg-info-soft px-4 py-3 text-sm text-info">
          <p>{notice}</p>
          <button type="button" aria-label="Dismiss message" onClick={dismissNotice} className="grid size-8 flex-none place-items-center rounded-full hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {body}
      {/* Room for the phone checkout bar, so it never covers the last of the page. */}
      {cart && cart.lines.length > 0 ? <div aria-hidden="true" className="h-16 md:hidden" /> : null}
    </section>
  );
}
