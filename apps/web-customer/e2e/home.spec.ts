import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the home page leads with offers, categories and deals", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Offers" }).getByRole("link")).toHaveCount(4);
  await expect(page.getByRole("navigation", { name: "Shop by category" }).last().getByRole("link")).toHaveCount(8);
  const deals = page.getByRole("region", { name: "Today's deals" });
  await expect(deals.getByRole("listitem")).toHaveCount(8);
  await expect(deals.getByRole("listitem").first().getByText(/% off/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Prime picks" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Femxo Prime" })).toBeVisible();
});

test("product pictures are real optimised images, not the full-size files", async ({ page }) => {
  await page.goto("/");
  const first = page.getByRole("region", { name: "Today's deals" }).locator("img").first();
  await expect(first).toHaveAttribute("src", /\/_next\/image\?url=.*&w=\d+&q=\d+/);
  await expect(first).toHaveAttribute("srcset", /\d+w/);
  const loaded = await first.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0);
  expect(loaded).toBe(true);
});

test("the home page fits the screen and has no serious accessibility issues", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});
