import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/*
 * Cart, checkout, payment and orders against e2e/stub-api.mjs, which behaves like femxo-backend's /store/v1 (priced cart with a
 * revision, Idempotency-Key checkout, Razorpay-shaped payments). Razorpay's own script is replaced by e2e/fake-razorpay.js, so the
 * window never opens: the test says what the customer does in it (window.__rzpModes).
 * Serial: the specs share one stub, reset before each.
 */
test.describe.configure({ mode: "serial" });

const api = () => `http://127.0.0.1:${process.env.E2E_API_PORT}`;
const FAKE = readFileSync(path.join(import.meta.dirname, "fake-razorpay.js"), "utf8");

test.beforeEach(async ({ page, context, request, baseURL }) => {
  await request.post(`${api()}/__reset`);
  await context.addCookies([{ name: "fx_rt", value: "1", url: baseURL! }]);
  await page.route("https://checkout.razorpay.com/v1/checkout.js", (route) => route.fulfill({ contentType: "text/javascript", body: FAKE }));
});

const control = (request: import("@playwright/test").APIRequestContext, body: object) => request.post(`${api()}/__control`, { data: body });
const state = async (request: import("@playwright/test").APIRequestContext) => (await request.get(`${api()}/__state`)).json();
const razorpayModes = (page: Page, modes: string[]) => page.addInitScript((m) => ((window as unknown as { __rzpModes: string[] }).__rzpModes = m), modes);
const razorpayScriptLoaded = (page: Page) => page.evaluate(() => !!document.querySelector('script[src*="checkout.razorpay.com"]'));

