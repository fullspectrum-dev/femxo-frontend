import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The error test signs in and visits several pages; the dev server compiles each page the first time it is visited.
test.setTimeout(90_000);

test("the offline banner appears when the connection drops, and goes when it returns", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
  await context.setOffline(true);
  await expect(page.getByText(/You're offline/).first()).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/You're offline\. What's already loaded/)).toBeHidden();
});

test("the offline page is a real page that fits the screen and has no serious issues", async ({ page }) => {
  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});

test("an unknown address is a proper 404 inside the store", async ({ page }) => {
  const response = await page.goto("/no/such/page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the store" })).toBeVisible();
});

test("a failed request shows an error with a retry, and the retry works", async ({ page }) => {
  await page.goto("/login?next=/orders");
  await page.getByLabel("Mobile number").fill("9000000005");
  await page.getByRole("button", { name: "Get OTP" }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  await page.keyboard.type("123456");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.waitForURL((url) => url.pathname === "/orders");
  await expect(page.getByRole("link", { name: /Order FX-\d+/ }).first()).toBeVisible();

  // Fail the next request, go to another list, and expect an error screen that recovers.
  await page.getByRole("button", { name: "Demo controls" }).click();
  const panel = page.getByRole("dialog", { name: "Demo controls" });
  await panel.getByRole("button", { name: "Fail the next request" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Delivered" }).click();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: /Order FX-\d+/ }).first()).toBeVisible();
});
