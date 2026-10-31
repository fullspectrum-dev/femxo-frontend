import { expect } from "@playwright/test";
import {
  BASE_URL,
  RUN_ID,
  adminToken,
  bearer,
  ensureLockout,
  errorOf,
  openLogin,
  password,
  scenario,
  shot,
  submitLogin,
  takeLoginSlot,
} from "./helpers";

const NO_INTERNALS = /passwordHash|\$argon2|"_id"|"__v"|stack|node_modules/;

scenario("SPEC-ERRORS-01", "404 for unknown routes, ids and pages", async ({ page, request }) => {
  const route = await request.get(`${BASE_URL}/nope`);
  expect(route.status()).toBe(404);
  expect(route.headers()["content-type"]).toContain("application/json");
  expect((await errorOf(route)).code).toBe("NOT_FOUND");

  const token = await adminToken(request);
  const missing = await request.get(`${BASE_URL}/catalog/admin/products/000000000000000000000001`, { headers: bearer(token) });
  expect(missing.status()).toBe(404);
  const body = await missing.text();
  expect(JSON.parse(body).error.code).toBeTruthy();
  expect(body).not.toMatch(NO_INTERNALS);

  await page.goto("/this-page-does-not-exist");
  await expect(page.getByRole("heading", { name: "This page isn’t on the map" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Back to Femxo/ })).toBeVisible();
  await shot(page, "SPEC-ERRORS-01");
});

scenario("SPEC-ERRORS-02", "documented 400 error codes", async ({ request }) => {
  const token = await adminToken(request);
  const headers = bearer(token);
  const seen: string[] = [];
  const expectError = async (name: string, response: Awaited<ReturnType<typeof request.get>>, status: number, codes: string[]) => {
    const text = await response.text();
    const code = (JSON.parse(text).error ?? {}).code;
    seen.push(`${name}: ${response.status()} ${code}`);
    expect(response.status(), name).toBe(status);
    expect(codes, `${name} (got ${code})`).toContain(code);
    expect(text, name).not.toMatch(NO_INTERNALS);
  };

  await expectError("login bad body", await request.post(`${BASE_URL}/auth/login`, { data: { email: "bad" } }), 400, ["VALIDATION_ERROR"]);
  await expectError("limit too high", await request.get(`${BASE_URL}/users?limit=101`, { headers }), 400, ["VALIDATION_ERROR"]);
  await expectError("bad cursor", await request.get(`${BASE_URL}/catalog/products?cursor=not-a-cursor`, { headers }), 400, ["INVALID_CURSOR"]);

  const stockIn = {
    warehouseId: "000000000000000000000001",
    variantId: "000000000000000000000002",
    quantity: 1,
    batchNo: `E2E-${RUN_ID}`,
    expiryDate: "2027-12-31",
  };
  await expectError(
    "unknown warehouse",
    await request.post(`${BASE_URL}/inventory/stock-in`, { data: stockIn, headers: { ...headers, "Idempotency-Key": `e2e-err-${RUN_ID}` } }),
    400,
    ["UNKNOWN_WAREHOUSE"]
  );
  await expectError(
    "missing Idempotency-Key",
    await request.post(`${BASE_URL}/inventory/stock-in`, { data: stockIn, headers }),
    400,
    ["VALIDATION_ERROR", "IDEMPOTENCY_KEY_REQUIRED"]
  );
  console.log(seen.join("\n"));
});

scenario("SPEC-ERRORS-03", "429 carries Retry-After", async ({ request }) => {
  const { email } = await ensureLockout(request);
  const retry = async () => {
    await takeLoginSlot();
    const response = await request.post(`${BASE_URL}/auth/login`, { data: { email, password: password() } });
    expect(response.status()).toBe(429);
    expect((await errorOf(response)).code).toBe("TOO_MANY_ATTEMPTS");
    expect(response.headers()["content-type"]).toContain("application/json");
    return Number(response.headers()["retry-after"]);
  };
  const first = await retry();
  expect(Number.isInteger(first) && first >= 1 && first <= 900, `Retry-After ${first}`).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 2100));
  const second = await retry();
  expect(second).toBeLessThanOrEqual(first);
});

scenario("SPEC-ERRORS-04", "Retry-After countdown in the UI", async ({ page, request }) => {
  const { email } = await ensureLockout(request);
  await takeLoginSlot();
  await openLogin(page);
  await submitLogin(page, email, password());

  const alert = page.getByRole("alert").filter({ hasText: /Try again in \d+:\d\d/ });
  await expect(alert).toBeVisible();
  const read = async () => {
    const [, m, s] = /(\d+):(\d\d)/.exec((await alert.innerText()) ?? "") ?? [];
    return Number(m) * 60 + Number(s);
  };
  const first = await read();
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThanOrEqual(900);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeDisabled();
  await page.waitForTimeout(2200);
  expect(await read()).toBeLessThan(first);
  await shot(page, "SPEC-ERRORS-04");
});
