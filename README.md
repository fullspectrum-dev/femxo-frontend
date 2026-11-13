# Femxo frontend

The Femxo frontends for [femxo-backend](../femxo-backend), as a pnpm workspace
(backend ADR 0003 keeps all frontends in this repository). There is no mock or
demo data: every screen reads femxo-backend.

| Package | What it is |
|---|---|
| `apps/web` | The website, staff sign-in, account page and the admin panel (Next.js, port 3001) |
| `apps/web-customer` | The customer storefront (Next.js, port 3002) |
| `packages/shared` | Storefront API contracts, clients, and the adapters (http, and the `/store/v1` catalog mapper) |
| `packages/ui` | Storefront design tokens and components |

## Requirements and local setup

- Node.js 24.15 or later, pnpm 11.20.
- femxo-backend running (default `http://localhost:3000`).

```powershell
pnpm install
Copy-Item apps/web/.env.example apps/web/.env.local
pnpm dev          # website + admin on 3001, storefront on 3002
```

## Configuration

| Variable | Used by | Purpose |
|---|---|---|
| `FEMXO_API_ORIGIN` | both, build time | Where femxo-backend runs. Both sites forward their API calls there, so the refresh cookie (`Path=/auth`, `SameSite=Strict`) works same-origin. Default `http://localhost:3000`. |
| `NEXT_PUBLIC_API_BASE_URL` | both, build time | Optional. Call the API origin directly (must be the same site, and listed in the API's `CORS_ORIGINS`). |
| `NEXT_PUBLIC_STORE_URL` | `apps/web` | Where the storefront runs; the landing page's "Customer sign in" links there. |

`NEXT_PUBLIC_*` values are baked into the build. Never put secrets in them.

## Admin panel (`/admin`)

Sign in with a staff account. Each module is a registry entry
(`features/admin/modules/registry.ts`) plus a service (`features/admin/services/*`)
that talks to the API. A module whose backend route does not exist shows
"Coming soon".

| Live | Backend |
|---|---|
| Dashboard | `/dashboard/*` |
| Users, Roles | `/users`, `/access/roles` |
| Products | `/catalog/admin/products` |
| Dealers, Sub-dealers | `/dealer`, `/sub-dealers` |
| Customers, Orders, Invoices | `/customers`, `/orders` (+ `/delivery`), `/billing` |
| Warehouse (stock, transfers, ledger) | `/inventory/*` |
| Finance (wallets, payouts) | `/wallets`, `/finance/payouts` |
| Prime (plans, subscriptions) | `/membership/*` |
| Reports, Notification templates, Failed jobs | `/reports/jobs`, `/notifications/templates`, `/admin/dead-letters` |
| Command center (dashboard) | `/dashboard/*`, `/approvals`, `/delivery/returns`, `/delivery/routes`, `/cod/tasks`, `/inventory/transfers` |
| Approvals (maker-checker queue) | `/approvals` |
| Delivery runs, Returns, COD recovery | `/delivery/routes`, `/delivery/returns`, `/cod/tasks` |
| Brands, Categories, Warehouses | `/catalog/brands`, `/catalog/categories`, `/inventory/warehouses` |
| Commission plans | `/commission/plans`, `/commission/versions` |
| Company Overview | `/cms/admin/sections` |
| Notification bell | `/notifications` |

Not available yet (no backend route): security events, audit log, integrations,
notification deliveries.

The admin panel's design rules are in `design-system/femxo/pages/admin.md`.

## Storefront

Reads the public catalog (`/store/v1`: categories, brands, products). Search,
filters and sorting run in the browser over that catalog. The backend has no
customer sign-in, cart, checkout, orders, reviews, ratings or stock levels yet,
so those screens show "not available yet" rather than invented data.

## Tests

```powershell
pnpm typecheck
pnpm lint
pnpm test                         # unit tests
pnpm test:e2e                     # admin against a running backend (see apps/web/e2e)
```
