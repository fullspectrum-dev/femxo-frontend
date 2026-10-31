import { expect, type APIRequestContext } from "@playwright/test";
import {
  ADMIN_EMAIL,
  BASE_URL,
  RUN_ID,
  SEED_USERS,
  adminToken,
  apiSession,
  bearer,
  errorOf,
  scenario,
  shot,
  signOutFromAdmin,
  uiLogin,
} from "./helpers";

type RoleKey = keyof typeof SEED_USERS;

const PERMISSIONS: Record<RoleKey, string[]> = {
  warehouse: ["stock.adjust", "stock.in", "stock.out", "stock.return", "stock.transfer", "stock.view", "warehouse.manage"],
  catalog: ["catalog.manage", "product.manage"],
  cms: ["cms.edit", "cms.publish"],
  viewer: ["role.view", "stock.view", "territory.view", "user.view"],
  noroles: [],
};

/** GET path → roles allowed (everyone else must get 403 FORBIDDEN). */
const GET_MATRIX: [string, RoleKey[]][] = [
  ["/users?limit=1", ["viewer"]],
  ["/access/roles", ["viewer"]],
  ["/catalog/admin/products?limit=1", ["catalog"]],
  ["/cms/admin/sections", ["cms"]],
  ["/inventory/warehouses?limit=5", ["warehouse", "viewer"]],
  ["/inventory/reconciliation/latest", []],
];

async function roleScenario(id: string, role: RoleKey, page: import("@playwright/test").Page, request: APIRequestContext) {
  const email = SEED_USERS[role];
  const session = await uiLogin(page, email);

  // UI: a non-super-admin lands on /account and is refused at the admin panel.
  await expect(page).toHaveURL(/\/account/);
  await page.goto("/admin/dashboard");
  await expect(page.getByText("This preview of the admin panel is for the Super Admin account.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to your account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Account menu" })).toHaveCount(0);
  await shot(page, id);

  // API: permissions and the GET matrix.
  const me = await request.get(`${BASE_URL}/access/me`, { headers: bearer(session.accessToken) });
  expect(me.status()).toBe(200);
  const access = await me.json();
  expect(access.isSuperAdmin).toBe(false);
  expect([...access.permissions].sort()).toEqual(PERMISSIONS[role]);

  const wrong: string[] = [];
  for (const [path, allowed] of GET_MATRIX) {
    const response = await request.get(`${BASE_URL}${path}`, { headers: bearer(session.accessToken) });
    const want = allowed.includes(role) ? 200 : 403;
    const code = want === 403 ? (await errorOf(response)).code : "";
    if (response.status() !== want || (want === 403 && !["FORBIDDEN", "ALL_WAREHOUSES_REQUIRED"].includes(code ?? ""))) {
      wrong.push(`${path}: ${response.status()} ${code ?? ""} (wanted ${want})`);
    }
  }
  expect(wrong, "permission matrix mismatches").toEqual([]);
}

scenario("SPEC-RBAC-01", "warehouse manager", ({ page, request }) => roleScenario("SPEC-RBAC-01", "warehouse", page, request));
scenario("SPEC-RBAC-02", "catalog manager", ({ page, request }) => roleScenario("SPEC-RBAC-02", "catalog", page, request));
scenario("SPEC-RBAC-03", "content editor", ({ page, request }) => roleScenario("SPEC-RBAC-03", "cms", page, request));
scenario("SPEC-RBAC-04", "viewer", ({ page, request }) => roleScenario("SPEC-RBAC-04", "viewer", page, request));
scenario("SPEC-RBAC-05", "user without roles", ({ page, request }) => roleScenario("SPEC-RBAC-05", "noroles", page, request));

scenario("SPEC-RBAC-06", "unauthenticated access", async ({ page, request }) => {
  for (const path of ["/users", "/access/me", "/inventory/warehouses", "/catalog/admin/products"]) {
    const response = await request.get(`${BASE_URL}${path}`);
    expect(response.status(), path).toBe(401);
    expect((await errorOf(response)).code, path).toBe("UNAUTHENTICATED");
  }
  const authorized: string[] = [];
  page.on("request", (r) => {
    if (r.headers()["authorization"]) authorized.push(r.url());
  });
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fusers$/);
  await expect(page.getByRole("heading", { name: "Sign in to Femxo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Account menu" })).toHaveCount(0);
  expect(authorized).toEqual([]);
  await shot(page, "SPEC-RBAC-06");
});

scenario("SPEC-RBAC-07", "forbidden writes return 403", async ({ request }) => {
  const admin = await adminToken(request);
  const rolesBefore = (await (await request.get(`${BASE_URL}/access/roles`, { headers: bearer(admin) })).json()) as { roles?: unknown[]; items?: unknown[] };
  const countRoles = (b: typeof rolesBefore) => (b.roles ?? b.items ?? []).length;
  const before = countRoles(rolesBefore);

  const writes: [string, string, unknown][] = [
    ["POST", "/users", { email: `rbac-${RUN_ID}@x.test`, name: "RBAC Probe", temporaryPassword: "Temp-pass-change-me-1" }],
    ["POST", "/access/roles", { name: `RBAC ${RUN_ID}`, permissions: [] }],
    ["POST", "/catalog/brands", { name: `RBAC Brand ${RUN_ID}` }],
    ["PATCH", "/users/5eed00010000000000000004", { name: "Changed" }],
  ];
  const wrong: string[] = [];
  for (const role of ["viewer", "noroles"] as const) {
    const { accessToken } = await apiSession(request, SEED_USERS[role]);
    for (const [method, path, data] of writes) {
      const response = await request.fetch(`${BASE_URL}${path}`, {
        method,
        data,
        headers: { ...bearer(accessToken), "Idempotency-Key": `rbac-${RUN_ID}-${role}` },
      });
      const code = (await errorOf(response)).code;
      if (response.status() !== 403 || code !== "FORBIDDEN") wrong.push(`${role} ${method} ${path}: ${response.status()} ${code}`);
    }
  }
  expect(wrong).toEqual([]);

  const after = countRoles(await (await request.get(`${BASE_URL}/access/roles`, { headers: bearer(admin) })).json());
  expect(after).toBe(before);
  const users = await (await request.get(`${BASE_URL}/users?limit=100`, { headers: bearer(admin) })).json();
  expect(JSON.stringify(users)).not.toContain(`rbac-${RUN_ID}@x.test`);
});

scenario("SPEC-RBAC-08", "UI handles a 403 inside the panel", async ({ page }) => {
  await uiLogin(page, ADMIN_EMAIL);
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await page.route(
    (url) => url.pathname === "/users" && url.origin === new URL(page.url()).origin,
    (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "FORBIDDEN", message: "You do not have permission" } }),
      })
  );
  await page.goto("/admin/users");
  await expect(page.getByRole("alert").filter({ hasText: /Couldn.t load data|permission|denied/i })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  await shot(page, "SPEC-RBAC-08");

  // The sidebar still works.
  await page.getByRole("link", { name: /Roles/ }).first().click();
  await expect(page).toHaveURL(/\/admin\/roles/);
  await signOutFromAdmin(page);
});
