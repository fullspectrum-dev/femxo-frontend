"use client";

import { Star } from "lucide-react";
import { useRef, useState } from "react";
import type { ProductsApi } from "@femxo/shared/api";
import { isApiError } from "@femxo/shared/api";
import type { Review, ReviewList } from "@femxo/shared/contracts";
import { Badge, Button, Rating } from "@femxo/ui";
import { getProductsApi } from "@/lib/api";

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function Stars({ value }: { value: number }) {
  return (
    <span role="img" aria-label={`${value} out of 5 stars`} className="inline-flex gap-0.5 text-gold">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={14} fill={n <= value ? "currentColor" : "none"} aria-hidden="true" />
      ))}
    </span>
  );
}

/** Reviews: the average with a 5★-to-1★ breakdown, then the reviews newest first, a page at a time. */
export function ProductReviews({ slug, initial, products }: { slug: string; initial: ReviewList; products?: ProductsApi }) {
  const apiRef = useRef(products);
  const [reviews, setReviews] = useState<Review[]>(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const { summary } = initial;

  async function more() {
    if (!cursor) return;
    setBusy(true);
    setError(undefined);
    try {
      const next = await (apiRef.current ??= getProductsApi()).reviews(slug, cursor);
      setReviews((current) => [...current, ...next.items]);
      setCursor(next.nextCursor);
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn't load more reviews. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="reviews-heading" className="mx-auto w-full max-w-7xl px-4 py-6">
      <h2 id="reviews-heading" className="mb-4 font-display text-xl font-bold md:text-2xl">
        Ratings &amp; reviews
      </h2>
      {summary.count === 0 ? (
        <p className="text-ink-muted">No reviews yet.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
          <div className="grid content-start gap-3">
            <Rating value={summary.average} count={summary.count} />
            <ul aria-label="Ratings breakdown" className="grid gap-1.5 text-sm">
              {[5, 4, 3, 2, 1].map((stars) => {
                const n = summary.histogram[stars - 1]!;
                return (
                  <li key={stars} className="grid grid-cols-[2.5rem_1fr_2rem] items-center gap-2">
                    <span>{stars}★</span>
                    <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                      <span className="block h-full bg-success" style={{ width: `${(n / summary.count) * 100}%` }} />
                    </span>
                    <span className="text-right text-ink-muted">
                      {n}
                      <span className="sr-only"> reviews with {stars} stars</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="grid content-start gap-4">
            <ul className="grid gap-4">
              {reviews.map((review) => (
                <li key={review.id}>
                  <article className="grid gap-1 border-b border-line pb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Stars value={review.rating} />
                      <h3 className="text-sm font-semibold">{review.title}</h3>
                    </div>
                    <p className="text-sm">{review.body}</p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <span>{review.author}</span>
                      <time dateTime={review.createdAt}>{DATE.format(new Date(review.createdAt))}</time>
                      {review.verifiedPurchase ? <Badge tone="success">Verified purchase</Badge> : null}
                    </p>
                  </article>
                </li>
              ))}
            </ul>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            {cursor ? (
              <Button variant="secondary" busy={busy} onClick={more} className="justify-self-start">
                Show more reviews
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
