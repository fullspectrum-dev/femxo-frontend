# SPEC-ERRORS: Error contract and UI handling

Every API error has the shape `{ "error": { "code": "<UPPER_SNAKE>", "message": "<text>" } }` with a JSON content type. Same environment rules as [SPEC-AUTH](SPEC-AUTH.md).

## SPEC-ERRORS-01: 404

- **When** an unknown API route is requested; a well-formed but non-existent id is requested; an unknown frontend route is opened
- **Then**
  - `GET /nope` → `404`, `error.code = "NOT_FOUND"`
  - `GET /catalog/admin/products/000000000000000000000001` (valid ObjectId, no such product, admin token) → `404` with an `error.code` (no stack trace, no internal fields)
  - UI: `/this-page-does-not-exist` shows the 404 page "This page isn’t on the map" with a "Back to Femxo" link
- Cleanup: none.

## SPEC-ERRORS-02: Documented 400 error codes

- **Given** an admin token
- **When** invalid requests are sent
- **Then** each returns `400` and the documented code:

| Request | Code |
|---|---|
| `POST /auth/login` with `{ "email": "bad" }` | `VALIDATION_ERROR` (message lists `email, password`) |
| `GET /users?limit=101` | `VALIDATION_ERROR` |
| `GET /catalog/products?cursor=not-a-cursor` | `INVALID_CURSOR` |
| `POST /inventory/stock-in` with an unknown warehouse id and a valid body | `UNKNOWN_WAREHOUSE` |
| `POST /inventory/stock-in` without `Idempotency-Key` | `VALIDATION_ERROR` or `IDEMPOTENCY_KEY_REQUIRED` (the observed code is recorded) |

- No `passwordHash`, stack, `_id` or `__v` in any body. No stock row is created.
- Cleanup: none (all requests are rejected before any write).

## SPEC-ERRORS-03: 429 with Retry-After

- **Given** the throwaway lockout email from SPEC-AUTH-06 (shared, 10 minutes)
- **When** another login is attempted for it
- **Then** `429`, `error.code = "TOO_MANY_ATTEMPTS"`, header `Retry-After` is an integer in 1..900 and does not grow between two attempts (it counts down).
- Cleanup: expires on its own.

## SPEC-ERRORS-04: Retry-After countdown in the UI

- **Given** the locked email from SPEC-ERRORS-03
- **When** it is submitted on `/login` in the browser
- **Then** a role=alert reads "Try again in mm:ss" (mm:ss at most 15:00); the "Sign in" button is disabled; the countdown goes down on the next tick.
- Cleanup: none.
