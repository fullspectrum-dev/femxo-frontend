# Femxo storefront design system (MASTER)

The global source of truth for how the customer storefront (`apps/web-customer`) looks and behaves. Built with the ui-ux-pro-max skill for **quick commerce**, then adapted to the Femxo brand.

- Values live in [`packages/ui/src/tokens.css`](../../packages/ui/src/tokens.css). This file says how to use them.
- A page that needs to break a rule gets its own file in `pages/<page>.md`, and that file wins for that page.

## 1. Direction

**Flat, block-based, product-first.**

- Hierarchy comes from colour blocks, type weight and spacing, not shadows.
- Shadows only go on things that float above the page: sheets, the cart bar, toasts and dropdowns.
- Products must be visible on the first phone screen. Promotional blocks stay short on phones.
- Every action a shopper repeats (add, change quantity, go to the cart) is one tap and happens where they are.

Avoid: 3D "key" buttons, heavy elevation, gradients behind body text, emoji as icons, and made-up claims (delivery times, ratings or stock the backend didn't send).

## 2. Colour

Use tokens only. Never put raw hex values in components.

| Token | Use |
|---|---|
| `primary` / `on-primary` | Actions, links, active states. Flips to lavender in dark mode. |
| `brand` | Colour blocks that always carry **white** text (hero, promo blocks). Stays purple in dark mode. Never put white text on `primary`. |
| `primary-deep` | Header band, Prime strip, footer Prime card. |
| `primary-soft` | Selected chips, icon tiles, the resting ADD button. |
| `gold` / `on-gold` | Prime and the main promo CTA. Gold always means Prime or a highlight. |
| `success` (+ `-soft`) | **Savings only**: "% OFF", "you save". Never decoration. |
| `ink`, `ink-muted` | Body text, secondary text. |
| `canvas`, `surface`, `surface-sunken`, `line` | Page, card, inset or idle chip, hairlines. |

Every text pair passes WCAG AA (4.5:1) in light and dark, and input borders pass 3:1. Re-check whenever you change a token.

## 3. Type

- **Rubik** (`font-display`): headings, prices, buttons, chips, navigation labels.
- **Nunito Sans** (`font-sans`): reading text.
- Prices use `font-display font-bold tabular-nums`.
- Body text is at least 14px (16px for long text). Captions are at least 11px.

## 4. Shape and spacing

- `rounded-card` (16px) for blocks and cards, `rounded-control` (12px) for buttons and inputs, `rounded-full` for chips and pills.
- Touch targets are at least 44×44px. Primary card actions are `h-11` and full width.
- Page container: `mx-auto max-w-7xl px-4`. Section rhythm: `py-5` or `py-6`.

## 5. Motion

- 150–180ms, `ease-out`. Presses scale (`active:scale-[0.97]`) and never move the layout.
- `animate-rise` for floating bars entering, `animate-pop` for count badges.
- `prefers-reduced-motion` turns all of it off (a global rule in `globals.css`).

## 6. Core quick-commerce patterns

| Pattern | Component | Rule |
|---|---|---|
| Add on the card | `CardAction` | "ADD" becomes − qty + in place. Ceiling: min(stock, maxPerOrder). Products with several sizes show "N options" and link to the product page. |
| Basket always in reach | `CartBar` | Floats above the phone bottom bar once the cart has items. Hidden on cart, checkout and sign-in. On product pages it shows on desktop only. |
| Pinned action on long pages | Product page and cart | On phones, price plus the main action is pinned above the bottom bar, with a matching `h-16` spacer at the end of the page. |
| Delivery area | `DeliveryChip` | Pincode in the header. Stored on the device. Never shows an ETA the backend didn't provide. |
| Browse fast | `CategoryTiles`, `CategoryNav` | A swipeable rail of tiles plus pill chips. A lettered tile appears when a category has no image. |
| Savings | `ProductCard` ribbon, `Price` | One discount signal per card: the green ribbon on the picture. The full price block shows it on the product page. |
| Aisle rail | Category page `AisleRail` | The department's aisles as pictures in a sticky left rail ("All" first). The active aisle gets a bar as well as colour. Filters move into a sheet (`filtersInSheet`). |
| ADD on the picture | `CardAction variant="pill"` | The pill sits on the picture's bottom-right corner, 44px tall. Products with several sizes link to the product page and show "N options" next to the pack size. |
| Card anatomy | `ProductCard` | Picture → pack size (and options) → name (2 lines, fixed height) → brand → price. Cards in a row always line up. |
| Department sections | Home `DepartmentSection` | Aisle tiles (4 across on phones), then a "Best of X" rail. |
| Cycling search hint | `SearchBox` | Only words the catalogue stocks. Stops when the box is focused or filled, or when reduced motion is on. |
| Pack art | `packArtUrl` / `/art/...svg` | Drawn pack with the product's **real** name and brand, on a transparent background. Used only when there is no uploaded photo. Never use a picture of another brand's pack. |

## 7. Accessibility checklist (before shipping a screen)

- [ ] Visible focus on every control (gold ring on the purple header, `focus` token elsewhere).
- [ ] Icon-only buttons have an `aria-label`. Decorative icons have `aria-hidden`.
- [ ] Quantity changes are announced (`output aria-live`).
- [ ] No horizontal page scroll at 375, 768, 1024 or 1440px.
- [ ] Light and dark both checked.
- [ ] Loading uses skeletons that keep the layout. Errors offer a retry. Empty states offer a next step.
