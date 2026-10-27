import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Each test walks several pages, and the dev server compiles a page the first time it is visited.
test.setTimeout(120_000);

const PRODUCT = "/p/magadh-mills-chakki-fresh-atta";
const KIRAN = "9000000005";

async function otpSignIn(page: Page, mobile = KIRAN) {
  await page.getByLabel("Mobile number").fill(mobile);
  await page.getByRole("button", { name: "Get OTP" }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  await page.keyboard.type("123456");
  await page.getByRole("button", { name: "Verify and continue" }).click();
}

async function addToCart(page: Page, quantity = 1) {
  await page.goto(PRODUCT);
  for (let i = 1; i < quantity; i++) await page.getByRole("button", { name: /^Increase quantity/ }).click();
  await page.getByRole("button", { name: /^Add to cart/ }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();
}

async function demo(page: Page, action: (panel: ReturnType<Page["getByRole"]>) => Promise<void>) {
  await page.getByRole("button", { name: "Demo controls" }).click();
  const panel = page.getByRole("dialog", { name: "Demo controls" });
  await action(panel);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
}

/** Signs in, adds to the cart, and walks to the payment step of checkout. */
async function toPaymentStep(page: Page, quantity = 1) {
  await page.goto("/login?next=/cart");
  await otpSignIn(page);
  // (The login address itself ends in /cart, so wait for the path, not the text.)
  await page.waitForURL((url) => url.pathname === "/cart");
  await addToCart(page, quantity);
  await page.goto("/checkout");
  await page.getByRole("button", { name: "Deliver to this address" }).click();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByRole("heading", { name: "How would you like to pay?" })).toBeVisible();
}

const paySheet = (page: Page) => page.getByRole("dialog", { name: "Pay for your order" });

test("guest browses, signs in, adds to cart, applies a coupon, pays, and follows the order", async ({ page }) => {
  // Browse as a guest and fill the cart.
  await page.goto("/c/atta-flours");
  await page.getByRole("main").getByRole("article").first().getByRole("link").click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^Increase quantity/ }).click();
  await page.getByRole("button", { name: /^Add to cart/ }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();

  await page.goto("/cart");
  const coupon = page.getByRole("region", { name: "Coupon" });
  await coupon.getByLabel("Coupon code").fill("FLAT50");
  await coupon.getByRole("button", { name: "Apply" }).click();
  await expect(coupon.getByText(/FLAT50 applied/)).toBeVisible();

  // Checkout needs an account: sign in, and come back to it.
  await page.getByRole("link", { name: "Proceed to checkout" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout$/);
  await otpSignIn(page);
  await expect(page).toHaveURL(/\/checkout$/);

  await page.getByRole("button", { name: "Deliver to this address" }).click();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByRole("region", { name: "Price details" })).toContainText("Coupon (FLAT50)");
  await page.getByRole("button", { name: /^Place order and pay/ }).click();
  await paySheet(page).getByRole("button", { name: /^Pay ₹/ }).click();

  // The order, thanked and confirmed.
  await expect(page).toHaveURL(/\/orders\/ord-[0-9a-f]+\?placed=1$/);
  await expect(page.getByText(/Thank you! Your order FX-\d+ is placed/)).toBeVisible();
  const tracking = page.getByRole("list", { name: "Order tracking" });
  await expect(tracking).toContainText("Confirmed");
  await expect(page.getByRole("link", { name: "Cart, 0 items" })).toBeVisible();

  // Time passes (the demo clock): it ships, then is delivered.
  await demo(page, (panel) => panel.getByRole("button", { name: "Fast-forward 1 day" }).click());
  await page.reload();
  await expect(page.getByRole("list", { name: "Order tracking" })).toContainText("Shipped");
  await demo(page, (panel) => panel.getByRole("button", { name: "Fast-forward 7 days" }).click());
  await page.reload();
  await expect(page.getByRole("list", { name: "Order tracking" })).toContainText("Delivered");
  // Groceries can't be returned, so there is no return button; a delivered order can no longer be cancelled either.
  await expect(page.getByRole("button", { name: "Cancel order" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Return items" })).toBeHidden();

  // And it is in the order history.
  await page.getByRole("link", { name: "← All orders" }).click();
  await expect(page.getByRole("link", { name: /Order FX-\d+/ }).first()).toContainText("Delivered");
});

test("a failed payment is retried on the same order and then succeeds", async ({ page }) => {
  await toPaymentStep(page);
  await demo(page, async (panel) => {
    await panel.getByLabel("Next payment").selectOption("failure");
  });
  await page.getByRole("button", { name: /^Place order and pay/ }).click();
  await paySheet(page).getByRole("button", { name: /^Pay ₹/ }).click();
  await expect(paySheet(page).getByRole("alert")).toContainText(/payment failed/i);

  await paySheet(page).getByRole("button", { name: "Try again" }).click();
  await expect(paySheet(page)).toContainText("Attempt 2");
  await paySheet(page).getByRole("button", { name: /^Pay ₹/ }).click();
  await expect(page).toHaveURL(/\/orders\/ord-[0-9a-f]+\?placed=1$/);
  await expect(page.getByRole("list", { name: "Order tracking" })).toContainText("Confirmed");
});

test("closing the payment sheet leaves the order to pay later, from the order page", async ({ page }) => {
  await toPaymentStep(page);
  await page.getByRole("button", { name: /^Place order and pay/ }).click();
  await paySheet(page).getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/orders\/ord-[0-9a-f]+$/);
  await page.getByRole("button", { name: "Pay now" }).click();
  await paySheet(page).getByRole("button", { name: /^Pay ₹/ }).click();
  await expect(page.getByText("Payment received")).toBeVisible();
  await expect(page.getByRole("list", { name: "Order tracking" })).toContainText("Confirmed");
});

test("an item that runs short at the last moment is refused with what is left (409), and the cart can be fixed", async ({ page }) => {
  await toPaymentStep(page, 3);
  await demo(page, (panel) => panel.getByRole("button", { name: "Make cart items run short" }).click());
  await page.getByRole("button", { name: /^Place order and pay/ }).click();
  const alert = page.getByRole("alert").filter({ hasText: "no longer available in that quantity" });
  await expect(alert).toContainText("only 2 left");
  await expect(paySheet(page)).toBeHidden();
  await alert.getByRole("link", { name: "Update your cart" }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByText(/Only 2 left/)).toBeVisible();
});

test("pressing the button twice places one order, and the cart is emptied", async ({ page }) => {
  await toPaymentStep(page);
  await page.getByRole("button", { name: /^Place order and pay/ }).dblclick();
  await expect(paySheet(page)).toBeVisible();
  await paySheet(page).getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/orders\/ord-[0-9a-f]+$/);
  await expect(page.getByRole("link", { name: "Cart, 0 items" })).toBeVisible();
  await page.getByRole("link", { name: "← All orders" }).click();
  // The newest order is the one just placed, waiting for payment. (How many requests the double press sends is covered by the unit tests.)
  await expect(page.getByRole("link", { name: /Order FX-\d+/ }).first()).toContainText("Payment pending");
});

test("cash on delivery places the order at once", async ({ page }) => {
  await toPaymentStep(page);
  await page.getByRole("radio", { name: "Cash on delivery" }).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/orders\/ord-[0-9a-f]+\?placed=1$/);
  await expect(page.getByText("Pay on delivery")).toBeVisible();
  await expect(page.getByRole("list", { name: "Order tracking" })).toContainText("Confirmed");
});

test("an order can be cancelled before it is packed", async ({ page }) => {
  await toPaymentStep(page);
  await page.getByRole("radio", { name: "Cash on delivery" }).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/orders\/ord-/);
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("dialog", { name: "Cancel this order?" }).getByRole("button", { name: "Cancel order" }).click();
  await expect(page.getByText("Order cancelled")).toBeVisible();
  await expect(page.getByRole("list", { name: "Order tracking" })).toContainText("Cancelled");
});

test("the checkout and order pages fit the screen and have no serious accessibility issues", async ({ page }) => {
  await toPaymentStep(page);
  const check = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  };
  await check();
  await page.getByRole("radio", { name: "Cash on delivery" }).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByRole("list", { name: "Order tracking" })).toBeVisible();
  await check();
  await page.goto("/orders");
  await expect(page.getByRole("link", { name: /Order FX-\d+/ }).first()).toBeVisible();
  await check();
});
