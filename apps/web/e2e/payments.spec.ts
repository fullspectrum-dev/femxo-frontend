import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { mockApi } from "./mock-api";

/*
 * The Payments screens against a fake /payments API: the list and its summary, the payment drawer, and the
 * refund form (a partial refund under the threshold and one that needs an approver).
 */

const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const PAYMENT = {
  id: "64b000000000000000000001",
  reference: "order:64b0000000000000000000aa",
  purpose: "order",
  orderId: "64b0000000000000000000aa",
  amountPaise: 150_000,
  currency: "INR",
  status: "captured",
  providerOrderId: "order_Pq1",
  providerPaymentId: "pay_Pq1",
  capturedAt: "2026-11-02T10:00:00.000Z",
  createdAt: "2026-11-02T09:55:00.000Z",
  customerId: "64b0000000000000000000cc",
  flags: ["duplicate_payment"],
  capturedPaise: 150_000,
  refundedPaise: 0,
  refundReservedPaise: 0,
  mismatch: null,
  failureReason: null,
  method: "upi",
};
const FAILED = { ...PAYMENT, id: "64b000000000000000000002", reference: "prime:c:k", purpose: "membership", orderId: null, status: "failed", capturedAt: null, capturedPaise: 0, flags: [], failureReason: "Card declined", providerPaymentId: null };

async function mockPayments(page: Page) {
  const refunds: unknown[] = [];
  await page.route(
    (url) => /^\/(payments|approvals)(\/|$)/.test(url.pathname),
    async (route) => {
      const { pathname, searchParams } = new URL(route.request().url());
      const method = route.request().method();
      if (pathname === "/payments" && method === "GET") {
        return json(route, 200, { items: searchParams.get("flagged") ? [PAYMENT] : [PAYMENT, FAILED], nextCursor: null });
      }
      if (pathname === `/payments/${PAYMENT.id}` && method === "GET") return json(route, 200, { payment: PAYMENT, refunds: [] });
      if (pathname === `/payments/${PAYMENT.id}/refunds` && method === "POST") {
        refunds.push(route.request().postDataJSON());
        return json(route, 201, {
          refund: { id: "64b0000000000000000000f1", paymentId: PAYMENT.id, amountPaise: 25_000, reason: "Damaged", status: "processed", approvalId: null, providerRefundId: "rfnd_1", source: "staff", failureReason: null, createdAt: "2026-11-03T10:00:00.000Z" },
          replayed: false,
        });
      }
      if (pathname === "/payments/reconciliation/latest") {
        return json(route, 200, {
          run: {
            at: "2026-11-03T20:00:00.000Z",
            from: "2026-11-01T20:00:00.000Z",
            to: "2026-11-03T20:00:00.000Z",
            providerChecked: 12,
            localChecked: 12,
            healed: 1,
            expired: 0,
            replayed: 0,
            mismatches: [{ kind: "local_captured_not_at_provider", paymentId: PAYMENT.id, detail: "We show it paid" }],
          },
        });
      }
      if (pathname === "/payments/refunds") return json(route, 200, { items: [], nextCursor: null });
      return json(route, 404, { error: { code: "NOT_FOUND", message: "Not found." } });
    }
  );
  return refunds;
}

const who = { roles: ["Admin"], permissions: ["dashboard.view", "payment.view", "payment.refund", "payment.reconcile"] };

test.describe("Payments", () => {
  test("the menu offers Payments, the list shows rows and the flagged filter narrows it", async ({ page }) => {
    await mockApi(page, who, { signedIn: true });
    await mockPayments(page);
    await page.goto("/panel/admin/payments");
    await expect(page.getByRole("heading", { name: "Payments", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: /modules/ }).first().getByRole("link", { name: "Payments" })).toBeVisible();
    await expect(page.getByText("prime:c:k").first()).toBeVisible();
    await page.getByLabel("Flagged only").check();
    await expect(page.getByText("prime:c:k")).toHaveCount(0);
  });

  test("the payment drawer explains a flag and a partial refund goes straight to the gateway", async ({ page }) => {
    await mockApi(page, who, { signedIn: true });
    const refunds = await mockPayments(page);
    await page.goto("/panel/admin/payments");
    await page.getByLabel("Flagged only").check();
    await page.getByRole("button", { name: /View/ }).first().click();
    await expect(page.getByText("The customer paid twice")).toBeVisible();
    await expect(page.getByText("pay_Pq1").first()).toBeVisible();
    await page.getByRole("button", { name: "Refund", exact: true }).click();
    await page.getByRole("radio", { name: "Partial" }).click();
    await page.getByLabel("Amount to refund (₹)").fill("250");
    await page.getByLabel("Reason").fill("Damaged");
    await expect(page.getByText("Under ₹5,000 it is sent to Razorpay straight away.")).toBeVisible();
    await page.getByRole("button", { name: "Refund now" }).click();
    await expect.poll(() => refunds.length).toBe(1);
    expect(refunds[0]).toMatchObject({ amountPaise: 25_000, reason: "Damaged" });
    expect((refunds[0] as { idempotencyKey: string }).idempotencyKey).toMatch(/^adm-/);
    expect(refunds[0]).not.toHaveProperty("assignedTo");
  });

  test("a refund of Rs 5,000 or more asks for an approver", async ({ page }) => {
    await mockApi(page, who, { signedIn: true });
    await mockPayments(page);
    await page.goto("/panel/admin/payments");
    await page.getByLabel("Flagged only").check();
    await page.getByRole("button", { name: /View/ }).first().click();
    await page.getByRole("button", { name: "Refund", exact: true }).click();
    await page.getByLabel("Reason").fill("Order never arrived");
    await page.getByRole("radio", { name: "Partial" }).click();
    await page.getByLabel("Amount to refund (₹)").fill("6000");
    await expect(page.getByLabel("Who approves this refund?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send for approval" })).toBeDisabled();
  });

  test("without payment.refund there is no Refund button", async ({ page }) => {
    await mockApi(page, { roles: ["Admin"], permissions: ["dashboard.view", "payment.view"] }, { signedIn: true });
    await mockPayments(page);
    await page.goto("/panel/admin/payments");
    await page.getByLabel("Flagged only").check();
    await page.getByRole("button", { name: /View/ }).first().click();
    await expect(page.getByText("Refunding needs the payment.refund permission.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Refund", exact: true })).toHaveCount(0);
  });

  test("reconciliation shows the latest report and Run now is offered with payment.reconcile", async ({ page }) => {
    await mockApi(page, who, { signedIn: true });
    await mockPayments(page);
    await page.goto("/panel/admin/payments");
    await page.getByRole("tab", { name: "Reconciliation" }).click();
    await expect(page.getByText("Paid here, not at gateway")).toBeVisible();
    await expect(page.getByRole("button", { name: "Run now" })).toBeVisible();
  });

  test("someone without any payment permission has no Payments in the menu", async ({ page }) => {
    await mockApi(page, { roles: ["Admin"], permissions: ["dashboard.view", "order.view"] }, { signedIn: true });
    await page.goto("/panel/admin/dashboard");
    await expect(page.getByRole("navigation", { name: /modules/ }).first().getByRole("link", { name: "Orders & Delivery" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: /modules/ }).first().getByRole("link", { name: "Payments" })).toHaveCount(0);
  });
});