/** Adds the rice to the cart from its page and goes to checkout with the saved address. */
async function toCheckout(page: Page) {
  await page.goto("/p/basmati-rice");
  await page.getByRole("button", { name: /^Add to cart: Basmati Rice/ }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await page.getByRole("link", { name: "Proceed to checkout" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole("radio", { name: /Asha Devi/ })).toBeChecked();
}

test("cart: quantity steppers write the cart, and the bill follows the server", async ({ page, request }) => {
  await page.goto("/p/basmati-rice");
  await page.getByRole("button", { name: /^Add to cart: Basmati Rice/ }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();
  await page.goto("/cart");
  const line = page.getByTestId("cart-line");
  await expect(line).toContainText("Basmati Rice");
  await expect(page.getByTestId("bill-total")).toHaveText("₹500");
  await line.getByRole("button", { name: /Increase quantity/ }).click();
  await expect(page.getByTestId("bill-total")).toHaveText("₹1,000");
  await line.getByRole("button", { name: /Decrease quantity/ }).click();
  await expect(page.getByTestId("bill-total")).toHaveText("₹500");
  // The screen shows the change at once; the server has it a moment later.
  await expect.poll(async () => (await state(request)).cart.items).toEqual([expect.objectContaining({ variantId: "v1", quantity: 1 })]);
  await line.getByRole("button", { name: /^Remove/ }).click();
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
});

test("cart: a changed price blocks checkout until it is accepted, a stock shortfall until it is fixed", async ({ page, request }) => {
  await page.goto("/p/basmati-rice");
  await page.getByRole("button", { name: /^Add to cart: Basmati Rice/ }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();
  await control(request, { prices: { v1: 55000 } });
  await page.goto("/cart");
  await expect(page.getByTestId("price-change-banner")).toBeVisible();
  await expect(page.getByTestId("price-changed")).toContainText("₹550");
  await expect(page.getByRole("link", { name: "Proceed to checkout" })).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("button", { name: "Accept new prices" }).click();
  await expect(page.getByTestId("price-change-banner")).toBeHidden();
  await expect(page.getByRole("link", { name: "Proceed to checkout" })).not.toHaveAttribute("aria-disabled", "true");

  await control(request, { availableQty: { v1: 0 } });
  await page.reload();
  await expect(page.getByTestId("stock-banner")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: /Out of stock/ })).toBeVisible();
});

test("a cart changed on another device is refreshed, not overwritten", async ({ page, request }) => {
  await page.goto("/p/basmati-rice");
  await page.getByRole("button", { name: /^Add to cart: Basmati Rice/ }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  // Another device adds dal, which moves the revision under this page.
  const res = await request.put(`${api()}/store/v1/cart`, { headers: { authorization: "Bearer tok_stub" }, data: { items: [{ variantId: "v1", quantity: 1 }, { variantId: "v2", quantity: 1 }] } });
  expect(res.ok()).toBeTruthy();
  await page.getByTestId("cart-line").getByRole("button", { name: /Increase quantity/ }).click();
  await expect(page.getByTestId("cart-line")).toHaveCount(2);
  await expect(page.getByRole("status").filter({ hasText: "changed on another device" })).toBeVisible();
});

test("COD: cart to checkout to a confirmed order, with one Idempotency-Key per attempt", async ({ page, request }) => {
  await toCheckout(page);
  await page.getByRole("radio", { name: /Cash on delivery/ }).check();
  const checkouts: (string | undefined)[] = [];
  page.on("request", (r) => r.url().endsWith("/store/v1/checkout") && checkouts.push(r.headers()["idempotency-key"]));
  await page.getByRole("button", { name: "Place order" }).first().click();
  await expect(page).toHaveURL(/\/orders\/o1\?placed=1/);
  await expect(page.getByTestId("order-confirmation")).toContainText("FX-1001");
  await expect(page.getByTestId("order-total")).toHaveText("₹500");
  expect(checkouts).toHaveLength(1);
  expect(checkouts[0]).toMatch(/^[\w-]{8,100}$/);
  const sent = (await state(request)).checkoutBody;
  expect(sent).toEqual({ addressId: "a1", paymentMethod: "cod", cartRev: expect.any(Number), expectedTotalPaise: 50000 });
  expect(await razorpayScriptLoaded(page)).toBe(false); // Razorpay is only loaded to pay
  await expect(page.getByRole("list", { name: "Order timeline" })).toContainText("Order confirmed");
});

test("online: pays with Razorpay Checkout and is only paid once the server says so", async ({ page, request }) => {
  await razorpayModes(page, ["success"]);
  await toCheckout(page);
  expect(await razorpayScriptLoaded(page)).toBe(false); // not loaded just for looking at checkout
  await page.getByRole("button", { name: /^Pay ₹500/ }).first().click();
  await expect(page).toHaveURL(/\/orders\/o1\?placed=1/);
  await expect(page.getByTestId("order-confirmation")).toContainText("Your payment was received");
  const opened = await page.evaluate(() => (window as unknown as { __rzpOpened?: unknown[] }).__rzpOpened);
  expect(opened).toEqual([{ key: "rzp_test_stub", order_id: "order_TEST1", amount: 50000, currency: "INR" }]);
  expect((await state(request)).orders[0]).toMatchObject({ status: "placed", paymentStatus: "captured" });
});

test("online: a payment the server hasn't confirmed yet is not shown as paid, and settles by itself", async ({ page, request }) => {
  await control(request, { capture: false });
  await razorpayModes(page, ["success"]);
  await toCheckout(page);
  await page.getByRole("button", { name: /^Pay ₹500/ }).first().click();
  // The browser says it worked; the server hasn't captured it, so nothing is called paid.
  await expect(page.getByTestId("payment-progress")).toContainText("Confirming your payment");
  expect((await state(request)).orders[0]).toMatchObject({ status: "pending_payment" });
  await expect(page).toHaveURL(/\/checkout$/);
  // The webhook lands: the page notices on its next look and moves on.
  await control(request, { capturePending: true });
  await expect(page).toHaveURL(/\/orders\/o1\?placed=1/, { timeout: 15_000 });
  await expect(page.getByTestId("order-confirmation")).toContainText("Your payment was received");
});

test("online: a failed payment can be retried with /orders/:id/pay", async ({ page, request }) => {
  await razorpayModes(page, ["fail", "success"]);
  await toCheckout(page);
  await page.getByRole("button", { name: /^Pay ₹500/ }).first().click();
  await expect(page.getByTestId("pay-outcome")).toContainText("Your card was declined");
  expect((await state(request)).orders[0]).toMatchObject({ status: "pending_payment" });
  await page.getByRole("button", { name: "Try payment again" }).click();
  await expect(page).toHaveURL(/\/orders\/o1\?placed=1/);
  await expect(page.getByTestId("order-confirmation")).toBeVisible();
  const opened = await page.evaluate(() => (window as unknown as { __rzpOpened?: unknown[] }).__rzpOpened);
  expect(opened).toHaveLength(2);
});

test("online: closing the payment window keeps the order, which can be paid later from My orders", async ({ page }) => {
  await razorpayModes(page, ["dismiss"]);
  await toCheckout(page);
  await page.getByRole("button", { name: /^Pay ₹500/ }).first().click();
  await expect(page.getByTestId("pay-outcome")).toContainText("closed the payment window");
  await page.getByRole("link", { name: "View order" }).click();
  await expect(page.getByTestId("order-status")).toHaveText("Awaiting payment");
  await expect(page.getByRole("heading", { name: /Pay ₹500 to confirm/ })).toBeVisible();
  await page.evaluate(() => ((window as unknown as { __rzpModes: string[] }).__rzpModes = ["success"]));
  await page.getByRole("button", { name: "Pay now" }).click();
  await expect(page.getByTestId("order-status")).toHaveText("Confirmed", { timeout: 20_000 });
});

test("orders: a confirmed order can be cancelled", async ({ page, request }) => {
  await toCheckout(page);
  await page.getByRole("radio", { name: /Cash on delivery/ }).check();
  await page.getByRole("button", { name: "Place order" }).first().click();
  await expect(page).toHaveURL(/\/orders\/o1/);
  await page.goto("/orders");
  await expect(page.getByTestId("order-row")).toContainText("FX-1001");
  await page.getByTestId("order-row").click();
  await page.getByRole("button", { name: "Cancel order" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel this order?" });
  await dialog.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.getByTestId("order-status")).toHaveText("Cancelled");
  await expect(page.getByRole("button", { name: "Cancel order" })).toBeHidden();
  expect((await state(request)).orders[0]).toMatchObject({ status: "cancelled" });
});

test("address: the form needs a pincode we deliver to, and the new address can be chosen at checkout", async ({ page }) => {
  await toCheckout(page);
  await page.getByRole("button", { name: "Add a new address" }).click();
  const form = page.getByRole("form", { name: "Add an address" });
  await form.getByLabel("Full name").fill("Ravi Kumar");
  await form.getByLabel("Mobile number").fill("9123456780");
  await form.getByLabel("House no., building, street").fill("4 Market Lane");
  await form.getByLabel("Pincode").fill("999999");
  await expect(form.getByText(/don't recognise the pincode 999999/)).toBeVisible();
  await form.getByLabel("Pincode").fill("801103");
  await expect(form.getByText("We deliver to 801103.")).toBeVisible();
  await expect(form.getByRole("radio", { name: /Bihta/ })).toBeChecked();
  await form.getByRole("button", { name: "Save and deliver here" }).click();
  await expect(page.getByRole("radio", { name: /Ravi Kumar/ })).toBeChecked();
});

test("sign-in takes the OTP length from the backend", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill("9876543210");
  await expect(page.getByLabel("Mobile number")).toHaveValue(/9876543210/);
});
