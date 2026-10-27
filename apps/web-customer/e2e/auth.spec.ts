import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const POOJA = "9000000003";

// Scoped to the page: Next adds its own route-announcer alert outside <main>.
const alert = (page: Page) => page.locator("main").getByRole("alert");

async function otpSignIn(page: Page, mobile: string, code = "123456") {
  // By role, not label: after a client-side navigation the previous page can still be in the DOM, hidden.
  await page.getByRole("textbox", { name: "Mobile number" }).fill(mobile);
  await page.getByRole("button", { name: "Get OTP" }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  await page.keyboard.type(code); // the first box has focus
  await page.getByRole("button", { name: "Verify and continue" }).click();
}

test("a guest who needs to sign in comes back to the page they wanted", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
  await otpSignIn(page, POOJA);
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Hello, Pooja Kumari" })).toBeVisible();
  await expect(page.getByText("Prime member")).toBeVisible();
});

test("staying signed in across a reload, and signing out for good", async ({ page }) => {
  await page.goto("/login?next=/account");
  await otpSignIn(page, POOJA);
  await expect(page.getByRole("heading", { name: "Hello, Pooja Kumari" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Hello, Pooja Kumari" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
});

test("a new customer creates an account, signs in with it, and then shops", async ({ page }) => {
  // From sign in, the way to a new account is one click away.
  await page.goto("/login");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { level: 1, name: "Create your Femxo account" })).toBeVisible();

  await otpSignIn(page, "9111111111");
  await expect(page.getByRole("heading", { name: "What should we call you?" })).toBeVisible();
  await page.getByLabel(/Your name/).fill("Asha Devi");
  await page.getByRole("button", { name: "Create account" }).click();

  // The account is made; now the sign-in page, with the number already filled in.
  await expect(page).toHaveURL(/\/login\?created=1&mobile=9111111111$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to Femxo" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Your account is ready" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Mobile number" })).toHaveValue("9111111111");
  await page.getByRole("button", { name: "Get OTP" }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  await page.keyboard.type("123456");
  await page.getByRole("button", { name: "Verify and continue" }).click();

  // No page was asked for, so the customer lands in the store, signed in with the name they gave.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Femxo store" })).toBeVisible();
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Hello, Asha Devi" })).toBeVisible();
});

test("a customer who already has an account can go from sign up to sign in", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("signing in without a destination lands in the store, not the account page", async ({ page }) => {
  await page.goto("/login");
  await otpSignIn(page, POOJA);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Femxo store" })).toBeVisible();
});

test("wrong codes count down, then lock the number", async ({ page }) => {
  await page.goto("/login");
  await otpSignIn(page, POOJA, "000000");
  await expect(alert(page)).toContainText("That code isn't right. 4 tries left.");
  for (const left of [3, 2, 1]) {
    await page.keyboard.type("000000");
    await page.getByRole("button", { name: "Verify and continue" }).click();
    await expect(alert(page)).toContainText(`${left} ${left === 1 ? "try" : "tries"} left`);
  }
  await page.keyboard.type("000000");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(alert(page)).toContainText("Try again in 15 minutes");
  await expect(page.getByRole("button", { name: "Verify and continue" })).toBeDisabled();
});

test("email and password work too", async ({ page }) => {
  await page.goto("/login?next=/account");
  await page.getByRole("tab", { name: "Email" }).click();
  await page.getByRole("textbox", { name: "Email" }).fill("kiran.s@demo.femxo.test");
  await page.getByLabel("Password").fill("Demo@12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hello, Kiran Singh" })).toBeVisible();
});

test("the sign-in screens have no serious accessibility issues, at every step", async ({ page }) => {
  const serious = async () =>
    (await new AxeBuilder({ page }).analyze()).violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);

  await page.goto("/login");
  expect(await serious()).toEqual([]);
  await page.getByLabel("Mobile number").fill("9111111111");
  await page.getByRole("button", { name: "Get OTP" }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  expect(await serious()).toEqual([]);
  await page.keyboard.type("123456");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page.getByRole("heading", { name: "What should we call you?" })).toBeVisible();
  expect(await serious()).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
