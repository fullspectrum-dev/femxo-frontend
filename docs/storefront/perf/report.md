# Storefront performance report (step 8.4)

Measured on a production build (`next build` then `next start`) of `apps/web-customer`
in demo mode, with Lighthouse 13 in mobile mode (Moto-class viewport, 4× CPU slowdown,
slow-4G network). Three pages: the home page, a category (`/c/staples`) and a
product (`/p/magadh-mills-chakki-fresh-atta`). Numbers vary by machine and run.

## Results

Two throttling methods, because they disagree. *Simulated* is Lighthouse's default and is
the pessimistic one; *real* applies the throttling in the browser (DevTools).

### Real throttling (DevTools)

| Page | Runs | Performance | LCP | CLS | TBT | Before (previous report) |
|---|---|---|---|---|---|---|
| Home | 2 | 92–94 | 2.0–2.1 s | 0 | 193–255 ms | LCP 2.7 s, TBT 250 ms |
| Product | 2 | 93 | 2.1–2.2 s | 0 | 222–242 ms | LCP 2.4 s, TBT 360 ms |
| Category | 5 | 76–83 | 2.3–2.4 s | 0 | 452–761 ms | LCP 4.3–4.4 s, TBT 450–470 ms |

### Simulated throttling (Lighthouse default), three runs per page

| Page | Performance | LCP | CLS | TBT | Before |
|---|---|---|---|---|---|
| Home | 84–86 | 3.9–4.0 s | 0–0.047 | 100–211 ms | 64–70, LCP 4.2–4.8 s, TBT 620–780 ms |
| Category | 66–80 | 4.4–5.0 s | 0 | 155–575 ms | 59–60, LCP 4.1–4.2 s, TBT 1,340–1,550 ms |
| Product | 87–89 | 3.8 s | 0 | 63–151 ms | 63–70, LCP 3.5–4.2 s, TBT 760–1,090 ms |

## Against the targets (LCP < 2.5 s, CLS < 0.1 on mobile/4G)

- **CLS: met** on all three pages in every run (at most 0.069).
- **LCP, real throttling: met on all three pages** (home 2.0–2.1 s, product 2.1–2.2 s,
  category 2.3–2.4 s).
- **LCP, simulated throttling: not met on any page** (home 3.9–4.0 s, product 3.8 s,
  category 4.4–5.0 s). It is Lighthouse's most pessimistic model and it should not be
  quoted as a pass. It improved on home and product; on the category page it did not.

## What was done

Earlier (step 8.4, first pass):

- The demo backend (catalogue and seed, built in the browser) loads and builds on first
  use, after the page is idle, instead of during the first paint; the session check waits
  for idle too.
- Only the picture above the fold is eager; the logo asks for a small file; Space Grotesk
  loads two weights, not three.

This pass:

- **Product cards are server components.** `ProductCard` no longer uses the session; only
  its price (`CardPrice`, which depends on whether the shopper is a Prime member), the
  wishlist heart and quick-add are client islands. A page of cards hydrates far less
  JavaScript. This is what cut total blocking time on every page.
- **Explicit image priority.** The first banner, the product gallery picture and the first
  cards use `loading="eager"` and `fetchPriority="high"` (the Next 16 documentation
  recommends these over `priority`, which is deprecated).
- **The category page's first products are in the HTML, and built once.** The listing reads
  the address bar, so the static page could only carry its `Suspense` fallback, which was a
  grey skeleton: the product pictures did not exist until scripts ran (Lighthouse: "request
  is not discoverable in the initial document", 3.7 s resource load delay). The fallback is
  now the first page of cards, rendered on the server. The listing is also handed that same
  server-rendered page (`firstPage`) and shows it as it is until a filter, a sort or "Load
  more" changes the list, so the browser no longer rebuilds 24 client-side cards on top of
  it (that rebuild had pushed total blocking time up to 750–1,230 ms).

## Known issues and trade-offs

- **Category page, simulated throttling:** LCP 4.4–5.0 s. The first page still travels twice in the
  payload (the fallback and `firstPage`) plus the listing's initial data, about 290 KB of HTML;
  rendering it once would shrink that.
- About 400 KB of framework JavaScript (react-dom ≈ 235 KB, Next's client ≈ 160 KB, before
  compression) still runs on every page.
- Two fonts (≈ 130 KB) share the connection with that JavaScript.
- The numbers above come from a developer machine, a few runs each (two for real
  throttling on home and product). Use the median of at least three runs before quoting
  them.

## Next steps if the target matters

1. Category page: send the first page once in the payload (it is rendered once but travels as
   both the fallback and `firstPage`).
2. Split the providers so a page that doesn't need the cart or wishlist doesn't wait on them.
3. Self-host one font file with `unicode-range` and `font-display: optional` for the display face.
4. Re-measure against the real API (`NEXT_PUBLIC_API_MODE=http`): the demo backend's cost then
   disappears entirely.

## How to reproduce

```
NEXT_DIST_DIR=.next-perf pnpm --filter @femxo/web-customer exec next build
NEXT_DIST_DIR=.next-perf pnpm --filter @femxo/web-customer exec next start --hostname 127.0.0.1 --port 3033
npx lighthouse@13 http://127.0.0.1:3033/ --only-categories=performance \
  --chrome-flags="--headless=new" --output=json --output-path=home.json
# real (DevTools) throttling:
npx lighthouse@13 http://127.0.0.1:3033/ --only-categories=performance \
  --throttling-method=devtools --chrome-flags="--headless=new" --output=json --output-path=home-real.json
```
