import { deflateSync } from "node:zlib";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { ADMIN_EMAIL, BASE_URL, RUN_ID, apiSession, bearer, password, shot, signOutFromAdmin, uiLogin } from "./helpers";

/*
 * Admin panel journeys through the real UI, proxy and API (live data mode).
 * Every record carries RUN_ID. Run only against a disposable database.
 * Serial: later tests use records the earlier ones created.
 */
test.describe.configure({ mode: "serial" });

const SEED = { PAT: "5eed00070000000000000001", GAY: "5eed00070000000000000002" };
const userEmail = `ui-${RUN_ID}@femxo.test`;
const roleName = `UI Role ${RUN_ID}`;
const productName = `UI Product ${RUN_ID}`;
const ids: { user?: string; role?: string; product?: string; variant?: string; transfer?: string; pics?: string } = {};
let token = "";
const pageErrors: string[] = [];
const serverErrors: string[] = [];
let page: Page; // one logged-in browser session shared by the serial journey

async function api(request: APIRequestContext, method: "get" | "post" | "put" | "patch" | "delete", path: string, data?: unknown, headers: Record<string, string> = {}) {
  return request[method](`${BASE_URL}${path}`, { data, headers: { ...bearer(token), ...headers } });
}

/** Clicks an action in the open drawer, then confirms it if a confirmation dialog appears. */
async function runAction(page: Page, label: string, confirmLabel = label) {
  await page.getByRole("button", { name: label, exact: true }).click();
  // Destructive actions open a confirmation that needs an explicit tick; others run at once.
  const understand = page.getByRole("checkbox", { name: /understand/i });
  const confirming = await understand.waitFor({ state: "visible", timeout: 1500 }).then(() => true, () => false);
  if (confirming) {
    await understand.check();
    await page.getByRole("button", { name: confirmLabel, exact: true }).last().click();
  }
}

async function openRow(page: Page, text: string) {
  await page.getByRole("row").filter({ hasText: text }).first().getByRole("button", { name: /view/i }).click();
}

