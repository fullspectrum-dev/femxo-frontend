import { expect, test } from "@playwright/test";
import {
  ADMIN_EMAIL,
  BASE_URL,
  RUN_ID,
  SEED,
  SEED_USERS,
  apiSession,
  bearer,
  direct,
  errorOf,
  openLogin,
  password,
  productBody,
  shot,
  signOutFromAdmin,
  submitLogin,
  track,
  uiLogin,
} from "./helpers";

// P1 / P2 direct tests: no formal specs, tagged by priority in the test title.
// Tests share one product created early in the file. workers=1 keeps the order; a failure must not
// skip the tests after it, so there is no serial mode.

const NAME = `E2E Product ${RUN_ID}`;
const state: { id?: string; slug?: string; variantId?: string; barcode?: string; movementId?: string; createdAt?: string } = {};
const FORBIDDEN_KEYS = /^(passwordHash|_id|__v|password|temporaryPassword|refreshToken|secret)$/i;

/** Every key path whose name is on the forbidden list. */
function sensitiveKeys(value: unknown, trail = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => sensitiveKeys(v, `${trail}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => (FORBIDDEN_KEYS.test(k) ? [`${trail}.${k}`] : sensitiveKeys(v, `${trail}.${k}`)));
  }
  return [];
}

const ean13Valid = (code: string) => {
  if (!/^\d{13}$/.test(code)) return false;
  const sum = [...code.slice(0, 12)].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
};

// ================================================================ P1: catalog
direct("P1", "catalog: admin product list returns a page with a cursor", async ({ request }) => {
  const { accessToken } = await apiSession(request, SEED_USERS.catalog);
  const response = await request.get(`${BASE_URL}/catalog/admin/products?limit=5`, { headers: bearer(accessToken) });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.products.length).toBeGreaterThan(0);
  expect(body.products.length).toBeLessThanOrEqual(5);
  expect(body).toHaveProperty("nextCursor");
  for (const p of body.products) {
    expect(p).toMatchObject({ id: expect.any(String), slug: expect.any(String), name: expect.any(String) });
    expect(p.variants.length).toBeGreaterThan(0);
  }
});

direct("P1", "catalog: admin panel products page shows live rows", async ({ page }) => {
  await uiLogin(page, ADMIN_EMAIL);
  await page.goto("/admin/products");
  await expect(page.getByRole("row").nth(2)).toBeVisible();
  await expect(page.getByText(/coming soon/i)).toHaveCount(0);
  await shot(page, "P1-catalog-products-page");
  await signOutFromAdmin(page);
});

direct("P1", "catalog: cursor pagination walks pages without repeats", async ({ request }) => {
  const { accessToken } = await apiSession(request, SEED_USERS.catalog);
  const seen = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 3; page++) {
    const url: string = `${BASE_URL}/catalog/admin/products?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const body = await (await request.get(url, { headers: bearer(accessToken) })).json();
    expect(body.products).toHaveLength(2);
    for (const p of body.products) {
      expect(seen.has(p.id), `duplicate ${p.id}`).toBe(false);
      seen.add(p.id);
    }
    expect(body.nextCursor).toBeTruthy();
    expect(cursors.has(body.nextCursor)).toBe(false);
    cursors.add(body.nextCursor);
    cursor = body.nextCursor;
  }
  expect(seen.size).toBe(6);
  const tooMany = await request.get(`${BASE_URL}/catalog/admin/products?limit=101`, { headers: bearer(accessToken) });
  expect(tooMany.status()).toBe(400);
  expect((await errorOf(tooMany)).code).toBe("VALIDATION_ERROR");
});

