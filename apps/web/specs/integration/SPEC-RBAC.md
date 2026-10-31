# SPEC-RBAC: Roles and permissions (admin panel ↔ femxo-backend)

Same environment and rate-limit rules as [SPEC-AUTH](SPEC-AUTH.md). Test users are the seed accounts (`*@seed.femxo.test`, dev DB only), one per role. The permissions come from `roles` (seed ids `5eed…`).

| Seed user | Role | Permissions |
|---|---|---|
| `warehouse.mgr` | Seed Warehouse Manager | `stock.view stock.in stock.out stock.adjust stock.return stock.transfer warehouse.manage` |
| `catalog.mgr` | Seed Catalog Manager | `catalog.manage product.manage` |
| `cms.editor` | Seed Content Editor | `cms.edit cms.publish` |
| `viewer` | Seed Viewer | `user.view role.view territory.view stock.view` |
| `noroles` | none | none |

Current UI behavior (from `AdminGate`): only a Super Admin gets the admin panel; every other account sees "Access denied" at `/admin/*` and a link back to `/account`. So the UI is binary today; per-permission rules are enforced and tested at the API.

## Shared expectations for RBAC-01 to RBAC-05 (one scenario per role)

- **Given** the role's user signs in through the form (1 login each).
- **Then (UI)** the login lands on `/account` (not `/admin/dashboard`). Opening `/admin/dashboard` shows "This preview of the admin panel is for the Super Admin account." and a "Back to your account" link. No admin sidebar.
- **Then (API)** `GET /access/me` → `200` with `isSuperAdmin: false` and exactly the permissions in the table. The GET matrix below holds: allowed → `200`, not allowed → `403` with `error.code = "FORBIDDEN"` (or `ALL_WAREHOUSES_REQUIRED`).

| GET path | Needs | warehouse | catalog | cms | viewer | noroles |
|---|---|---|---|---|---|---|
| `/auth/me`, `/access/me` | login | 200 | 200 | 200 | 200 | 200 |
| `/users?limit=1` | `user.view` | 403 | 403 | 403 | 200 | 403 |
| `/access/roles` | `role.view` | 403 | 403 | 403 | 200 | 403 |
| `/catalog/admin/products?limit=1` | `product.manage` | 403 | 200 | 403 | 403 | 403 |
| `/cms/admin/sections` | `cms.edit` | 403 | 403 | 200 | 403 | 403 |
| `/inventory/warehouses?limit=5` | `stock.view`/`warehouse.manage` | 200 | 403 | 403 | 200 | 403 |
| `/inventory/reconciliation/latest` | super admin | 403 | 403 | 403 | 403 | 403 |

Cleanup for all: nothing created; sign out at the end.

## SPEC-RBAC-01: Warehouse manager
Shared expectations, user `warehouse.mgr`.

## SPEC-RBAC-02: Catalog manager
Shared expectations, user `catalog.mgr`.

## SPEC-RBAC-03: Content editor
Shared expectations, user `cms.editor`.

## SPEC-RBAC-04: Viewer
Shared expectations, user `viewer`.

## SPEC-RBAC-05: User without roles
Shared expectations, user `noroles` (`permissions: []`).

## SPEC-RBAC-06: Unauthenticated access

- **Given** no session
- **When** a protected API route is called, and when `/admin/users` is opened in the browser
- **Then** API: `GET /users`, `/access/me`, `/inventory/warehouses`, `/catalog/admin/products` → `401 UNAUTHENTICATED`. UI: URL becomes `/login?next=%2Fadmin%2Fusers`, no admin content flashes, no data request is sent with a token.
- Cleanup: none.

## SPEC-RBAC-07: Forbidden writes return 403

- **Given** signed-in `viewer` and `noroles`
- **When** they call write routes with valid bodies (so only the permission check can refuse them): `POST /users`, `POST /access/roles`, `POST /catalog/brands`, `PATCH /users/<seed viewer id>`
- **Then** `403`, `error.code = "FORBIDDEN"`, and nothing was created (seed user count and role count unchanged).
- Cleanup: none expected; if a record was created the test fails and cleanup finds it by the run id.

## SPEC-RBAC-08: UI handling of a 403 inside the admin panel

- **Given** a signed-in super admin on `/admin/users`
- **When** the users list call is answered `403 FORBIDDEN` (injected by the test, as a permission removed mid-session would produce)
- **Then** the page shows an error state (role=alert, "Couldn’t load data"), not a blank page or crash; the user stays signed in (no redirect to `/login`) and the sidebar still works (navigating to another module works).
- Cleanup: none.
