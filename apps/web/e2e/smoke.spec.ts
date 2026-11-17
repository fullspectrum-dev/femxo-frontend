import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api";

// Read from the built app's own config, so new panels are covered without editing this list.
import { PANELS, ROLE_PANEL_ORDER } from "../src/features/admin/panels";

test.describe("HTTP routing", () => {
  test("login page renders", async ({ page }) => {
    await mockApi(page);
    const res = await page.goto("/login");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Sign in to Femxo" })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  for (const id of ROLE_PANEL_ORDER) {
    test(`/panel/${id}/dashboard answers 200`, async ({ request }) => {
      const res = await request.get(`/panel/${id}/dashboard`, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
    });
  }

  for (const path of ["/panel/nope/dashboard", "/panel/dealer/nope", "/panel/super-admin/dashboard", "/panel/dealer/dashboard/extra"]) {
    test(`unknown ${path} answers 404`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(404);
    });
  }

  test("/panel/admin redirects (307) to its dashboard", async ({ request }) => {
    const res = await request.get("/panel/admin", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(new URL(res.headers()["location"]!, "http://x").pathname).toBe("/panel/admin/dashboard");
  });
});

test.describe("session", () => {
  test("a signed-out visit to a panel is sent to /login", async ({ page }) => {
    await mockApi(page);
    await page.goto("/panel/dealer/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fpanel%2Fdealer%2Fdashboard$/);
  });

  test("a Dealer signs in, lands on the Dealer panel and sees only permitted menu items", async ({ page }) => {
    await mockApi(page, { roles: ["Dealer"], permissions: ["dashboard.view", "order.view", "wallet.view"] });
    await page.goto("/login");
    await page.getByLabel("Email address").fill("dealer@femxo.test");
    await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/panel\/dealer\/dashboard$/);
    const menu = page.getByRole("navigation", { name: `${PANELS.dealer.name} modules` }).first();
    await expect(menu.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "My Orders" })).toHaveAttribute("href", "/panel/dealer/orders");
    await expect(menu.getByRole("link", { name: "Wallet & Payouts" })).toBeVisible();
    for (const hidden of ["My Sub-Dealers", "Customers", "Approvals", "Invoices", "Catalog"]) {
      await expect(menu.getByRole("link", { name: hidden })).toHaveCount(0);
    }
  });

  test("an /access/me failure shows the retry state", async ({ page }) => {
    const calls = await mockApi(page, { roles: ["Dealer"] }, { signedIn: true, accessFails: true });
    await page.goto("/panel/dealer/dashboard");
    await expect(page.getByText("Couldn’t check your access")).toBeVisible();
    const before = calls.access;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect.poll(() => calls.access).toBeGreaterThan(before);
  });
});