test.beforeAll(async ({ browser, request }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url()}`); });
  await uiLogin(page, ADMIN_EMAIL);
  token = (await apiSession(request, ADMIN_EMAIL)).accessToken;
  const user = await api(request, "post", "/users", { email: userEmail, name: `UI User ${RUN_ID}`, temporaryPassword: "Temp-Pass-12345!x" });
  expect(user.status(), await user.text()).toBe(201);
  ids.user = (await user.json()).user.id;
  const role = await api(request, "post", "/access/roles", { name: roleName, description: "ui test", permissions: ["stock.view"] });
  expect(role.status(), await role.text()).toBe(201);
  ids.role = (await role.json()).role.id;
});

test("login lands in the panel and a reload keeps the session", async () => {
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: /user management/i }).first()).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/users/);
  await expect(page.getByRole("row").nth(1)).toBeVisible();
  await expect(page.getByText(/coming soon/i)).toHaveCount(0);
  await shot(page, "UI-users-reload");
});

test("users: search matches email prefixes, shows no-match state, sorting is not offered", async () => {
  await page.goto("/admin/users");
  const search = page.getByPlaceholder(/email/i);
  await expect(search).toBeVisible();
  await search.fill(`ui-${RUN_ID}`);
  await expect(page.getByRole("row").filter({ hasText: userEmail })).toHaveCount(1);
  await search.fill("zzz-nobody");
  await expect(page.getByText(/no matches/i)).toBeVisible();
  await search.fill("");
  // The API has no sort, so no column header may offer one.
  await expect(page.getByRole("columnheader").getByRole("button")).toHaveCount(0);
});

test("users: next and previous page walk the cursor", async ({ request }) => {
  for (let i = 0; i < 12; i++) {
    await api(request, "post", "/users", { email: `ui-${RUN_ID}-p${i}@femxo.test`, name: `UI Pager ${i}`, temporaryPassword: "Temp-Pass-12345!x" });
  }
  await page.goto("/admin/users");
  const pager = page.getByRole("navigation", { name: /pages/i });
  const next = pager.getByRole("button", { name: /next/i });
  await expect(next).toBeEnabled();
  const first = (await page.getByRole("row").nth(1).textContent()) ?? "";
  await next.click();
  await expect(page.getByRole("row").nth(1)).not.toHaveText(first);
  await pager.getByRole("button", { name: /previous/i }).click();
  await expect(page.getByRole("row").nth(1)).toHaveText(first);
});

test("users: disable then enable persists across reload", async ({ request }) => {
  await page.goto("/admin/users");
  await page.getByPlaceholder(/email/i).fill(`ui-${RUN_ID}@`);
  await openRow(page, userEmail);
  await runAction(page, "Disable user");
  await expect.poll(async () => (await (await api(request, "get", `/users/${ids.user}`)).json()).user.status).toBe("disabled");
  await page.reload();
  await page.getByPlaceholder(/email/i).fill(`ui-${RUN_ID}@`);
  await expect(page.getByRole("row").filter({ hasText: userEmail }).getByText(/disabled/i)).toBeVisible();
  await openRow(page, userEmail);
  await runAction(page, "Enable user");
  await page.reload();
  await page.getByPlaceholder(/email/i).fill(`ui-${RUN_ID}@`);
  await expect(page.getByRole("row").filter({ hasText: userEmail }).getByText(/active/i)).toBeVisible();
});

test("roles: a role still assigned to a user can't be deleted, and the message says why", async ({ request }) => {
  const assign = await api(request, "put", `/access/users/${ids.user}/roles`, { roleIds: [ids.role] });
  expect([200, 204], await assign.text()).toContain(assign.status());
  await page.goto("/admin/roles");
  await page.getByPlaceholder(/roles/i).fill(roleName);
  await openRow(page, roleName);
  await runAction(page, "Delete role");
  await expect(page.getByText(/nothing was changed/i)).toBeVisible();
  await expect(page.getByText(/changed meanwhile/i)).toHaveCount(0);
  const still = await api(request, "get", "/access/roles");
  expect(JSON.stringify(await still.json())).toContain(roleName);
});

test("roles: once unassigned the role deletes, and stays gone after reload", async ({ request }) => {
  await api(request, "put", `/access/users/${ids.user}/roles`, { roleIds: [] });
  await page.goto("/admin/roles");
  await page.getByPlaceholder(/roles/i).fill(roleName);
  await openRow(page, roleName);
  await runAction(page, "Delete role");
  await expect(page.getByText(/deleted/i).first()).toBeVisible();
  await page.reload();
  await page.getByPlaceholder(/roles/i).fill(roleName);
  await expect(page.getByText(/no matches/i)).toBeVisible();
});

test("roles: create from the panel appears in the list", async () => {
  await page.goto("/admin/roles");
  await page.getByRole("button", { name: /new role|create role|add role/i }).first().click();
  await page.getByLabel(/role name/i).fill(`${roleName} B`);
  await page.getByLabel(/typical scope/i).selectOption({ index: 1 });
  await page.getByRole("button", { name: /^(create|save)/i }).last().click();
  await page.reload();
  await page.getByPlaceholder(/roles/i).fill(`${roleName} B`);
  await expect(page.getByRole("row").filter({ hasText: `${roleName} B` })).toHaveCount(1);
});

test("products: archive then restore, each persisted by the API", async ({ request }) => {
  const created = await api(request, "post", "/catalog/admin/products", {
    name: productName, brandId: "5eed00030000000000000001", categoryId: "5eed00040000000000000002", hsnCode: "1512", gstRateBp: 500, tracking: "none",
    variants: [{ sku: `UI-${RUN_ID}`.toUpperCase(), measure: { unit: "g", amount: 100 }, packOf: 1, prices: { purchase: 100, dealer: 110, subDealer: 120, prime: 130, selling: 140, mrp: 150 } }],
  });
  expect(created.status(), await created.text()).toBe(201);
  const product = (await created.json()).product;
  ids.product = product.id;
  ids.variant = product.variants[0].id;
  await page.goto("/admin/products");
  await page.getByPlaceholder(/filter/i).fill(productName);
  await openRow(page, productName);
  await runAction(page, "Archive", "Archive product");
  await expect.poll(async () => (await (await api(request, "get", `/catalog/admin/products/${ids.product}`)).json()).product.status).toBe("archived");
  // The drawer stays open on the updated record, offering the next action.
  await runAction(page, "Restore");
  await expect.poll(async () => (await (await api(request, "get", `/catalog/admin/products/${ids.product}`)).json()).product.status).toBe("active");
});

test("transfers: dispatch and receive move stock through the panel", async ({ request }) => {
  const key = (n: string) => ({ "Idempotency-Key": `ui-${RUN_ID}-${n}` });
  await api(request, "post", "/inventory/stock-in", { warehouseId: SEED.PAT, variantId: ids.variant, quantity: 20 }, key("in"));
  const t = await api(request, "post", "/inventory/transfers", { fromWarehouseId: SEED.PAT, toWarehouseId: SEED.GAY, reference: `UI-${RUN_ID}`, lines: [{ variantId: ids.variant, quantity: 6 }] }, key("tr"));
  expect(t.status(), await t.text()).toBe(201);
  ids.transfer = (await t.json()).transfer.id;
  await page.goto("/admin/warehouse");
  await page.getByPlaceholder(/filter/i).first().fill(`UI-${RUN_ID}`);
  await openRow(page, `UI-${RUN_ID}`);
  await runAction(page, "Dispatch");
  await expect.poll(async () => (await (await api(request, "get", `/inventory/transfers/${ids.transfer}`)).json()).transfer.status).toBe("in_transit");
  await runAction(page, "Mark received");
  await expect.poll(async () => (await (await api(request, "get", `/inventory/transfers/${ids.transfer}`)).json()).transfer.status).toBe("received");
  const dest = await (await api(request, "get", `/inventory/balances?warehouseId=${SEED.GAY}&variantId=${ids.variant}`)).json();
  expect(dest.balances.reduce((n: number, b: { quantity: number }) => n + b.quantity, 0)).toBe(6);
});

test("products: super admin sees Add product, the form validates, and a valid product is saved by the API", async ({ request }) => {
  const name = `UI Added ${RUN_ID}`;
  const sku = `UIADD-${RUN_ID}`.toUpperCase();
  await page.goto("/admin/products");
  await page.getByRole("button", { name: "Add product" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel(/brand/i)).toBeVisible();
  // Brands and categories come from the API.
  await expect(dialog.getByLabel(/brand/i).locator("option", { hasText: "Seed Femxo Select" })).toHaveCount(1);
  await dialog.getByLabel("Product name").fill(name);
  await dialog.getByLabel(/brand/i).selectOption({ label: "Seed Femxo Select" });
  await dialog.getByLabel(/category/i).selectOption({ label: "Seed Staples › Seed Edible Oil" });
  await dialog.getByLabel("HSN code").fill("1512");
  await dialog.getByLabel("GST rate").selectOption("5%");
  await dialog.getByLabel("Stock tracking").selectOption("None");
  await dialog.getByLabel("Pack size").fill("500");
  await dialog.getByLabel("Unit").selectOption("g");
  await dialog.getByLabel("SKU").fill(sku);
  const price = (label: string, value: string) => dialog.getByLabel(new RegExp(`^${label}`)).fill(value);
  // Out of order on purpose: dealer price above sub-dealer price.
  await price("Purchase price", "10");
  await price("Dealer price", "30");
  await price("Sub-dealer price", "20");
  await price("Prime price", "25");
  await price("Selling price", "28");
  await price("MRP", "30");
  let posted = 0;
  page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/catalog/admin/products")) posted++; });
  await dialog.getByRole("button", { name: "Add product" }).click();
  await expect(dialog.getByText(/can't be above/i)).toBeVisible();
  expect(posted).toBe(0);
  await price("Dealer price", "15");
  await dialog.getByRole("button", { name: "Add product" }).click();
  await expect(dialog).toBeHidden();
  const list = await (await api(request, "get", "/catalog/admin/products?limit=20")).json();
  const created = list.products.find((p: { name: string }) => p.name === name);
  expect(created, "product saved by the API").toBeTruthy();
  expect(created.variants[0].sku).toBe(sku);
  expect(created.variants[0].prices).toMatchObject({ purchase: 1000, dealer: 1500, subDealer: 2000, prime: 2500, selling: 2800, mrp: 3000 });
  expect(created.gstRateBp).toBe(500);
  expect(created.status).toBe("active");
  // Shown in the table, and still there after a reload.
  await page.reload();
  await page.getByPlaceholder(/filter/i).fill(name);
  await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(1);
});

test("products: the API's refusal (duplicate SKU) is shown and the form keeps its data", async () => {
  await page.goto("/admin/products");
  await page.getByRole("button", { name: "Add product" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel(/brand/i).locator("option", { hasText: "Seed Femxo Select" })).toHaveCount(1);
  await dialog.getByLabel("Product name").fill(`UI Dup ${RUN_ID}`);
  await dialog.getByLabel(/brand/i).selectOption({ label: "Seed Femxo Select" });
  await dialog.getByLabel(/category/i).selectOption({ label: "Seed Staples › Seed Edible Oil" });
  await dialog.getByLabel("HSN code").fill("1512");
  await dialog.getByLabel("GST rate").selectOption("5%");
  await dialog.getByLabel("Stock tracking").selectOption("None");
  await dialog.getByLabel("Pack size").fill("1");
  await dialog.getByLabel("Unit").selectOption("kg");
  await dialog.getByLabel("SKU").fill(`UIADD-${RUN_ID}`.toUpperCase());
  for (const [label, value] of [["Purchase price", "1"], ["Dealer price", "2"], ["Sub-dealer price", "3"], ["Prime price", "4"], ["Selling price", "5"], ["MRP", "6"]]) {
    await dialog.getByLabel(new RegExp(`^${label}`)).fill(value);
  }
  await dialog.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByText(/couldn.t save/i)).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Product name")).toHaveValue(`UI Dup ${RUN_ID}`);
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

// A real, valid PNG (the API refuses images under 200 px a side and checks the bytes, not the name).
function png(side = 240, shade = 0x40): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(side * 3, shade)]);
  const raw = Buffer.concat(Array.from({ length: side }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const picture = (name: string, shade: number) => ({ name, mimeType: "image/png", buffer: png(240, shade) });

async function fillNewProduct(dialog: Locator, name: string, sku: string) {
  await expect(dialog.getByLabel(/brand/i).locator("option", { hasText: "Seed Femxo Select" })).toHaveCount(1);
  await dialog.getByLabel("Product name").fill(name);
  await dialog.getByLabel(/brand/i).selectOption({ label: "Seed Femxo Select" });
  await dialog.getByLabel(/category/i).selectOption({ label: "Seed Staples › Seed Edible Oil" });
  await dialog.getByLabel("HSN code").fill("1512");
  await dialog.getByLabel("GST rate").selectOption("5%");
  await dialog.getByLabel("Stock tracking").selectOption("None");
  await dialog.getByLabel("Pack size").fill("500");
  await dialog.getByLabel("Unit").selectOption("g");
  await dialog.getByLabel("SKU").fill(sku);
  for (const [label, value] of [["Purchase price", "1"], ["Dealer price", "2"], ["Sub-dealer price", "3"], ["Prime price", "4"], ["Selling price", "5"], ["MRP", "6"]]) {
    await dialog.getByLabel(new RegExp(`^${label}`)).fill(value);
  }
}

const picsName = `UI Pics ${RUN_ID}`;

test("products: Add product uploads images, and refuses a file that isn't an image", async ({ request }) => {
  await page.goto("/admin/products");
  await page.getByRole("button", { name: "Add product" }).first().click();
  const dialog = page.getByRole("dialog");
  await fillNewProduct(dialog, picsName, `UIPIC-${RUN_ID}`.toUpperCase());
  // A text file is refused before anything is uploaded; the two PNGs are accepted.
  await dialog.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(dialog.getByText(/only JPEG, PNG or WebP/i)).toBeVisible();
  await dialog.locator('input[type="file"]').setInputFiles([picture("front.png", 0x30), picture("back.png", 0x90)]);
  await expect(dialog.getByRole("img", { name: /New image front\.png/ })).toBeVisible();
  await expect(dialog.getByText("2 of 8")).toBeVisible();
  await dialog.getByRole("button", { name: "Add product" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const find = async () => (await (await api(request, "get", "/catalog/admin/products?limit=30")).json()).products.find((p: { name: string }) => p.name === picsName);
  await expect.poll(async () => (await find())?.images.length).toBe(2);
  ids.pics = (await find()).id;
  // The worker resizes them; once ready they have URLs.
  await expect.poll(async () => (await find()).images.filter((i: { status: string }) => i.status === "ready").length, { timeout: 30_000 }).toBe(2);
});

test("products: Edit opens filled from the server, and blocks out-of-order prices before sending", async () => {
  await page.goto("/admin/products");
  await page.getByPlaceholder(/filter/i).fill(picsName);
  await openRow(page, picsName);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Product name")).toHaveValue(picsName);
  await expect(dialog.getByLabel(/^MRP/)).toHaveValue("6");
  await expect(dialog.getByLabel(/brand/i)).toHaveValue("Seed Femxo Select");
  // Saved images show as thumbnails (both are ready).
  await expect(dialog.getByRole("img", { name: picsName })).toHaveCount(2);
  let patched = 0;
  page.on("request", (r) => {
    if (r.method() === "PATCH") patched++;
  });
  await dialog.getByLabel(/^MRP/).fill("2");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog.getByText(/can't be above/i)).toBeVisible();
  expect(patched).toBe(0);
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("products: Edit saves new details and prices, removes one image and adds another", async ({ request }) => {
  const renamed = `${picsName} v2`;
  await page.goto("/admin/products");
  await page.getByPlaceholder(/filter/i).fill(picsName);
  await openRow(page, picsName);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Product name")).toHaveValue(picsName);
  await dialog.getByLabel("Product name").fill(renamed);
  await dialog.getByLabel("Description").fill("Edited in the panel");
  await dialog.getByLabel(/^MRP/).fill("9");
  await dialog.getByLabel(/^Selling price/).fill("8");
  await dialog.getByRole("button", { name: /^Remove/ }).first().click();
  await dialog.locator('input[type="file"]').setInputFiles(picture("side.png", 0xd0));
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const product = async () => (await (await api(request, "get", `/catalog/admin/products/${ids.pics}`)).json()).product;
  await expect.poll(async () => (await product()).name).toBe(renamed);
  const saved = await product();
  expect(saved.description).toBe("Edited in the panel");
  expect(saved.variants[0].prices).toMatchObject({ purchase: 100, dealer: 200, subDealer: 300, prime: 400, selling: 800, mrp: 900 });
  expect(saved.slug).toContain("ui-pics"); // the URL slug never changes
  expect(saved.images).toHaveLength(2); // 2 - 1 removed + 1 new
  // The table shows the saved values and they survive a reload.
  await page.reload();
  await page.getByPlaceholder(/filter/i).fill(renamed);
  await expect(page.getByRole("row").filter({ hasText: renamed })).toHaveCount(1);
});

test("products: Edit shows the API's refusal (duplicate barcode) and keeps what was typed", async ({ request }) => {
  const other = (await (await api(request, "get", "/catalog/admin/products?limit=30")).json()).products.find((p: { name: string }) => p.name === `UI Added ${RUN_ID}`);
  const taken: string = other.variants[0].barcode;
  await page.goto("/admin/products");
  await page.getByPlaceholder(/filter/i).fill(`${picsName} v2`);
  await openRow(page, `${picsName} v2`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Product name")).toHaveValue(`${picsName} v2`);
  await dialog.getByLabel("Barcode").fill(taken);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/couldn.t save/i)).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Barcode")).toHaveValue(taken);
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("transfers: requester shows a name, not a raw id", async () => {
  await page.goto("/admin/warehouse");
  await page.getByPlaceholder(/filter/i).first().fill(`UI-${RUN_ID}`);
  const row = page.getByRole("row").filter({ hasText: `UI-${RUN_ID}` }).first();
  await expect(row).toBeVisible();
  await expect(row).not.toContainText(/[0-9a-f]{24}/i);
});

test("the whole journey raised no uncaught page errors and no 5xx responses", async () => {
  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});

test("logout ends access: protected pages and the API both refuse", async ({ request }) => {
  await page.goto("/admin/users");
  const before = await page.evaluate(() => document.cookie);
  expect(before).not.toMatch(/refresh/i); // the refresh cookie is HttpOnly
  await signOutFromAdmin(page);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login/);
  const stale = await request.get(`${BASE_URL}/users?limit=1`, { headers: bearer(token) });
  expect([401, 403]).toContain(stale.status());
  expect(password().length).toBeGreaterThan(0);
});

test.afterAll(async () => {
  await page?.context().close();
});
