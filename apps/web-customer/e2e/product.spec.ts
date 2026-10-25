import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const SLUG = "magadh-mills-chakki-fresh-atta";

test("a product card opens its page with price, stock, variants and JSON-LD", async ({ page }) => {
  await page.goto("/c/atta-flours");
  await page.getByRole("main").getByRole("article").first().getByRole("link").click();
  await expect(page).toHaveURL(/\/p\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("group", { name: "Size / pack" }).getByRole("radio").first()).toBeChecked();
  await expect(page.getByText(/In stock|Only \d+ left|Out of stock/)).toBeVisible();
  await expect(page.getByText(/with Prime/).first()).toBeVisible();
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}");
  expect(ld["@type"]).toBe("Product");
});

test("the pincode check answers for a served and an unserved pincode", async ({ page }) => {
  await page.goto(`/p/${SLUG}`);
  const field = page.getByLabel("Pincode");
  await field.fill("800001");
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText(/Delivers to 800001, Patna/)).toBeVisible();
  await field.fill("855107");
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText(/don't deliver to 855107/)).toBeVisible();
});

test("reviews load more, and related products are offered", async ({ page }) => {
  await page.goto(`/p/${SLUG}`);
  const reviews = page.getByRole("region", { name: "Ratings & reviews" }).getByRole("article");
  const before = await reviews.count();
  const more = page.getByRole("button", { name: "Show more reviews" });
  if (await more.count()) {
    await more.click();
    await expect.poll(() => reviews.count()).toBeGreaterThan(before);
  }
  await expect(page.getByRole("region", { name: "You may also like" })).toBeVisible();
});

test("an unknown product is a real 404", async ({ page }) => {
  const response = await page.goto("/p/does-not-exist");
  expect(response?.status()).toBe(404);
});

test("the product page fits the screen and has no serious accessibility issues", async ({ page }) => {
  await page.goto(`/p/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});
