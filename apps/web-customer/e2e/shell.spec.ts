import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the shell has its landmarks and a working skip link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toBeAttached();
  await expect(page.getByRole("contentinfo")).toBeVisible();

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});

test("search sends the query to /search", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Search Femxo" }).fill("atta");
  await page.getByRole("combobox", { name: "Search Femxo" }).press("Enter");
  await expect(page).toHaveURL(/\/search\?q=atta$/);
});

test("phones get the bottom bar; larger screens don't", async ({ page }, testInfo) => {
  await page.goto("/");
  const bar = page.getByRole("navigation", { name: "Main" });
  // On phones Prime and Account live in the bottom bar, not twice.
  const headerAccount = page.getByRole("navigation", { name: "Account and cart" }).getByRole("link", { name: "Account" });
  if (testInfo.project.name === "phone") {
    await expect(bar).toBeVisible();
    await expect(headerAccount).toBeHidden();
  } else {
    await expect(bar).toBeHidden();
    await expect(headerAccount).toBeVisible();
  }
});

test("nothing scrolls sideways, and the page has no serious accessibility issues", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("the categories sheet is a real modal: Esc closes it and focus returns", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "The bottom bar exists on phones only.");
  await page.goto("/");
  const opener = page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Categories" });
  await opener.click();
  const sheet = page.getByRole("dialog", { name: "All categories" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Edible oil" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();
});
