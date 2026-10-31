import { expect, request as playwrightRequest } from "@playwright/test";
import {
  ADMIN_EMAIL,
  BASE_URL,
  bearer,
  ensureLockout,
  errorOf,
  mask,
  openLogin,
  password,
  scenario,
  shot,
  signOutFromAdmin,
  submitLogin,
  takeLoginSlot,
  uiLogin,
} from "./helpers";

const refreshCookie = (setCookie: string | undefined) => /(?:^|\n)\s*([^=;\s]+=[^;\n]+)/.exec(setCookie ?? "")?.[1];

scenario("SPEC-AUTH-01", "successful login", async ({ page, request }) => {
  const calls: string[] = [];
  page.on("response", (r) => {
    if (/\/auth\//.test(r.url())) calls.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`);
  });
  await takeLoginSlot();
  await openLogin(page);
  const loginResponse = page.waitForResponse((r) => r.url().endsWith("/auth/login") && r.request().method() === "POST");
  await submitLogin(page, ADMIN_EMAIL, password());
  const response = await loginResponse;

  // API contract
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(Object.keys(body).sort()).toEqual(["accessToken", "expiresIn", "user"]);
  expect(body.accessToken.split(".")).toHaveLength(3);
  expect(body.expiresIn).toBe(900);
  expect(Object.keys(body.user).sort()).toEqual(
    ["createdAt", "email", "id", "isSuperAdmin", "mustChangePassword", "name", "status"].sort()
  );
  expect(body.user).toMatchObject({ email: ADMIN_EMAIL, isSuperAdmin: true, status: "active", mustChangePassword: false });
  expect(JSON.stringify(body)).not.toMatch(/passwordHash|\$argon2|"_id"|"__v"|refreshToken/);
  const cookie = (await response.headersArray()).find((h) => h.name.toLowerCase() === "set-cookie")?.value ?? "";
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/Path=\/auth/i);
  expect(cookie).toMatch(/SameSite=Strict/i);
  console.log(`logged in, token ${mask(body.accessToken)}`);

  const me = await request.get(`${BASE_URL}/access/me`, { headers: bearer(body.accessToken) });
  expect(me.status()).toBe(200);
  expect((await me.json()).isSuperAdmin).toBe(true);

  // UI state
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
  // (Next.js keeps an empty route announcer with role=alert; only error text counts.)
  await expect(page.getByRole("alert").filter({ hasText: /invalid|don't match|failed|too many|denied/i })).toHaveCount(0);
  const storage = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]));
  expect(storage).not.toContain(body.accessToken);
  expect(await page.evaluate(() => document.cookie)).toBe("");
  await shot(page, "SPEC-AUTH-01");

  // The session survives a reload through the refresh cookie.
  await page.reload();
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  expect(calls).toContain("POST /auth/refresh 200");

  await signOutFromAdmin(page);
});

scenario("SPEC-AUTH-02", "wrong password is rejected", async ({ page }) => {
  await takeLoginSlot();
  await openLogin(page);
  const loginResponse = page.waitForResponse((r) => r.url().endsWith("/auth/login"));
  await submitLogin(page, ADMIN_EMAIL, "definitely-wrong-password-1");
  const response = await loginResponse;

  expect(response.status()).toBe(401);
  expect((await errorOf(response)).code).toBe("INVALID_CREDENTIALS");
  const body = await response.text();
  expect(body).not.toContain("accessToken");
  expect((await response.headersArray()).some((h) => h.name.toLowerCase() === "set-cookie")).toBe(false);

  await expect(page.getByRole("alert").filter({ hasText: "don't match" })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await shot(page, "SPEC-AUTH-02");
});

scenario("SPEC-AUTH-03", "expired or invalid access token", async ({ page, request }) => {
  // API: a token the server cannot verify, and no token at all.
  const bad = await request.get(`${BASE_URL}/users`, { headers: bearer("abc.def.ghi") });
  expect(bad.status()).toBe(401);
  expect((await errorOf(bad)).code).toBe("UNAUTHENTICATED");
  const none = await request.get(`${BASE_URL}/users`);
  expect(none.status()).toBe(401);
  expect((await errorOf(none)).code).toBe("UNAUTHENTICATED");

  // UI: sign in, then answer the first authorized users call with 401 (as an expired token would).
  await uiLogin(page, ADMIN_EMAIL);
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  let injected = false;
  const log: string[] = [];
  page.on("response", (r) => {
    const p = new URL(r.url()).pathname;
    if (p === "/auth/refresh" || p === "/users") log.push(`${p} ${r.status()}`);
  });
  await page.route(
    (url) => url.pathname === "/users" && url.origin === new URL(page.url()).origin,
    async (route) => {
      if (!injected && route.request().headers()["authorization"]) {
        injected = true;
        return route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }),
        });
      }
      return route.continue();
    }
  );
  await page.goto("/admin/users");
  await expect(page.getByRole("row").nth(1)).toBeVisible();
  expect(injected).toBe(true);
  expect(log).toContain("/auth/refresh 200");
  expect(log.filter((l) => l.startsWith("/users")).at(-1)).toBe("/users 200");
  await expect(page).toHaveURL(/\/admin\/users$/);
  await shot(page, "SPEC-AUTH-03");
  await signOutFromAdmin(page);
});