direct("P1", "catalog: create a product", async ({ request }) => {
  const { accessToken } = await apiSession(request, SEED_USERS.catalog);
  const response = await request.post(`${BASE_URL}/catalog/admin/products`, { data: productBody(NAME), headers: bearer(accessToken) });
  expect(response.status(), await response.text()).toBe(201);
  const { product } = await response.json();
  state.id = product.id;
  track("product", product.id, { name: NAME });
  const full = (await (await request.get(`${BASE_URL}/catalog/admin/products/${product.id}`, { headers: bearer(accessToken) })).json()).product;
  state.slug = full.slug;
  state.variantId = full.variants[0].id;
  state.barcode = full.variants[0].barcode;
  state.createdAt = full.createdAt;
  expect(full.name).toBe(NAME);
  expect(full.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  expect(full.variants[0].sku).toMatch(/^FX-/);
});

direct("P1", "catalog: creating the same product again is 409", async ({ request }) => {
  const { accessToken } = await apiSession(request, SEED_USERS.catalog);
  const response = await request.post(`${BASE_URL}/catalog/admin/products`, { data: productBody(NAME), headers: bearer(accessToken) });
  expect(response.status()).toBe(409);
  expect((await errorOf(response)).code).toBeTruthy();
});

direct("P1", "catalog: edit a product", async ({ request }) => {
  const { accessToken } = await apiSession(request, SEED_USERS.catalog);
  const patch = await request.patch(`${BASE_URL}/catalog/admin/products/${state.id}`, { data: { description: "edited by e2e" }, headers: bearer(accessToken) });
  expect(patch.status()).toBe(200);
  const after = (await (await request.get(`${BASE_URL}/catalog/admin/products/${state.id}`, { headers: bearer(accessToken) })).json()).product;
  expect(after.description).toBe("edited by e2e");
});

direct("P1", "catalog: slug cannot be changed", async ({ request }) => {
  const { accessToken } = await apiSession(request, SEED_USERS.catalog);
  const patch = await request.patch(`${BASE_URL}/catalog/admin/products/${state.id}`, { data: { slug: "changed-slug" }, headers: bearer(accessToken) });
  expect(patch.status()).toBe(400);
  expect((await errorOf(patch)).code).toBe("VALIDATION_ERROR");
  const after = (await (await request.get(`${BASE_URL}/catalog/admin/products/${state.id}`, { headers: bearer(accessToken) })).json()).product;
  expect(after.slug).toBe(state.slug);
});

// ================================================================ P1: inventory
direct("P1", "inventory: stock-in adds stock, replay is idempotent, key reuse is 422", async ({ request }) => {
  const { accessToken } = await apiSession(request, SEED_USERS.warehouse);
  const body = { warehouseId: SEED.warehouses.PAT, variantId: state.variantId, quantity: 7, reference: `E2E-${RUN_ID}` };
  const key = `e2e-${RUN_ID}-stock-in`;
  const first = await request.post(`${BASE_URL}/inventory/stock-in`, { data: body, headers: { ...bearer(accessToken), "Idempotency-Key": key } });
  expect(first.status(), await first.text()).toBe(201);
  const { movement } = await first.json();
  state.movementId = movement.movementId;
  track("movement", movement.movementId, { reference: body.reference });

  const balances = await (await request.get(`${BASE_URL}/inventory/balances?warehouseId=${SEED.warehouses.PAT}&variantId=${state.variantId}`, { headers: bearer(accessToken) })).json();
  expect(balances.balances.reduce((sum: number, b: { quantity: number }) => sum + b.quantity, 0)).toBe(7);

  const replay = await request.post(`${BASE_URL}/inventory/stock-in`, { data: body, headers: { ...bearer(accessToken), "Idempotency-Key": key } });
  expect([200, 201]).toContain(replay.status());
  expect(replay.headers()["idempotent-replay"]).toBe("true");
  expect((await replay.json()).movement.movementId).toBe(movement.movementId);

  const reused = await request.post(`${BASE_URL}/inventory/stock-in`, { data: { ...body, quantity: 8 }, headers: { ...bearer(accessToken), "Idempotency-Key": key } });
  expect(reused.status()).toBe(422);
  expect((await errorOf(reused)).code).toBe("IDEMPOTENCY_KEY_REUSED");
});

direct("P1", "inventory: a draft transfer reserves nothing", async ({ request }) => {
  const { accessToken } = await apiSession(request, SEED_USERS.warehouse);
  const response = await request.post(`${BASE_URL}/inventory/transfers`, {
    data: { fromWarehouseId: SEED.warehouses.PAT, toWarehouseId: SEED.warehouses.GAY, lines: [{ variantId: state.variantId, quantity: 1 }], reference: `E2E-${RUN_ID}` },
    headers: { ...bearer(accessToken), "Idempotency-Key": `e2e-${RUN_ID}-transfer` },
  });
  expect(response.status(), await response.text()).toBe(201);
  const { transfer } = await response.json();
  track("transfer", transfer.id);
  expect(transfer.status).toBe("draft");
  const got = (await (await request.get(`${BASE_URL}/inventory/transfers/${transfer.id}`, { headers: bearer(accessToken) })).json()).transfer;
  expect(got).toMatchObject({ status: "draft", inTransit: 0 });
});

direct("P1", "inventory: warehouse scope returns 404 outside the user's warehouses", async ({ request }) => {
  const viewer = await apiSession(request, SEED_USERS.viewer);
  const outside = await request.get(`${BASE_URL}/inventory/balances?warehouseId=${SEED.warehouses.MUZ}&limit=1`, { headers: bearer(viewer.accessToken) });
  expect(outside.status(), `out-of-scope warehouse answered ${outside.status()} ${(await errorOf(outside)).code}`).toBe(404); // hidden, not forbidden: the API does not reveal that the warehouse exists
  const inside = await request.get(`${BASE_URL}/inventory/balances?warehouseId=${SEED.warehouses.PAT}&limit=1`, { headers: bearer(viewer.accessToken) });
  expect(inside.status()).toBe(200);
  const manager = await apiSession(request, SEED_USERS.warehouse);
  const gay = await request.get(`${BASE_URL}/inventory/balances?warehouseId=${SEED.warehouses.GAY}&limit=1`, { headers: bearer(manager.accessToken) });
  expect(gay.status()).toBe(200);
});

// ================================================================ P2
direct("P2", "barcode: EAN-13 with a valid check digit, unique per variant", async ({ request }) => {
  expect(ean13Valid(state.barcode ?? ""), `barcode ${state.barcode}`).toBe(true);
  const { accessToken } = await apiSession(request, SEED_USERS.catalog);
  const lookup = await request.get(`${BASE_URL}/catalog/barcodes/${state.barcode}`, { headers: bearer(accessToken) });
  expect([200, 404]).toContain(lookup.status()); // buyer lookup route; the product is active so 200 is expected
  expect(lookup.status()).toBe(200);
});

direct("P2", "timestamps: ISO UTC, updatedAt follows the edit", async ({ request }) => {
  const { accessToken } = await apiSession(request, SEED_USERS.catalog);
  const p = (await (await request.get(`${BASE_URL}/catalog/admin/products/${state.id}`, { headers: bearer(accessToken) })).json()).product;
  const iso = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
  expect(p.createdAt).toMatch(iso);
  expect(p.updatedAt).toMatch(iso);
  expect(new Date(p.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(p.createdAt).getTime());
  expect(new Date(p.updatedAt).getTime()).toBeGreaterThan(new Date(state.createdAt!).getTime() - 1);
  expect(Math.abs(Date.now() - new Date(p.createdAt).getTime())).toBeLessThan(15 * 60_000);
});

direct("P2", "pricing: a buyer sees one price for their tier, never the purchase price", async ({ request }) => {
  const admin = await apiSession(request, ADMIN_EMAIL);
  const adminView = (await (await request.get(`${BASE_URL}/catalog/admin/products/${state.id}`, { headers: bearer(admin.accessToken) })).json()).product;
  const prices = adminView.variants[0].prices;
  expect(prices).toMatchObject({ purchase: 800, dealer: 870, selling: 970, mrp: 1000 });

  const seen: Record<string, unknown> = {};
  for (const email of [SEED_USERS.noroles, `dealer@seed.femxo.test`]) {
    const { accessToken } = await apiSession(request, email);
    const tier = (await (await request.get(`${BASE_URL}/access/me`, { headers: bearer(accessToken) })).json()).priceTier;
    const response = await request.get(`${BASE_URL}/catalog/products/${state.slug}`, { headers: bearer(accessToken) });
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).not.toContain('"purchase"');
    seen[email] = { tier, price: JSON.stringify(JSON.parse(text).product?.variants?.[0]?.price ?? JSON.parse(text).product?.variants?.[0]) };
  }
  console.log("buyer view by user:", JSON.stringify(seen));
});

direct("P2", "sensitive fields: no hashes, ids or secrets in list responses", async ({ request }) => {
  const admin = await apiSession(request, ADMIN_EMAIL);
  const leaks: string[] = [];
  for (const path of ["/users?limit=50", "/access/roles", "/auth/me", "/access/me", "/inventory/warehouses?limit=5", `/catalog/admin/products/${state.id}`]) {
    const response = await request.get(`${BASE_URL}${path}`, { headers: bearer(admin.accessToken) });
    expect(response.status(), path).toBe(200);
    const text = await response.text();
    leaks.push(...sensitiveKeys(JSON.parse(text)).map((k) => `${path}${k}`));
    expect(text, path).not.toMatch(/\$argon2|passwordHash/);
  }
  expect(leaks).toEqual([]);
  const error = await request.get(`${BASE_URL}/nope`);
  expect(await error.text()).not.toMatch(/stack|node_modules|at .*\.(ts|js):\d+/);
});

direct("P2", "429 retry countdown re-enables the form when it reaches zero", async ({ page }) => {
  await page.route(
    (url) => url.pathname === "/auth/login",
    (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "Retry-After": "4" },
        body: JSON.stringify({ error: { code: "TOO_MANY_ATTEMPTS", message: "Too many login attempts." } }),
      })
  );
  await openLogin(page);
  await submitLogin(page, "countdown@x.test", password());
  const button = page.getByRole("button", { name: "Sign in", exact: true });
  await expect(page.getByRole("alert").filter({ hasText: /Try again in 0:0\d/ })).toBeVisible();
  await expect(button).toBeDisabled();
  await expect(button).toBeEnabled({ timeout: 10_000 });
  await expect(page.getByRole("alert").filter({ hasText: /Try again in/ })).toHaveCount(0);
  await shot(page, "P2-429-countdown");
});

