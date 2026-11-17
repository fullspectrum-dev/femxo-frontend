"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatINR } from "@femxo/shared";
import { Button, buttonClasses, cn, EmptyState, ErrorState, Skeleton } from "@femxo/ui";
import { BillSummary } from "./BillSummary";
import { CartLineItem } from "./CartLineItem";
import { useCart } from "./CartProvider";

function CartSkeleton() {
  return (
    <div role="status" className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <span className="sr-only">Loading your cart…</span>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** The cart page: items with the server's prices and stock, warnings that block checkout until they are dealt with, the bill and the way on. */
export function CartPage() {
  const { cart, status, notice, dismissNotice, refresh, confirmPrices, fitToStock } = useCart();
  const [fixing, setFixing] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setFixing(true);
    await action();
    setFixing(false);
  }

  let body;
  if (status === "signed-out") {
    body = (
      <EmptyState
        title="Sign in to see your cart"
        message="Your cart is saved to your account, so it follows you from phone to phone."
        action={
          <Link href="/login?next=/cart" className={buttonClasses()}>
            Sign in
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
        message="Add something you need and it will wait here for a few days."
        action={
          <Link href="/" className={buttonClasses()}>
            Start shopping
          </Link>
        }
      />
    );
  } else {
    const blocked = !cart.canCheckout;
    const stockProblem = cart.hasStockIssue || cart.lines.some((l) => l.problem !== null || l.sufficient === false);
    const checkoutLink = (extra: string, label: string) => (
      <Link
        href="/checkout"
        aria-disabled={blocked || undefined}
        onClick={(event) => blocked && event.preventDefault()}
        className={buttonClasses({ size: "lg", className: cn(extra, blocked && "pointer-events-none opacity-60") })}
      >
        {label}
      </Link>
    );

    body = (
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-4">
          {cart.hasPriceChange ? (
            <div role="alert" data-testid="price-change-banner" className="grid gap-2 rounded-card border border-warning bg-warning-soft px-4 py-3">
              <p className="text-sm font-semibold text-ink">Some prices changed since you added them.</p>
              <p className="text-sm text-ink">Check the items marked below. You can only check out after you accept the new prices.</p>
              <Button size="sm" className="w-max" busy={fixing} onClick={() => void run(confirmPrices)}>
                Accept new prices
              </Button>
            </div>
          ) : null}
          {stockProblem ? (
            <div role="alert" data-testid="stock-banner" className="grid gap-2 rounded-card border border-danger bg-danger-soft px-4 py-3">
              <p className="text-sm font-semibold text-ink">Some items aren&apos;t available in the quantity you chose.</p>
              <Button size="sm" variant="secondary" className="w-max" busy={fixing} onClick={() => void run(fitToStock)}>
                Fix my cart
              </Button>
            </div>
          ) : null}
          <section aria-labelledby="items-heading" className="rounded-card border border-line bg-surface px-4 shadow-card">
            <h2 id="items-heading" className="sr-only">
              Items in your cart
            </h2>
            <ul>
              {cart.lines.map((line) => (
                <CartLineItem key={line.id} line={line} />
              ))}
            </ul>
          </section>
        </div>

        <div className="grid gap-4 lg:sticky lg:top-24">
          <BillSummary cart={cart} />
          {checkoutLink("hidden w-full md:inline-flex", "Proceed to checkout")}
          {/* Phones: total and checkout pinned above the bottom bar, one tap from anywhere in the list. */}
          <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur md:hidden">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-xs text-ink-muted">
                {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"} · To pay
              </p>
              <p className="text-lg font-bold tabular-nums">{formatINR(cart.total)}</p>
            </div>
            {checkoutLink("flex-none", "Checkout")}
          </div>
          {blocked ? <p className="text-center text-sm text-danger">Fix the items marked above to continue.</p> : null}
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
