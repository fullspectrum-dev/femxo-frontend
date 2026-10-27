import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const KIRAN_MOBILE = "9000000005";
/**
 * The mock API answers after a simulated delay (300-600 ms) and a reload or page load drops a request still in
 * flight, so let the save land before leaving the page, as a real network would have.
 */
const letSaveLand = (page: Page) => page.waitForTimeout(1200);

const firstHeart = (page: Page) => page.getByRole("main").getByRole("article").first().getByRole("button", { name: /^Save / });

async function otpSignIn(page: Page, mobile: string) {
  await page.getByLabel("Mobile number").fill(mobile);
  await page.getByRole("button", { name: "Get OTP" }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  await page.keyboard.type("123456");
  await page.getByRole("button", { name: "Verify and continue" }).click();
}

test("a guest taps the heart, signs in, and the product is saved", async ({ page }) => {
  await page.goto("/c/atta-flours");
  const heart = firstHeart(page);
  const name = (await heart.getAttribute("aria-label"))!.replace(/^Save | to wishlist$/g, "");
  await expect(heart).toBeEnabled();
  await heart.click();
  await expect(page).toHaveURL(/\/login\?next=%2Fc%2Fatta-flours$/);
  await otpSignIn(page, KIRAN_MOBILE);
  await expect(page).toHaveURL(/\/c\/atta-flours$/);
  await expect(page.getByText("Saved to your wishlist")).toBeVisible();

  await page.goto("/wishlist");
  await expect(page.getByRole("heading", { level: 1, name: "Your wishlist" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name })).toBeVisible();
});

test("a customer saves, unsaves, and moves a saved product to the cart", async ({ page }) => {
  await page.goto("/login?next=/c/atta-flours");
  await otpSignIn(page, KIRAN_MOBILE);
  // (The login address itself ends in /c/atta-flours, so wait for the path, not the text.)
  await page.waitForURL((url) => url.pathname === "/c/atta-flours");

  const heart = firstHeart(page);
  await expect(heart).toBeEnabled();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await letSaveLand(page);
  await page.reload();
  await expect(firstHeart(page)).toHaveAttribute("aria-pressed", "true");

  await page.goto("/wishlist");
  await expect(page.getByRole("list").getByRole("listitem").first()).toBeVisible();
  const move = page.getByRole("button", { name: /^Move to cart/ }).first();
  if (await move.count()) {
    await move.click();
    await expect(page.getByText("Moved to cart")).toBeVisible();
    await expect(page.getByRole("link", { name: "Cart, 1 item" })).toBeVisible();
  }
});

test("the wishlist asks a guest to sign in", async ({ page }) => {
  await page.goto("/wishlist");
  await expect(page).toHaveURL(/\/login\?next=%2Fwishlist$/);
});

test("the wishlist page fits the screen and has no serious accessibility issues", async ({ page }) => {
  await page.goto("/login?next=/c/atta-flours");
  await otpSignIn(page, KIRAN_MOBILE);
  await expect(firstHeart(page)).toBeEnabled();
  await firstHeart(page).click();
  await letSaveLand(page);
  await page.goto("/wishlist");
  await expect(page.getByRole("heading", { level: 2, name: "Saved products" })).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});
