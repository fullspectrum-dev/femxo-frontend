# SPEC-AUTH: Authentication (admin panel ↔ femxo-backend)

Status: SPEC-AUTH-01 approved. SPEC-AUTH-02 to 06 added after approval, same format.

Frontend under test: `femxo-frontend/apps/web` (admin, live mode), served at `FRONTEND_URL` (default `http://localhost:3001`).
Backend under test: `femxo-backend/modules/identity` (`/auth/*`), served at `BASE_URL` (default `http://localhost:3000`).
The browser calls `/auth/*` on the frontend origin; Next.js rewrites proxy it to the API, so the refresh cookie (`Path=/auth`, `HttpOnly`, `Secure`, `SameSite=Strict`) is same-origin.

## SPEC-AUTH-01: Successful login

**Priority:** P0

### Preconditions and test data

| Item | Value |
|---|---|
| Services | API `/health` = 200, frontend reachable, Mongo `rs0` and Redis up |
| Frontend build flags | `NEXT_PUBLIC_AUTH_DEMO_MODE=false`, `NEXT_PUBLIC_ADMIN_DATA_MODE=live` |
| User | `e2e-admin@femxo.test` (super admin, status `active`, `mustChangePassword=false`), from env `E2E_ADMIN_EMAIL` with default as shown |
| Password | env `E2E_ADMIN_PASSWORD` only. Never hardcoded, never logged |
| Session state | Fresh browser context, no cookies, not signed in |
| Rate limit | Login limit is 5 failures per email and 30 attempts per IP per 15 min, and successful logins count. Runs sequentially, one login per scenario, shared session reused where the scenario allows |

### Scenario

- **Given** the visitor is signed out and `/login` is open
- **When** they enter the admin email and password and press "Sign in"
- **Then** the backend authenticates them, sets the refresh cookie, and the UI lands on the admin dashboard

### Expected API

| Field | Expected |
|---|---|
| Method and path | `POST /auth/login` |
| Request body | `{ "email": "<email>", "password": "<password>" }` (never logged) |
| Status | `200` |
| Response body keys | `accessToken` (string, JWT), `expiresIn` (number, `900`), `user` |
| `user` keys | `id`, `email`, `name`, `isSuperAdmin` (`true`), `status` (`"active"`), `mustChangePassword` (`false`), `createdAt` |
| Must not contain | `passwordHash`, `$argon2`, `_id`, `__v`, `refreshToken` in the body |
| `Set-Cookie` | refresh cookie with `HttpOnly`, `Path=/auth`, `SameSite=Strict`; value not in body |
| Follow-up | `GET /access/me` returns `200` with `isSuperAdmin: true` |

### Expected UI state

- URL becomes `/admin/dashboard` (super admin home; `/account` for other roles).
- Sign-in form is gone; the admin shell renders (sidebar and topbar).
- The access token lives in memory only: `localStorage` and `sessionStorage` hold no token, and `document.cookie` does not expose the refresh cookie (HttpOnly).
- A reload keeps the session (`POST /auth/refresh` returns `200`, user stays on the admin shell).
- No error alert is visible.

### Evidence captured

Screenshot of the dashboard after login (always), trace on first retry, screenshot on failure. Token values are truncated to 20 characters in logs.

### Cleanup considerations

- No data is created, so no records to remove.
- The login creates a session in Redis and an `audit_logs` row. Both are left in place (the audit trail is kept; sessions expire on their own).
- The scenario signs out in `afterEach` via `POST /auth/logout` (via the UI) so refresh tokens do not pile up. If sign-out is skipped, nothing else is affected.
- It consumes 1 of the 30 per-IP attempts; the suite budgets its logins and waits when the budget is used up.

## SPEC-AUTH-02: Wrong password is rejected

**Priority:** P0. **Preconditions:** admin user exists; fresh context. Uses a wrong password for the real admin email (1 failure of the 5 allowed per email; a later successful login does not reset the counter, so this runs once per run).

- **Given** the sign-in form is open
- **When** the admin email is submitted with a wrong password
- **Then** the API answers 401 and the UI shows an error without signing in

| Field | Expected |
|---|---|
| API | `POST /auth/login` → `401`, body `{ error: { code: "INVALID_CREDENTIALS", message } }`, no `Set-Cookie` refresh cookie, no `accessToken` |
| UI | role=alert containing "don't match"; URL stays `/login`; "Sign in" button enabled again; password field still masked |
| Cleanup | none (the failure counter expires after 15 min; audit row kept) |

## SPEC-AUTH-03: Expired or invalid access token

**Priority:** P0. A real 15-minute expiry cannot be waited for, so the 401 is produced two ways.

- **Given** a signed-in admin on `/admin/users`, and a request carrying a malformed bearer token
- **When** the API receives a token it cannot verify, and when the first authorized call of the page is answered 401 (access token treated as expired)
- **Then** the API says `UNAUTHENTICATED`, and the client refreshes once and retries

| Field | Expected |
|---|---|
| API | `GET /users` with `Authorization: Bearer abc.def.ghi` → `401 UNAUTHENTICATED`; with no header → `401 UNAUTHENTICATED` |
| UI | First `GET /users` is answered 401 (injected once by the test); the client calls `POST /auth/refresh` (200), repeats `GET /users` (200) and the table shows live rows; user stays on `/admin/users`, no redirect to `/login` |
| Cleanup | none |

## SPEC-AUTH-04: Logout

**Priority:** P0. **Preconditions:** signed-in admin.

- **When** the user opens the account menu and chooses "Sign out"
- **Then** the session ends on the server and in the browser

| Field | Expected |
|---|---|
| API | `POST /auth/logout` → `204` (or 200 with empty body), refresh cookie cleared |
| UI | URL `/login`; reload of `/admin/dashboard` goes to `/login?next=%2Fadmin%2Fdashboard` (refresh fails with 401) |
| Cleanup | session removed server-side |

## SPEC-AUTH-05: Token refresh and rotation

**Priority:** P0. **Preconditions:** a login done over the API to hold the refresh cookie.

- **When** the refresh cookie is sent to `POST /auth/refresh`
- **Then** a new access token and a new rotated refresh cookie are issued; the old cookie is rejected afterwards; a UI reload keeps the session

| Field | Expected |
|---|---|
| API | `POST /auth/refresh` with cookie → `200`, body keys `accessToken`, `expiresIn`; new `Set-Cookie` differs from the old value; refresh without a cookie → `401 UNAUTHENTICATED`; replaying the old cookie → `401 UNAUTHENTICATED` (reuse detection revokes the session) |
| UI | After a page reload on `/admin/dashboard` the admin shell is shown again (via `POST /auth/refresh` 200) |
| Cleanup | the API session is revoked by the reuse check |

## SPEC-AUTH-06: Login rate limit (429)

**Priority:** P0. **Preconditions:** a throwaway email that belongs to no user (`lockout-<run>@x.test`), so no real account is locked.

- **When** 5 wrong-password logins are sent for that email
- **Then** the next attempt is rejected 429 with a retry hint, even with a wrong or right password

| Field | Expected |
|---|---|
| API | attempts 1-5 → `401 INVALID_CREDENTIALS`; next → `429`, body `{ error: { code: "TOO_MANY_ATTEMPTS" } }`, header `Retry-After` an integer between 1 and 900 |
| UI | see SPEC-ERRORS-04 (countdown) |
| Cleanup | the lockout expires on its own in 15 min; it affects only the throwaway email. Takes 6 of the per-IP attempts |