scenario("SPEC-AUTH-04", "logout ends the session", async ({ page }) => {
  await uiLogin(page, ADMIN_EMAIL);
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  const logout = page.waitForResponse((r) => r.url().endsWith("/auth/logout"));
  await signOutFromAdmin(page);
  expect([200, 204]).toContain((await logout).status());
  await shot(page, "SPEC-AUTH-04");

  const refresh = page.waitForResponse((r) => r.url().endsWith("/auth/refresh"));
  await page.goto("/admin/dashboard");
  expect((await refresh).status()).toBe(401);
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fdashboard$/);
});

scenario("SPEC-AUTH-05", "token refresh rotates the refresh cookie", async ({ page }) => {
  // Every API call uses its own context: a shared cookie jar would send the login cookie by itself.
  const fresh = () => playwrightRequest.newContext();
  const request = await fresh();
  // API: log in, keep the Set-Cookie (the Secure cookie is not kept by a plain-http cookie jar).
  await takeLoginSlot();
  const login = await request.post(`${BASE_URL}/auth/login`, { data: { email: ADMIN_EMAIL, password: password() } });
  expect(login.status()).toBe(200);
  const first = refreshCookie(login.headers()["set-cookie"]);
  expect(first, "refresh cookie issued").toBeTruthy();

  const refreshed = await (await fresh()).post(`${BASE_URL}/auth/refresh`, { headers: { Cookie: first! } });
  expect(refreshed.status()).toBe(200);
  const body = await refreshed.json();
  expect(Object.keys(body).sort()).toEqual(["accessToken", "expiresIn"]);
  const second = refreshCookie(refreshed.headers()["set-cookie"]);
  expect(second, "rotated cookie").toBeTruthy();
  expect(second).not.toBe(first);
  console.log(`refreshed, token ${mask(body.accessToken)}`);

  const none = await (await fresh()).post(`${BASE_URL}/auth/refresh`);
  expect(none.status()).toBe(401);
  expect((await errorOf(none)).code).toBe("UNAUTHENTICATED");

  const replay = await (await fresh()).post(`${BASE_URL}/auth/refresh`, { headers: { Cookie: first! } });
  expect(replay.status()).toBe(401);
  expect((await errorOf(replay)).code).toBe("UNAUTHENTICATED");

  // UI: the session survives a reload.
  await uiLogin(page, ADMIN_EMAIL);
  const refresh = page.waitForResponse((r) => r.url().endsWith("/auth/refresh"));
  await page.reload();
  expect((await refresh).status()).toBe(200);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  await shot(page, "SPEC-AUTH-05");
  await signOutFromAdmin(page);
});

scenario("SPEC-AUTH-06", "login rate limit returns 429", async ({ request }) => {
  const { email, response } = await ensureLockout(request);
  expect(response.status()).toBe(429);
  expect((await errorOf(response)).code).toBe("TOO_MANY_ATTEMPTS");
  const retryAfter = Number(response.headers()["retry-after"]);
  expect(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 900, `Retry-After ${retryAfter}`).toBe(true);

  // Even the right password is refused while the lockout lasts (this email has no account, so only the limiter can answer).
  await takeLoginSlot();
  const again = await request.post(`${BASE_URL}/auth/login`, { data: { email, password: password() } });
  expect(again.status()).toBe(429);
});