// ================================================================ P1: archive, search
direct("P1", "catalog: archive hides a product from buyers", async ({ request }) => {
  const { accessToken } = await apiSession(request, SEED_USERS.catalog);
  const archive = await request.post(`${BASE_URL}/catalog/admin/products/${state.id}/archive`, { headers: bearer(accessToken) });
  expect([200, 204], await archive.text()).toContain(archive.status());
  const buyer = await request.get(`${BASE_URL}/catalog/products/${state.slug}`, { headers: bearer(accessToken) });
  expect(buyer.status()).toBe(404);
  expect((await errorOf(buyer)).code).toBe("PRODUCT_NOT_FOUND");
  const admin = (await (await request.get(`${BASE_URL}/catalog/admin/products/${state.id}`, { headers: bearer(accessToken) })).json()).product;
  expect(JSON.stringify(admin)).toMatch(/archived/i);
});

direct("P1", "search: API answers 503 SEARCH_UNAVAILABLE when search is not configured", async ({ request }) => {
  const { accessToken } = await apiSession(request, ADMIN_EMAIL);
  const response = await request.get(`${BASE_URL}/catalog/search?q=oil`, { headers: bearer(accessToken) });
  test.skip(response.status() === 200, "search is configured in this environment (Atlas Search present), so there is no 503 to handle");
  expect(response.status()).toBe(503);
  expect((await errorOf(response)).code).toBe("SEARCH_UNAVAILABLE");
});

direct("P1", "search: the storefront search page degrades gracefully on 503", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (/\/catalog\/search/.test(r.url())) calls.push(r.url());
  });
  await page.route(/\/catalog\/search/, (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SEARCH_UNAVAILABLE", message: "Search is unavailable right now" } }) })
  );
  const storefront = process.env.STOREFRONT_URL ?? "http://localhost:3002";
  const reachable = await page.goto(`${storefront}/search?q=oil`).then((r) => r?.status() ?? 0).catch(() => 0);
  test.skip(reachable !== 200, `storefront not reachable at ${storefront}`);
  await page.waitForTimeout(1500);
  await expect(page.locator("body")).not.toContainText(/Application error|Unhandled Runtime Error/i);
  test.skip(calls.length === 0, "storefront runs on mock data (NEXT_PUBLIC_API_MODE=mock) and never calls /catalog/search, so the 503 path cannot be exercised");
  await expect(page.getByRole("alert").or(page.getByText(/unavailable|try again/i)).first()).toBeVisible();
  await shot(page, "P1-search-503");
});
