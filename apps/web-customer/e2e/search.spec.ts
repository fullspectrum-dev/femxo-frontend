import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const box = (page: Page) => page.getByRole("combobox", { name: "Search Femxo" });
const cards = (page: Page) => page.getByRole("main").getByRole("article");

test("searching shows matching products and keeps the words in the box", async ({ page }) => {
  await page.goto("/");
  await box(page).fill("mustard oil");
  await box(page).press("Enter");
  await expect(page).toHaveURL(/\/search\?q=mustard%20oil$/);
  await expect(page.getByRole("heading", { level: 1, name: "Results for “mustard oil”" })).toBeVisible();
  await expect(cards(page).first()).toBeVisible();
  for (const name of await cards(page).getByRole("heading", { level: 3 }).allInnerTexts()) expect(name.toLowerCase()).toContain("mustard");
  await expect(box(page)).toHaveValue("mustard oil");
});

test("a typo still finds the product, and says what was searched instead", async ({ page }) => {
  await page.goto("/search?q=biskit");
  await expect(page.getByText(/Showing results for/)).toHaveText("Showing results for biscuits");
  const names = await cards(page).getByRole("heading", { level: 3 }).allInnerTexts();
  expect(names.length).toBeGreaterThan(0);
  expect(names.some((name) => /biscuit/i.test(name))).toBe(true);
});

test("Hindi words work like their English ones, with no 'did you mean'", async ({ page }) => {
  await page.goto("/search?q=aata");
  await expect(cards(page).first()).toBeVisible();
  expect((await cards(page).getByRole("heading", { level: 3 }).allInnerTexts()).some((name) => /atta/i.test(name))).toBe(true);
  await expect(page.getByText(/Showing results for/)).toHaveCount(0);
});

test("nothing found is said plainly", async ({ page }) => {
  await page.goto("/search?q=zzzzqqxx");
  await expect(page.getByRole("heading", { name: "No products match" })).toBeVisible();
});

test("suggestions appear while typing and take you to a category", async ({ page }) => {
  await page.goto("/");
  await box(page).fill("snack");
  const list = page.getByRole("listbox", { name: "Suggestions" });
  await expect(list).toBeVisible();
  await expect(box(page)).toHaveAttribute("aria-expanded", "true");
  await list.getByRole("option", { name: /Snacks.*Category/ }).click();
  await expect(page).toHaveURL(/\/c\/snacks$/);
});

test("the keyboard walks the suggestions", async ({ page }) => {
  await page.goto("/");
  await box(page).fill("mus");
  await expect(page.getByRole("option").first()).toBeVisible();
  await box(page).press("ArrowDown");
  await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await box(page).press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(box(page)).toHaveValue("mus");
});

test("filters and sorting on search results keep the search words", async ({ page }) => {
  await page.goto("/search?q=oil");
  await page.getByRole("combobox", { name: "Sort by" }).selectOption("price_asc");
  await expect(page).toHaveURL(/q=oil.*sort=price_asc|sort=price_asc.*q=oil/);
  await expect(page.getByRole("heading", { level: 1, name: "Results for “oil”" })).toBeVisible();
});

test("the suggestions list has no serious accessibility issues", async ({ page }) => {
  await page.goto("/");
  await box(page).fill("snack");
  await expect(page.getByRole("listbox", { name: "Suggestions" })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the search form still goes to the results address", async ({ page }) => {
    await page.goto("/");
    // The page's static HTML carries the plain search field; the combobox takes over once script runs.
    const field = page.getByRole("searchbox", { name: "Search Femxo" });
    await field.fill("atta");
    await field.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=atta$/);
  });
});
