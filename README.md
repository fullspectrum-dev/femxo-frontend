# Femxo frontend

The Femxo frontends for [femxo-backend](../femxo-backend), as a pnpm workspace
(backend ADR 0003 keeps all frontends in this repository):

| Package | What it is |
|---|---|
| `apps/web` | The website, sign-in and account screens, and the Super Admin panel (Next.js App Router, port 3001) |
| `apps/web-customer` | The customer storefront (Next.js, port 3002), being built per [docs/storefront](docs/storefront/plan.md) |
| `packages/shared` | API contracts, API client and adapters (mock / http), seed data |
| `packages/ui` | Storefront design tokens and components |

Workspace packages ship TypeScript source (no build step); Next compiles them.
`NEXT_PUBLIC_API_MODE` (`mock` by default, or `http`) picks the storefront's
API adapter at build time; any other value fails the build.

In `apps/web` the landing page explains the network; signed-in users get a
role-based workspace page (announced as coming soon) built from what the
backend says about their role and territory, and the Super Admin gets the
admin panel at `/admin`.

## Requirements and local setup

- Node.js 24.15 or later.
- pnpm 11.20 (pinned for the Docker image too).

```powershell
pnpm install
Copy-Item apps/web/.env.example apps/web/.env.local
pnpm dev                          # both: website + admin on 3001, storefront on 3002
pnpm dev:web                      # or just the website + admin
pnpm dev:shop                     # or just the storefront
```

Open `http://localhost:3001`: the landing page is the front door. **Customer sign in** there
goes to the storefront's sign-in page (`NEXT_PUBLIC_STORE_URL`, default
`http://localhost:3002`); **Staff sign in** is the one for admins and partners. A new
customer picks *Create an account*, gives a mobile number (demo code `123456`) and a name,
then signs in with the account and lands in the store. The site runs on **dummy data** (demo mode) by
default, locally and in production: sign-in runs in the browser with test
accounts and no backend is called. To connect femxo-backend later, start it,
set `NEXT_PUBLIC_AUTH_DEMO_MODE=false` and `FEMXO_API_ORIGIN`, and rebuild.
Restart `pnpm dev:web` after changing `apps/web/next.config.ts` or `.env.local`.

## Routes

| Route | What it is |
|---|---|
| `/` | Landing page |
| `/careers` | Careers |
| `/login` | One sign-in for every role (email and password) |
| `/change-password` | Required after an admin sets a temporary password; also voluntary |
| `/forgot-password` | Explains that admins reset passwords (the backend has no self-service reset) |
| `/account` | The signed-in user's workspace for their role, plus their current access |
| `/admin/*` | Super Admin panel, all 17 modules (prototype data until the admin APIs exist) |

Old URLs (`/register`, `/verify-otp`, `/reset-password`, `/{portal}/login` and so
on) redirect to these.

## Configuration

| Variable | When | Purpose |
|---|---|---|
| `FEMXO_API_ORIGIN` | build | Where femxo-backend runs. Once connected, the site forwards `/auth`, `/access` and `/territories` to it. Default `http://localhost:3000`. |
| `NEXT_PUBLIC_API_BASE_URL` | build | Optional. Call the API origin directly instead of through the forwarding. |
| `NEXT_PUBLIC_AUTH_DEMO_MODE` | build | Leave unset for dummy data (the default everywhere). Set `false` to connect the backend. |

All three are read at build time: rewrites and `NEXT_PUBLIC_*` values are baked
into the build. None of them is a secret; never put secrets in `NEXT_PUBLIC_*`.

**Why the forwarding.** The backend's refresh token cookie is `Path=/auth`,
`SameSite=Strict`, `Secure`, `httpOnly`. Serving `/auth` from this site's origin
keeps it first-party with no CORS setup. If you use `NEXT_PUBLIC_API_BASE_URL`
instead, the API must be on the same site (e.g. `api.femxo.com` for `femxo.com`)
and list this site in its `CORS_ORIGINS`.

**Rate limits behind the forwarding.** The backend limits login attempts per
client IP. Through the forwarding, requests reach it from this server, so set the
backend's `TRUST_PROXY_HOPS` to count every proxy in front of it (load balancer
*and* this server), or every user shares one limit.

## Backend contract

The client ([auth-client.ts](apps/web/src/features/auth/services/auth-client.ts)) uses:

