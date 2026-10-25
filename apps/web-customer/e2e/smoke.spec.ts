import { expect, test } from "@playwright/test";

test("the storefront renders and says it runs on demo data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("contentinfo").getByText("Demo data")).toBeVisible();
  // Responsive: nothing scrolls sideways at any of the three widths.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("pages use the shared design tokens (cream canvas, Inter text, Space Grotesk headings)", async ({ page }) => {
  await page.goto("/");
  const body = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return { background: style.backgroundColor, color: style.color, font: style.fontFamily };
  });
  expect(body.background).toBe("rgb(255, 250, 244)"); // --color-canvas
  expect(body.color).toBe("rgb(18, 7, 31)"); // --color-ink
  expect(body.font).toMatch(/Inter/);
  const heading = await page.getByRole("heading", { level: 2, name: "Today's deals" }).evaluate((el) => getComputedStyle(el).fontFamily);
  expect(heading).toMatch(/Space Grotesk/);
});
