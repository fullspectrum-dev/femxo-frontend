import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Each test walks several pages, and the dev server compiles a page the first time it is visited.
test.setTimeout(120_000);

const KIRAN = "9000000005";

async function signInTo(page: Page, path: string) {
  await page.goto(`/login?next=${path}`);
  await page.getByLabel("Mobile number").fill(KIRAN);
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

test("the account page leads everywhere", async ({ page }) => {
  await signInTo(page, "/account");
  await expect(page.getByRole("heading", { name: "Hello, Kiran Singh" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Your account" });
  for (const [name, path] of [
    ["Orders", "/orders"],
    ["Wishlist", "/wishlist"],
    ["Addresses", "/account/addresses"],
    ["Profile", "/account/profile"],
    ["Help & support", "/account/support"],
  ] as const) {
    await expect(nav.getByRole("link", { name })).toHaveAttribute("href", path);
  }
  await noSeriousIssues(page);
});

test("a customer updates their profile", async ({ page }) => {
  await signInTo(page, "/account/profile");
  const name = page.getByLabel("Full name");
  await expect(name).toHaveValue("Kiran Singh");
  await name.fill("Kiran Kumar Singh");
  await page.getByLabel(/Birthday/).fill("1991-04-02");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Hello, Kiran Kumar Singh" })).toBeVisible();
});

test("a customer adds, edits and deletes an address", async ({ page }) => {
  await signInTo(page, "/account/addresses");
  await page.getByRole("button", { name: "Add a new address" }).click();
  await page.getByLabel("Full name").fill("Asha Devi");
  await page.getByLabel("Mobile number").fill("9111111111");
  await page.getByLabel("House no., building, street").fill("12 Boring Road");
  await page.getByLabel("City").fill("Patna");
  await page.getByLabel("District").fill("Patna");
  await page.getByLabel("Pincode").fill("855107");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText(/don't deliver to 855107/)).toBeVisible();
  await page.getByLabel("Pincode").fill("800001");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText("12 Boring Road")).toBeVisible();

  await page.getByRole("button", { name: /^Edit address: Asha Devi/ }).click();
  await page.getByLabel("House no., building, street").fill("7 Fraser Road");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText("7 Fraser Road")).toBeVisible();

  await page.getByRole("button", { name: /^Make default: Asha Devi/ }).click();
  await expect(page.getByText("Default address changed")).toBeVisible();

  await page.getByRole("button", { name: /^Delete address: Asha Devi/ }).click();
  await page.getByRole("dialog", { name: "Delete this address?" }).getByRole("button", { name: "Delete address" }).click();
  await expect(page.getByText("Address deleted")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "7 Fraser Road" })).toHaveCount(0);
  await noSeriousIssues(page);
});

test("a customer raises a support request about an order and follows the conversation", async ({ page }) => {
  await signInTo(page, "/account/support");
  await expect(page.getByRole("heading", { name: "No requests yet" })).toBeVisible();
  await page.getByRole("button", { name: "New request" }).click();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "subject" })).toBeVisible();

  await page.getByLabel("Subject").fill("Where is my order?");
  const order = page.getByLabel(/^Order/);
  await expect(order.locator("option")).not.toHaveCount(1);
  await order.selectOption({ index: 1 });
  await page.getByLabel("Message").fill("It was due yesterday and I have heard nothing.");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Request sent")).toBeVisible();

  await page.getByRole("link", { name: /Where is my order\?/ }).click();
  await expect(page.getByText("It was due yesterday and I have heard nothing.")).toBeVisible();
  await page.getByLabel("Your reply").fill("Any news yet?");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("Any news yet?")).toBeVisible();
  await expect(page.getByRole("link", { name: "your order" })).toHaveAttribute("href", /\/orders\/ord-/);
  await noSeriousIssues(page);
});
