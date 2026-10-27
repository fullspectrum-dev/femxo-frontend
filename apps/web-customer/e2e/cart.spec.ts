import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const PRODUCT = "/p/magadh-mills-chakki-fresh-atta";
const POOJA = "9000000003";

const bill = (page: Page) => page.getByRole("region", { name: "Price details" });
const rupees = (text: string) => Number(text.replace(/[^\d.]/g, ""));
const totalOf = async (page: Page) => rupees(await bill(page).locator("div", { hasText: /^Total/ }).last().innerText());

async function addFromProductPage(page: Page, times = 1) {
  await page.goto(PRODUCT);
  for (let i = 0; i < times - 1; i++) await page.getByRole("button", { name: /^Increase quantity/ }).click();
  await page.getByRole("button", { name: /^Add to cart/ }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();
}

test("a guest adds from the product page and sees it in the cart", async ({ page }) => {
  await addFromProductPage(page);
  await expect(page.getByRole("link", { name: "Cart, 1 item" })).toBeVisible();
  await page.getByRole("link", { name: /^Cart, 1 item/ }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your cart" })).toBeVisible();
  await expect(page.getByRole("list").getByRole("listitem").first()).toBeVisible();
});

test("changing the quantity updates the total, and removing the last item empties the cart", async ({ page }) => {
  await addFromProductPage(page);
  await page.goto("/cart");
  await expect(bill(page)).toBeVisible();
  const before = await totalOf(page);
  await page.getByRole("button", { name: /^Increase quantity/ }).click();
  await expect.poll(() => totalOf(page)).toBeGreaterThan(before);
  await page.getByRole("button", { name: /^Remove / }).click();
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
});

test("the cart keeps its items over a reload", async ({ page }) => {
  await addFromProductPage(page, 2);
  await page.goto("/cart");
  await expect(page.getByRole("link", { name: "Cart, 2 items" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Cart, 2 items" })).toBeVisible();
});

test("a coupon takes money off, a bad one says why, and a cart that's too small is told how much more", async ({ page }) => {
  await addFromProductPage(page, 4);
  await page.goto("/cart");
  const before = await totalOf(page);
  const coupon = page.getByRole("region", { name: "Coupon" });
  await coupon.getByLabel("Coupon code").fill("OLD20");
  await coupon.getByRole("button", { name: "Apply" }).click();
  await expect(coupon.getByRole("alert")).toContainText("expired");
  await coupon.getByLabel("Coupon code").fill("FLAT50");
  await coupon.getByRole("button", { name: "Apply" }).click();
  await expect(coupon.getByText(/FLAT50 applied/)).toBeVisible();
  await expect.poll(() => totalOf(page)).toBe(before - 50);
  await coupon.getByRole("button", { name: "Remove coupon" }).click();
  await expect.poll(() => totalOf(page)).toBe(before);
});

test("quick-add from a product card", async ({ page }) => {
  await page.goto("/c/atta-flours");
  await page.getByRole("main").getByRole("article").getByRole("button", { name: /^Add:/ }).first().click();
  await expect(page.getByText("Added to cart")).toBeVisible();
  await expect(page.getByRole("link", { name: "Cart, 1 item" })).toBeVisible();
});

test("a guest's cart joins their account when they sign in", async ({ page }) => {
  await addFromProductPage(page);
  await page.goto("/login?next=/cart");
  await page.getByLabel("Mobile number").fill(POOJA);
  await page.getByRole("button", { name: "Get OTP" }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  await page.keyboard.type("123456");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.waitForURL((url) => url.pathname === "/cart");
  await expect(page.getByRole("heading", { level: 1, name: "Your cart" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cart, 1 item" })).toBeVisible();
  await expect(bill(page)).toBeVisible();
  // Pooja is Prime: Prime savings and free delivery.
  await expect(bill(page)).toContainText("Prime savings");
  await expect(bill(page)).toContainText("Free");
});

test("the cart page fits the screen and has no serious accessibility issues", async ({ page }) => {
  await addFromProductPage(page, 2);
  await page.goto("/cart");
  await expect(bill(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});
