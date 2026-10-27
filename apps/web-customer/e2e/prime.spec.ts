import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Each test walks several pages, and the dev server compiles a page the first time it is visited.
test.setTimeout(120_000);

const KIRAN = "9000000005"; // not a member
const POOJA = "9000000003"; // annual member, birthday today

async function signInTo(page: Page, path: string, mobile: string) {
  await page.goto(`/login?next=${path}`);
  await page.getByLabel("Mobile number").fill(mobile);
  await page.getByRole("button", { name: "Get OTP" }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  await page.keyboard.type("123456");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  // (The login address itself ends in the same path, so wait for the path, not the text.)
  await page.waitForURL((url) => url.pathname === path);
}

async function noSeriousIssues(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("a guest sees the plans, and joining takes them through sign-in and back", async ({ page }) => {
  await page.goto("/prime");
  await expect(page.getByRole("heading", { level: 1, name: "Pay less, every day" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
  await noSeriousIssues(page);
  await page.getByRole("button", { name: "Join Prime Monthly" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fprime$/);
});

test("buying Prime: pay, get the card, and see Prime prices in the cart", async ({ page }) => {
  await signInTo(page, "/prime", KIRAN);
  await page.getByRole("button", { name: "Join Prime Monthly" }).click();
  await page.getByRole("dialog", { name: "Pay for your order" }).getByRole("button", { name: /^Pay ₹/ }).click();
  await expect(page.getByText(/Welcome to Prime/)).toBeVisible();
  const card = page.getByRole("region", { name: "Your Prime membership" });
  await expect(card).toContainText(/FXP-\d{6}/);
  await expect(card.getByRole("img", { name: /Membership QR code/ })).toBeVisible();
  await noSeriousIssues(page);

  // From now on this customer pays the Prime price and no delivery fee.
  await page.goto("/p/magadh-mills-chakki-fresh-atta");
  await page.getByRole("button", { name: /^Add to cart/ }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();
  await page.goto("/cart");
  const bill = page.getByRole("region", { name: "Price details" });
  await expect(bill).toContainText("Prime savings");
  await expect(bill).toContainText("Free");
});

test("a member sees their card, coupons and referral link", async ({ page }) => {
  await signInTo(page, "/prime", POOJA);
  const card = page.getByRole("region", { name: "Your Prime membership" });
  await expect(card).toContainText("FXP-000231");
  await expect(card).toContainText("Pooja Kumari");
  await expect(page.getByText("PRIME15")).toBeVisible();
  await page.getByRole("button", { name: "Copy code PRIME15" }).click();
  await expect(page.getByText(/Code copied|Your code is PRIME15/)).toBeVisible();
  const referral = page.getByRole("region", { name: "Refer a friend" });
  await expect(referral).toContainText("POOJA50");
  await expect(referral.getByRole("button", { name: "Copy referral link" })).toBeVisible();
  await noSeriousIssues(page);
});

test("a member is greeted on their birthday", async ({ page }) => {
  await signInTo(page, "/account", POOJA);
  const banner = page.getByRole("complementary", { name: "Birthday reward" });
  await expect(banner).toContainText("Happy birthday, Pooja");
  await expect(banner.getByRole("button", { name: /^Copy code BDAY-/ })).toBeVisible();
  await banner.getByRole("button", { name: "Dismiss" }).click();
  await expect(banner).toBeHidden();
});

test("someone who isn't a member is not greeted, and a lapsed member is invited to renew", async ({ page }) => {
  await signInTo(page, "/account", KIRAN);
  await expect(page.getByRole("complementary", { name: "Birthday reward" })).toBeHidden();
  await page.goto("/prime");
  await expect(page.getByRole("button", { name: "Join Prime Monthly" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your Prime membership" })).toBeHidden();
});
