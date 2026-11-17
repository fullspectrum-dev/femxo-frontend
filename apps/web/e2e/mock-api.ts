import type { Page, Route } from "@playwright/test";

/*
 * A fake femxo-backend for the browser: /auth/* and /access/me, plus a 503
 * for every other API route so module screens settle into their error state.
 */

export interface MockUser {
  name?: string;
  email?: string;
  isSuperAdmin?: boolean;
  roles?: string[];
  permissions?: string[];
}

export interface MockOptions {
  /** Start signed in (refresh succeeds). Default false: refresh answers 401. */
  signedIn?: boolean;
  /** Make /access/me fail with a 500. */
  accessFails?: boolean;
}

const API_PREFIXES = [
  "territories", "sales-territories", "users", "inventory", "catalog", "cms", "approvals", "dealer", "sub-dealers", "customers",
  "orders", "billing", "finance", "wallets", "ledger", "membership", "reports", "notifications", "dashboard", "delivery", "cod",
  "commission", "settlement", "payments", "reviews",
];

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

export async function mockApi(page: Page, who: MockUser = {}, options: MockOptions = {}) {
  let signedIn = options.signedIn ?? false;
  const calls = { access: 0 };
  const user = {
    id: "u1",
    email: who.email ?? "dealer@femxo.test",
    name: who.name ?? "Dee Dealer",
    isSuperAdmin: who.isSuperAdmin ?? false,
    status: "active",
    mustChangePassword: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const token = { accessToken: "e2e-token", expiresIn: 900 };
  const unauthenticated = { error: { code: "UNAUTHENTICATED", message: "Sign in again." } };

  await page.route(
    (url) => /^\/(auth|access)(\/|$)/.test(url.pathname),
    async (route) => {
      const { pathname } = new URL(route.request().url());
      switch (pathname) {
        case "/auth/login":
          signedIn = true;
          return json(route, 200, { ...token, user });
        case "/auth/refresh":
          return signedIn ? json(route, 200, token) : json(route, 401, unauthenticated);
        case "/auth/me":
          return signedIn ? json(route, 200, { user }) : json(route, 401, unauthenticated);
        case "/auth/logout":
          signedIn = false;
          return route.fulfill({ status: 204 });
        case "/access/me":
          calls.access += 1;
          if (options.accessFails) return json(route, 500, { error: { code: "INTERNAL", message: "Down" } });
          return json(route, 200, {
            isSuperAdmin: user.isSuperAdmin,
            permissions: who.permissions ?? [],
            roles: who.roles ?? [],
            territoryIds: [],
            locationIds: [],
          });
        default:
          return json(route, 404, { error: { code: "NOT_FOUND", message: "Not found." } });
      }
    }
  );

  const other = new RegExp(`^/(${API_PREFIXES.join("|")})(/|$)`);
  await page.route(
    (url) => other.test(url.pathname),
    (route) => json(route, 503, { error: { code: "NOT_AVAILABLE", message: "Not in e2e." } })
  );

  return calls;
}