| Endpoint | Use |
|---|---|
| `POST /auth/login` | `{ email, password }` → `{ accessToken, expiresIn, user }` and the refresh cookie |
| `POST /auth/refresh` | Cookie → new `{ accessToken, expiresIn }`; the cookie rotates |
| `POST /auth/logout` | Ends the session |
| `GET /auth/me` | The user, including `mustChangePassword` |
| `POST /auth/password` | `{ currentPassword, newPassword }`; signs out other sessions |
| `GET /access/me` | `{ isSuperAdmin, permissions, roles, territoryIds, locationIds }` |
| `GET /territories/:id` | A location and its ancestors, for breadcrumbs |

Errors are `{ error: { code, message } }`; the client maps each code
(`INVALID_CREDENTIALS`, `TOO_MANY_ATTEMPTS` with `Retry-After`, `WRONG_PASSWORD`,
…) to a friendly message. The access token lives only in memory. Refreshes are
single-flight and serialised across tabs with a Web Lock, because the backend
revokes the whole session when a rotated refresh token is reused.

The workspace page picks a role from `roles` by name ([roles.ts](apps/web/src/lib/roles.ts));
a role with an unrecognised name gets a generic workspace.

## Demo accounts

With demo mode on, `/login` offers one account per role (Super Admin, Admin,
Warehouse, Dealer, Field staff, Sub-dealer, Customer) and a "First sign-in"
account that must change its password. The demo
([demo-backend.ts](apps/web/src/features/auth/services/demo-backend.ts)) answers with the
backend's shapes and error codes. Its passwords are public and grant nothing.
Once the backend is connected (`NEXT_PUBLIC_AUTH_DEMO_MODE=false`), production
builds replace it with a stub, so the demo accounts don't ship alongside real ones.

## Quality checks

Run from the repo root; each command runs in every package that has it.

```powershell
pnpm lint
pnpm typecheck
pnpm test                         # unit tests (Vitest)
pnpm --filter @femxo/web exec playwright install chromium
pnpm test:e2e                     # mocked backend, demo off (port 3011)
pnpm test:e2e:demo                # demo mode (port 3012)
pnpm --filter @femxo/web test:e2e:demo:production   # demo mode on a production build
pnpm build
```

## Deploying on Vercel

The repository holds two Next.js apps and no Next.js at the root, so Vercel needs **one
project per app, each with its Root Directory set**. Without that, the build stops with
"No Next.js version detected".

| Project | Root Directory | Environment variables |
|---|---|---|
| Website + admin | `apps/web` | `NEXT_PUBLIC_STORE_URL` = the storefront project's address (e.g. `https://shop.femxo.in`, no trailing slash) |
| Customer storefront | `apps/web-customer` | none needed for demo data (`NEXT_PUBLIC_API_MODE` defaults to `mock`) |

For both projects: keep "Include source files outside of the Root Directory" **on**
(the apps import `packages/shared` and `packages/ui`); the install and build commands can
stay at their defaults. Each app's `vercel.json` selects the Next.js framework and turns on
Corepack, so the build uses the pinned pnpm 11 and Node 24 (`engines` in the root
`package.json`).

`NEXT_PUBLIC_*` values are baked in at build time: change one, then redeploy. If
`NEXT_PUBLIC_STORE_URL` is missing in a production build, the website simply leaves out its
"Customer sign in" links (it never points visitors at localhost).

## Deployment

`pnpm build:web` produces a self-contained server in
`apps/web/.next/standalone` (`output: "standalone"`). It is traced from the
workspace root, so the server sits at `apps/web/server.js` inside that folder.
Build the Docker image from the repo root:

```powershell
docker build -t femxo-frontend --build-arg FEMXO_API_ORIGIN=http://api:3000 .
docker run -p 3001:3001 femxo-frontend
```

Without Docker, copy the assets next to the server and run it:

```powershell
pnpm build:web
cd apps/web
Copy-Item -Recurse public .next/standalone/apps/web/
Copy-Item -Recurse .next/static .next/standalone/apps/web/.next/
$env:PORT = 3001; node .next/standalone/apps/web/server.js
```

Serve it over HTTPS (the refresh cookie is `Secure`). Every response carries
`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
`Permissions-Policy` and `Strict-Transport-Security`. There is no
Content-Security-Policy yet: the theme script in `app/layout.tsx` is inline and
needs a nonce first.

`reportAuthFailure` emits a `femxo:auth-failure` browser event with only the
endpoint, status and failure kind (no form values), for wiring to monitoring.
