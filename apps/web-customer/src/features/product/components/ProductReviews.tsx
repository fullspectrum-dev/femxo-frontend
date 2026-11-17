"use client";

import { Star } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { userMessage } from "@femxo/shared/api";
import type { ProductsApi } from "@femxo/shared/api";
import { ReviewInput } from "@femxo/shared/contracts";
import type { Review, ReviewList } from "@femxo/shared/contracts";
import { Button, Rating, TextField, cn } from "@femxo/ui";
import { useSession } from "@/features/auth/components/SessionProvider";
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

/** Write a review: a star rating, an optional headline and the words. Reviews are checked by our team before they show. */
function ReviewForm({ productId, productName, products, onDone }: { productId: string; productName: string; products?: ProductsApi; onDone: () => void }) {
  const apiRef = useRef(products);
  const groupId = useId();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<{ rating?: string; body?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = ReviewInput.safeParse({ rating, title: title.trim() || undefined, body });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) next[(issue.path[0] as "rating" | "body") ?? "form"] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await (apiRef.current ??= getProductsApi()).submitReview(productId, parsed.data);
      setSent(true);
    } catch (error) {
      setErrors({ form: userMessage(error, "We couldn't send your review. Please try again.") });
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div role="status" data-testid="review-sent" className="grid gap-2 rounded-card border border-success bg-success-soft p-4 text-sm">
        <p className="font-semibold">Thank you! Your review has been sent.</p>
        <p>It will show here once our team has checked it.</p>
        <Button variant="ghost" size="sm" className="w-max" onClick={onDone}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-label={`Review ${productName}`} className="grid gap-3 rounded-card border border-line bg-surface p-4">
      <fieldset className="grid gap-1.5">
        <legend className="text-sm font-semibold">Your rating</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
              <input type="radio" name={`${groupId}-rating`} value={n} checked={rating === n} onChange={() => setRating(n)} className="sr-only" />
              <span className="sr-only">{n} {n === 1 ? "star" : "stars"}</span>
              <Star size={30} aria-hidden="true" fill={n <= rating ? "currentColor" : "none"} className={cn("text-gold", n <= rating ? "" : "opacity-60")} />
            </label>
          ))}
        </div>
        {errors.rating ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {errors.rating}
          </p>
        ) : null}
      </fieldset>
      <TextField label="Headline" optional maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid gap-1.5">
        <label htmlFor={`${groupId}-body`} className="text-sm font-semibold">
          Your review
        </label>
        <textarea
          id={`${groupId}-body`}
          rows={4}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={errors.body ? `${groupId}-body-error` : undefined}
          className={cn("w-full rounded-control border bg-surface px-3 py-2 text-[15px] outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus", errors.body ? "border-danger" : "border-line-input")}
        />
        {errors.body ? (
          <p id={`${groupId}-body-error`} role="alert" className="text-xs font-medium text-danger">
            {errors.body}
          </p>
        ) : null}
      </div>
      <div role="alert">{errors.form ? <p className="text-sm font-medium text-danger">{errors.form}</p> : null}</div>
      <div className="flex gap-3">
        <Button type="submit" busy={busy}>
          Send review
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Reviews: the average with a 5-to-1 star breakdown, then the reviews newest first, a page at a time, and a way to write one. */
export function ProductReviews({ productId, productName, initial, products }: { productId: string; productName: string; initial: ReviewList | null; products?: ProductsApi }) {
  const apiRef = useRef(products);
  const { status } = useSession();
  const pathname = usePathname();
  const [reviews, setReviews] = useState<Review[]>(initial?.items ?? []);
  const [summary, setSummary] = useState(initial?.summary ?? { count: 0, average: 0, distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 } });
  const [cursor, setCursor] = useState(initial?.nextCursor ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [writing, setWriting] = useState(false);
  const [loadFailed, setLoadFailed] = useState(initial === null);

  // The page is cached for hours; reviews published since are read fresh.
  useEffect(() => {
    let cancelled = false;
    (apiRef.current ??= getProductsApi())
      .reviews(productId)
      .then((fresh) => {
        if (cancelled) return;
        setReviews(fresh.items);
        setSummary(fresh.summary);
        setCursor(fresh.nextCursor);
        setLoadFailed(false);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [productId]);

  async function more() {
    if (!cursor) return;
    setBusy(true);
    setError(undefined);
    try {
      const next = await (apiRef.current ??= getProductsApi()).reviews(productId, cursor);
      setReviews((current) => [...current, ...next.items]);
      setCursor(next.nextCursor);
    } catch (e) {
      setError(userMessage(e, "We couldn't load more reviews. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="reviews-heading" className="font-display text-xl font-bold md:text-2xl">
          Ratings &amp; reviews
        </h2>
        {status === "signed-in" ? (
          writing ? null : (
            <Button variant="secondary" size="sm" onClick={() => setWriting(true)}>
              Write a review
            </Button>
          )
        ) : (
          <Link href={`/login?next=${encodeURIComponent(`${pathname}#reviews`)}`} className="text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus">
            Sign in to review
          </Link>
        )}
      </div>

      {writing ? (
        <div className="mb-6 grid max-w-xl gap-2">
          <ReviewForm productId={productId} productName={productName} products={products} onDone={() => setWriting(false)} />
          <p className="text-xs text-ink-muted">You can review products you have received.</p>
        </div>
      ) : null}

      {loadFailed && summary.count === 0 ? <p className="text-sm text-ink-muted">Reviews couldn&apos;t be loaded right now.</p> : null}
      {summary.count === 0 && !loadFailed ? (
        <p className="text-ink-muted">No reviews yet.</p>
      ) : summary.count === 0 ? null : (
        <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
          <div className="grid content-start gap-3">
            <Rating value={summary.average} count={summary.count} />
            <ul aria-label="Ratings breakdown" className="grid gap-1.5 text-sm">
              {([5, 4, 3, 2, 1] as const).map((stars) => {
                const n = summary.distribution[String(stars) as "1" | "2" | "3" | "4" | "5"];
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
                      {review.title ? <h3 className="text-sm font-semibold">{review.title}</h3> : null}
                    </div>
                    <p className="text-sm">{review.body}</p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <span>{review.authorName}</span>
                      <time dateTime={review.createdAt}>{DATE.format(new Date(review.createdAt))}</time>
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
