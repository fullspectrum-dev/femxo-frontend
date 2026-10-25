import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const cards = (page: Page) => page.getByRole("main").getByRole("article");
// The result count is the page's live region. (A page you navigated from stays in the DOM, hidden, so match by role.)
const count = (page: Page) => page.getByRole("main").locator("p[aria-live='polite']");

test("from the home page into a category, with its products and subcategories", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Shop by category" }).last().getByRole("link", { name: /Staples/ }).click();
  await expect(page).toHaveURL(/\/c\/staples$/);
  await expect(page.getByRole("heading", { level: 1, name: "Staples" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Staples subcategories" }).getByRole("link")).toHaveCount(4);
  await expect(cards(page)).toHaveCount(24);
  await expect(count(page)).toHaveText(/^\d+ products$/);
});

test("a subcategory shows its breadcrumb path and only its own products", async ({ page }) => {
  await page.goto("/c/atta-flours");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Home");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Staples" })).toHaveAttribute("href", "/c/staples");
  await expect(page.getByRole("heading", { level: 1, name: "Atta & flours" })).toBeVisible();
  for (const name of await cards(page).getByRole("heading", { level: 3 }).allInnerTexts()) expect(name).toMatch(/atta|maida|sooji/i);
});

test("sorting by price puts the cheapest first, and the address keeps it across a reload", async ({ page }) => {
  await page.goto("/c/staples");
  await page.getByRole("combobox", { name: "Sort by" }).selectOption("price_asc");
  await expect(page).toHaveURL(/sort=price_asc/);
  // The first price on each card (a card also has a "with Prime" price line).
  const prices = () =>
    cards(page).evaluateAll((articles) =>
      articles
        .slice(0, 6)
        .map((article) => [...article.querySelectorAll("p")].find((paragraph) => /^₹/.test(paragraph.innerText))?.innerText.match(/₹([\d,]+)/)?.[1])
        .map((text) => Number((text ?? "0").replace(/,/g, "")))
    );
  await expect
    .poll(async () => {
      const list = await prices();
      return list.length > 1 && list[0]! <= list[1]!;
    })
    .toBe(true);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Sort by" })).toHaveValue("price_asc");
});

test("filtering by brand narrows the list, shows a removable chip, and clearing restores it", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "Below 1024px the filters live in a sheet (next test).");
  await page.goto("/c/staples");
  const before = await count(page).innerText();
  const sidebar = page.getByRole("complementary", { name: "Filters" });
  await sidebar.getByRole("group", { name: "Brand" }).getByRole("checkbox").first().check();
  await expect(page).toHaveURL(/brand=/);
  await expect(page.getByRole("list", { name: "Active filters" })).toBeVisible();
  await expect.poll(() => count(page).innerText()).not.toBe(before);
  await page.getByRole("list", { name: "Active filters" }).getByRole("button").click();
  await expect(page).not.toHaveURL(/brand=/);
  await expect(count(page)).toHaveText(before);
});

test("on phones and tablets, the filters open in a sheet and apply as you choose", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 1024, "From 1024px the filters are a sidebar (previous test).");
  await page.goto("/c/staples");
  await page.getByRole("button", { name: "Filters" }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await sheet.getByRole("radio", { name: /4★ & up/ }).check();
  await expect(page).toHaveURL(/rating=4/);
  await sheet.getByRole("button", { name: /Show \d+ products?/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("list", { name: "Active filters" })).toContainText("4★ & up");
});

test("load more adds the next page", async ({ page }) => {
  await page.goto("/c/staples");
  await expect(cards(page)).toHaveCount(24);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect.poll(() => cards(page).count()).toBeGreaterThan(24);
});

test("an unknown category is a proper not-found page", async ({ page }) => {
  const response = await page.goto("/c/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
});

test("the category page fits the screen and has no serious accessibility issues", async ({ page }) => {
  await page.goto("/c/staples");
  await expect(cards(page).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});
