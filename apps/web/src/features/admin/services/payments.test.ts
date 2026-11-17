import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { method: string; path: string; body?: unknown; headers?: Record<string, string> }[] = [];
const reply = vi.fn<(path: string, query?: unknown) => unknown>();

vi.mock("@/lib/api", () => ({
  idempotencyKey: () => "adm-test-key-0001",
  api: {
    get: async (path: string, query?: unknown) => {
      calls.push({ method: "GET", path, body: query });
      return reply(path, query);
    },
    post: async (path: string, body?: unknown, headers?: Record<string, string>) => {
      calls.push({ method: "POST", path, body, headers });
      return reply(path, body);
    },
    patch: async (path: string, body: unknown) => {
      calls.push({ method: "PATCH", path, body });
      return reply(path, body);
    },
    delete: async (path: string) => {
      calls.push({ method: "DELETE", path });
      return reply(path);
    },
  },
}));
vi.mock("@/features/auth", () => ({ authApi: { me: async () => ({ id: "me000000000000000000000" }), access: async () => null } }));
// The extras are React screens; the services only need their names.
vi.mock("../modules/extras/PaymentExtras", () => ({ PaymentDetail: () => null, PaymentSummaryBanner: () => null, RefundDetail: () => null }));
vi.mock("../modules/extras/OrderExtras", () => ({ OrderPaymentInfo: () => null }));

import { AuthApiError } from "@/features/auth/services/auth-client";
import { describeError, ERROR_MESSAGES } from "../data/error-messages";
import { allowed } from "../modules/allowed";
import { approversFor } from "./approvers";
import { executeRefund, latestReconciliation, paymentsInPeriod, requestRefund, runReconciliation } from "./payments.api";
import {
  flagLabel,
  inDays,
  interpretSearch,
  isRefundable,
  istDay,
  matchesPayment,
  needsAttention,
  needsRefundApproval,
  paymentRow,
  paymentTimeline,
  reconciliationKind,
  refundRow,
  refundableLeft,
  rupeesToPaise,
  summarize,
} from "./payments.mappers";
import type { ApiPayment, ApiRefund } from "./payments.mappers";
import { paymentsService, refundsService } from "./payments.service";
import { payoutQuery } from "./finance.service";
import { customersService, ordersService, orderRow, orderTimeline, paymentText } from "./sales.service";
import { reviewRow, reviewsService, stars } from "./reviews.service";
import { roleText, territoryText, toRow as userRow, usersService } from "./users.service";
import { walletsService } from "./finance.service";
import { subscriptionsService } from "./membership.service";
import { invoicesService } from "./sales.service";

const payment = (extra: Partial<ApiPayment> = {}): ApiPayment => ({
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
  flags: [],
  capturedPaise: 150_000,
  refundedPaise: 0,
  refundReservedPaise: 0,
  mismatch: null,
  failureReason: null,
  method: "upi",
  ...extra,
});

const refund = (extra: Partial<ApiRefund> = {}): ApiRefund => ({
  id: "64b0000000000000000000f1",
  paymentId: "64b000000000000000000001",
  amountPaise: 50_000,
  reason: "Damaged",
  status: "approved",
  approvalId: null,
  providerRefundId: null,
  source: "staff",
  failureReason: null,
  createdAt: "2026-11-03T10:00:00.000Z",
  ...extra,
});

beforeEach(() => {
  calls.length = 0;
  reply.mockReset();
});

describe("payment amounts", () => {
  it("parses rupees into paise and refuses anything else", () => {
    expect(rupeesToPaise("250")).toBe(25_000);
    expect(rupeesToPaise("1,250.50")).toBe(125_050);
    expect(rupeesToPaise(" 99.5 ")).toBe(9_950);
    for (const bad of ["", "abc", "12.345", "-5", "1e3", "₹5"]) expect(rupeesToPaise(bad)).toBeNull();
  });

  it("refund approval starts at Rs 5,000", () => {
    expect(needsRefundApproval(499_999)).toBe(false);
    expect(needsRefundApproval(500_000)).toBe(true);
  });

  it("what is left to refund counts every refund asked for, not just the done ones", () => {
    const p = payment({ capturedPaise: 100_000, refundedPaise: 20_000, refundReservedPaise: 60_000 });
    expect(refundableLeft(p)).toBe(40_000);
    expect(isRefundable(p)).toBe(true);
    expect(isRefundable(payment({ refundReservedPaise: 150_000 }))).toBe(false);
    expect(isRefundable(payment({ status: "failed", capturedPaise: 0 }))).toBe(false);
    expect(isRefundable(payment({ status: "refunded", refundReservedPaise: 150_000 }))).toBe(false);
  });
});

describe("payment rows and wording", () => {
  it("maps a payment to a row with plain labels", () => {
    const row = paymentRow(payment({ flags: ["duplicate_payment", "amount_mismatch"], method: "netbanking" }));
    expect(row).toMatchObject({ purpose: "Order", amount: 150_000, method: "Net banking", flagText: "Duplicate payment, Amount mismatch", status: "captured" });
    expect(paymentRow(payment({ purpose: "membership", orderId: null })).purpose).toBe("Prime plan");
    expect(paymentRow(payment()).flagText).toBeNull();
  });

  it("names flags and falls back for new ones", () => {
    expect(flagLabel("paid_after_expiry")).toBe("Paid after expiry");
    expect(flagLabel("some_new_flag")).toBe("Some new flag");
  });

  it("maps a refund to a row", () => {
    expect(refundRow(refund({ source: "provider" }))).toMatchObject({ code: "RF-0000F1", amount: 50_000, source: "Razorpay dashboard", status: "approved" });
  });

  it("describes reconciliation findings and counts the ones that need a person", () => {
    expect(reconciliationKind("local_captured_not_at_provider")).toMatchObject({ tone: "error" });
    expect(reconciliationKind("brand_new")).toMatchObject({ label: "Brand new", tone: "warning" });
    const run = { at: "", from: "", to: "", providerChecked: 3, localChecked: 3, healed: 1, expired: 0, replayed: 0, mismatches: [{ kind: "missed_capture_healed", detail: "" }, { kind: "missing_local", detail: "" }] };
    expect(needsAttention(run)).toBe(1);
    expect(needsAttention(null)).toBe(0);
  });
});

describe("timeline", () => {
  const states = (p: ApiPayment) => paymentTimeline(p).map((s) => s.state);
  it("walks created, authorized, captured, refunded", () => {
    expect(states(payment({ status: "created", capturedAt: null }))).toEqual(["done", "current", "upcoming", "upcoming"]);
    expect(states(payment({ status: "authorized", capturedAt: null }))).toEqual(["done", "done", "current", "upcoming"]);
    expect(states(payment())).toEqual(["done", "done", "done", "current"]);
    expect(states(payment({ status: "refunded", refundedPaise: 150_000, refundReservedPaise: 150_000 }))).toEqual(["done", "done", "done", "done"]);
  });

  it("stops where a failed or expired payment stopped, with the reason", () => {
    const failed = paymentTimeline(payment({ status: "failed", capturedAt: null, capturedPaise: 0, failureReason: "Card declined" }));
    expect(failed[1]).toMatchObject({ state: "failed", meta: "Failed: Card declined" });
    expect(states(payment({ status: "expired", capturedAt: null }))).toEqual(["done", "failed", "upcoming", "upcoming"]);
  });

  it("says how much of a partial refund is done", () => {
    const steps = paymentTimeline(payment({ status: "partially_refunded", refundedPaise: 50_000, refundReservedPaise: 50_000 }));
    expect(steps[3]?.meta).toContain("₹500 of ₹1,500");
  });
});

describe("search, days and amounts", () => {
  it("reads what the person typed", () => {
    expect(interpretSearch("")).toEqual({});
    expect(interpretSearch("64B0000000000000000000CC")).toEqual({ customerId: "64b0000000000000000000cc" });
    expect(interpretSearch("order:64b0000000000000000000aa")).toEqual({ reference: "order:64b0000000000000000000aa" });
    expect(interpretSearch(" Pay_AbC ")).toEqual({ needle: "pay_abc" });
  });

  it("uses India-time days (a payment just after 18:30 UTC belongs to the next day)", () => {
    expect(istDay("2026-11-02T18:29:00.000Z")).toBe("2026-11-02");
    expect(istDay("2026-11-02T18:31:00.000Z")).toBe("2026-11-03");
    expect(inDays("2026-11-02T18:31:00.000Z", "2026-11-03", "2026-11-03")).toBe(true);
    expect(inDays("2026-11-02T18:31:00.000Z", undefined, "2026-11-02")).toBe(false);
  });

  it("matches on text, days and amount together", () => {
    const p = payment();
    expect(matchesPayment(p, { needle: "pay_pq1" })).toBe(true);
    expect(matchesPayment(p, { needle: "nope" })).toBe(false);
    expect(matchesPayment(p, { minPaise: 150_000, maxPaise: 150_000 })).toBe(true);
    expect(matchesPayment(p, { minPaise: 150_001 })).toBe(false);
    expect(matchesPayment(p, { from: "2026-11-03" })).toBe(false);
  });
});

describe("summary cards", () => {
  it("adds up captured, failed, refunded and flagged", () => {
    const s = summarize([
      payment(),
      payment({ id: "2", amountPaise: 20_000, status: "failed", capturedPaise: 0, capturedAt: null }),
      payment({ id: "3", status: "partially_refunded", refundedPaise: 30_000, refundReservedPaise: 30_000 }),
      payment({ id: "4", status: "captured", flags: ["duplicate_payment"], amountPaise: 70_000, capturedPaise: 70_000 }),
    ]);
    expect(s).toMatchObject({ total: 4, capturedPaise: 150_000 + 150_000 + 70_000, capturedCount: 3, failedPaise: 20_000, failedCount: 1, refundedPaise: 30_000, refundedCount: 1, flaggedPaise: 70_000, flaggedCount: 1 });
  });

  it("is zero for no payments", () => {
    expect(summarize([])).toMatchObject({ total: 0, capturedPaise: 0, flaggedCount: 0 });
  });
});

describe("payments list", () => {
  const page = (items: ApiPayment[], nextCursor: string | null = null) => ({ items, nextCursor });

  it("passes the API's own filters straight through (one call)", async () => {
    reply.mockReturnValue(page([payment()], "next"));
    const res = await paymentsService.list({ status: "captured", flags: ["flagged"], cursor: "c1", limit: 20 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ path: "/payments", body: { status: "captured", flagged: "true", cursor: "c1", limit: 20 } });
    expect(res.nextCursor).toBe("next");
    expect(res.items[0]).toMatchObject({ amount: 150_000 });
  });

  it("sends a customer ID or a reference to the API and keeps other text for the page", async () => {
    reply.mockReturnValue(page([]));
    await paymentsService.list({ q: "64b0000000000000000000cc", limit: 20 });
    expect(calls[0]?.body).toMatchObject({ customerId: "64b0000000000000000000cc" });
    await paymentsService.list({ q: "order:64b0000000000000000000aa", limit: 20 });
    expect(calls[1]?.body).toMatchObject({ reference: "order:64b0000000000000000000aa" });
  });

  it("narrows by amount on pages of 100 and keeps going until it has enough", async () => {
    reply
      .mockReturnValueOnce(page([payment({ id: "a", amountPaise: 1_000 })], "p2"))
      .mockReturnValueOnce(page([payment({ id: "b", amountPaise: 90_000 }), payment({ id: "c", amountPaise: 95_000 })], null));
    const res = await paymentsService.list({ minPaise: 50_000, limit: 2 });
    expect(calls.map((c) => (c.body as { limit: number }).limit)).toEqual([100, 100]);
    expect(res.items.map((r) => r.id)).toEqual(["b", "c"]);
    expect(res.nextCursor).toBeNull();
  });

  it("stops at the first day: older rows cannot match", async () => {
    reply.mockReturnValueOnce(page([payment({ id: "new", createdAt: "2026-11-05T05:00:00.000Z" }), payment({ id: "old", createdAt: "2026-10-01T05:00:00.000Z" })], "more"));
    const res = await paymentsService.list({ from: "2026-11-01", limit: 20 });
    expect(calls).toHaveLength(1);
    expect(res.items.map((r) => r.id)).toEqual(["new"]);
    expect(res.nextCursor).toBeNull();
  });

  it("totals a period over as many pages as needed and says when it was cut short", async () => {
    reply.mockReturnValueOnce(page([payment({ id: "a" })], "p2")).mockReturnValueOnce(page([payment({ id: "b", createdAt: "2026-09-01T00:00:00.000Z" })], "p3"));
    const { payments, capped } = await paymentsInPeriod("2026-11-01", undefined);
    expect(payments.map((p) => p.id)).toEqual(["a"]);
    expect(capped).toBe(false);
    reply.mockReset();
    reply.mockReturnValue(page([payment()], "always-more"));
    expect((await paymentsInPeriod(undefined, undefined, 2)).capped).toBe(true);
  });
});

describe("refunds", () => {
  it("lists refunds with the API's status filter", async () => {
    reply.mockReturnValue({ items: [refund()], nextCursor: null });
    const res = await refundsService.list({ status: "approved", limit: 20 });
    expect(calls[0]).toMatchObject({ path: "/payments/refunds", body: { status: "approved", limit: 20 } });
    expect(res.items[0]).toMatchObject({ code: "RF-0000F1" });
  });

  it("requests a refund with the idempotency key and the approver in the body", async () => {
    reply.mockReturnValue({ refund: refund({ status: "awaiting_approval" }), replayed: false });
    const out = await requestRefund("64b000000000000000000001", { amountPaise: 600_000, reason: "  Damaged goods ", idempotencyKey: "adm-key-0000001", assignedTo: "u2" });
    expect(calls[0]).toMatchObject({ method: "POST", path: "/payments/64b000000000000000000001/refunds", body: { amountPaise: 600_000, reason: "Damaged goods", idempotencyKey: "adm-key-0000001", assignedTo: "u2" } });
    expect(out.refund.status).toBe("awaiting_approval");
    reply.mockReturnValue({ refund: refund(), replayed: false });
    await requestRefund("p", { amountPaise: 10_000, reason: "Wrong item", idempotencyKey: "adm-key-0000002" });
    expect(calls[1]?.body).not.toHaveProperty("assignedTo");
  });

  it("executes an approved refund and returns the refund as it now stands", async () => {
    reply.mockReturnValue({ refund: refund({ status: "processed" }) });
    expect((await executeRefund("r1")).status).toBe("processed");
    expect(calls[0]).toMatchObject({ method: "POST", path: "/payments/refunds/r1/execute" });
    const row = await refundsService.transition!({ id: "r1", status: "approved" }, "execute", "processed");
    expect(row.status).toBe("processed");
  });
});

describe("reconciliation", () => {
  it("reads the latest report (or none) and runs it now", async () => {
    reply.mockReturnValueOnce({ run: null });
    expect(await latestReconciliation()).toBeNull();
    reply.mockReturnValueOnce({ run: { at: "x", mismatches: [] } });
    expect((await runReconciliation()).at).toBe("x");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /payments/reconciliation/latest", "POST /payments/reconciliation/run"]);
  });
});

describe("approvers", () => {
  it("asks for the holders of approval.decide at the path and leaves the signed-in user out", async () => {
    reply.mockReturnValue({ items: [{ id: "me000000000000000000000", name: "Me", email: "me@x" }, { id: "u2", name: "Asha", email: "asha@x" }] });
    const list = await approversFor("dealer.application", ["state:10", "district:230"]);
    expect(calls[0]).toMatchObject({ path: "/approvals/approvers", body: { type: "dealer.application", territoryPath: "state:10,district:230" } });
    expect(list.map((a) => a.id)).toEqual(["u2"]);
  });

  it("makes no call without a place", async () => {
    expect(await approversFor("dealer.application", [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("error wording", () => {
  it("gives every new payment, refund and review code a sentence", () => {
    for (const code of ["REFUND_EXCEEDS_PAYMENT", "NOT_REFUNDABLE", "REFUND_REFUSED", "APPROVAL_PENDING", "REFUND_CLOSED", "PAYMENTS_NOT_CONFIGURED", "PAYMENT_PROVIDER_UNAVAILABLE", "REVIEW_CHANGED", "ORDER_NOT_CONFIRMED", "CUSTOMER_CHANGED", "APPROVER_NOT_ELIGIBLE"]) {
      const error = new AuthApiError(code as never, "generic", 422, undefined, "backend words");
      expect(ERROR_MESSAGES[code], code).toBeTruthy();
      expect(describeError(error)).toBe(ERROR_MESSAGES[code]);
    }
  });
});

describe("reviews", () => {
  const api = { id: "r1", productId: "p1", customerId: "c1", rating: 4, title: "", body: "Good oil, fast delivery to the village.", authorName: "Verified buyer", status: "pending" as const, moderatedBy: null, moderatedAt: null, moderationReason: null, createdAt: "2026-11-01T00:00:00.000Z" };

  it("shows stars and falls back to the start of the text for a missing title", () => {
    expect(stars(4)).toBe("★★★★☆ (4/5)");
    expect(reviewRow(api)).toMatchObject({ summary: "Good oil, fast delivery to the village.", rating: 4, status: "pending" });
    expect(reviewRow({ ...api, title: "Great" }).summary).toBe("Great");
  });

  it("opens on pending, filters by the chosen status and moderates with the decision", async () => {
    reply.mockReturnValue({ items: [api], nextCursor: null });
    await reviewsService.list({ limit: 10 });
    await reviewsService.list({ status: "rejected", limit: 10 });
    expect(calls.map((c) => (c.body as { status: string }).status)).toEqual(["pending", "rejected"]);
    reply.mockReturnValue({ review: { ...api, status: "rejected", moderationReason: "Spam" } });
    const row = await reviewsService.transition!({ id: "r1", status: "pending" }, "reject", "rejected", { reason: "Spam" });
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/reviews/r1/moderate", body: { decision: "reject", reason: "Spam" } });
    expect(row.status).toBe("rejected");
    reply.mockReturnValue({ review: { ...api, status: "published" } });
    await reviewsService.transition!({ id: "r1", status: "pending" }, "publish", "published");
    expect(calls.at(-1)?.body).toEqual({ decision: "publish" });
  });
});

describe("orders with the new states", () => {
  const order = { id: "o1", orderNumber: "ORD-7", placedAt: "2026-11-01T00:00:00.000Z", status: "pending_payment" as const, ownerDealerId: "DLR-1", ownerSubDealerId: null, territoryPath: ["district:1"], deliveryChargePaise: 0, itemCount: 2 };

  it("reads the payment text from method and status", () => {
    expect(paymentText({ paymentMethod: null, paymentStatus: "none" })).toBeNull();
    expect(paymentText({ paymentMethod: "cod", paymentStatus: "none" })).toBe("Cash on delivery");
    expect(paymentText({ paymentMethod: "online", paymentStatus: "captured" })).toBe("Online · Paid");
    expect(paymentText({ paymentMethod: "online", paymentStatus: "failed" })).toBe("Online · Payment failed");
  });

  it("keeps the new fields on the row", () => {
    const row = orderRow({ ...order, source: "store", paymentMethod: "online", paymentStatus: "pending", totalPaise: 99_950, approvalId: "a1" }, new Map());
    expect(row).toMatchObject({ source: "Customer app", total: 99_950, payment: "Online · Awaiting payment", approvalId: "a1", status: "pending_payment" });
  });

  it("offers every status in the filter and shows where an unconfirmed order waits", () => {
    expect(ordersService.viewPatch?.statuses).toEqual(["pending_approval", "pending_payment", "payment_failed", "placed", "completed", "cancelled"]);
    const base = { id: "o1", cancelReason: null, expiresAt: null, approvalId: null };
    const approval = orderTimeline({ ...base, status: "pending_approval" });
    expect(approval.map((s) => s.label)).toEqual(["Placed", "Discount approved", "Delivered"]);
    expect(approval[1]).toMatchObject({ state: "current" });
    expect(orderTimeline({ ...base, status: "payment_failed" })[1]).toMatchObject({ state: "failed" });
    expect(orderTimeline({ ...base, status: "cancelled", cancelReason: "Rejected: price too low" })[1]?.meta).toBe("Cancelled: Rejected: price too low");
    expect(orderTimeline({ ...base, status: "completed" }).map((s) => s.state)).toEqual(["done", "done"]);
  });

  it("only offers cancel on a placed order (the others resolve by approval or payment)", () => {
    expect(ordersService.viewPatch?.actions?.map((a) => [a.key, a.from])).toEqual([["cancel", ["placed"]]]);
  });
});

describe("customers: block and unblock", () => {
  it("send the revision that was read, and move to the one the API answers with", async () => {
    reply.mockReturnValue({ customer: { id: "c1", phone: "98•••", name: "Asha", territoryPath: ["district:1"], status: "blocked", prime: { status: "none", until: null }, createdAt: "2026-11-01T00:00:00.000Z", rev: 4 } });
    const row = await customersService.transition!({ id: "c1", status: "active", rev: 3 }, "block", "blocked");
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ path: "/customers/c1", body: { rev: 3, status: "blocked" } });
    expect(row).toMatchObject({ status: "blocked", rev: 4 });
    reply.mockReturnValue({ customer: { id: "c1", phone: "98•••", name: "Asha", territoryPath: ["district:1"], status: "active", prime: { status: "none", until: null }, createdAt: "2026-11-01T00:00:00.000Z", rev: 5 } });
    await customersService.transition!(row, "unblock", "active");
    expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ rev: 4, status: "active" });
  });

  it("offers block and unblock to people with customer.manage only", () => {
    const actions = customersService.viewPatch?.actions ?? [];
    expect(actions.map((a) => a.key)).toEqual(["block", "unblock"]);
    expect(actions.every((a) => allowed({ isSuperAdmin: false, permissions: ["customer.manage"], roles: [], territoryIds: [], locationIds: [] }, a))).toBe(true);
    expect(actions.some((a) => allowed({ isSuperAdmin: false, permissions: ["customer.view"], roles: [], territoryIds: [], locationIds: [] }, a))).toBe(false);
  });
});

describe("Super-Admin-only and permission-gated actions", () => {
  const user = (over: object) => ({ isSuperAdmin: false, permissions: [], roles: [], territoryIds: [], locationIds: [], ...over });
  it("hides Super-Admin-only buttons from everyone else, even with every permission", () => {
    const action = { superAdminOnly: true };
    expect(allowed(user({ isSuperAdmin: true }), action)).toBe(true);
    expect(allowed(user({ permissions: ["dealer.manage"] }), action)).toBe(false);
    expect(allowed(null, action)).toBe(false);
  });

  it("gates a permission and lets a Super Admin through (their list is empty by design)", () => {
    const action = { requires: "payment.refund" };
    expect(allowed(user({ permissions: ["payment.refund"] }), action)).toBe(true);
    expect(allowed(user({ permissions: ["payment.view"] }), action)).toBe(false);
    expect(allowed(user({ isSuperAdmin: true }), action)).toBe(true);
    expect(allowed(null, {})).toBe(true);
  });
});

describe("lists that use the new API filters", () => {
  const empty = { items: [], nextCursor: null };

  it("payouts send owner type, the start of the owner ID and the days", async () => {
    expect(payoutQuery({ flags: ["dealer"], q: " DLR-1 ", from: "2026-11-01", to: "2026-11-05", status: "" })).toEqual({ status: undefined, ownerType: "dealer", q: "DLR-1", from: "2026-11-01", to: "2026-11-05" });
    expect(payoutQuery({ flags: ["dealer", "sub_dealer"] }).ownerType).toBeUndefined();
    expect(payoutQuery({ flags: [] }).ownerType).toBeUndefined();
  });

  it("invoices send the start of the number and the days", async () => {
    reply.mockReturnValue(empty);
    await invoicesService.list({ q: "INV-2", status: "failed", from: "2026-11-01", to: "2026-11-30", limit: 20 });
    expect(calls[0]).toMatchObject({ path: "/billing/invoices", body: { einvoice: "failed", q: "INV-2", from: "2026-11-01", to: "2026-11-30" } });
  });

  it("subscriptions filter by status on the server", async () => {
    reply.mockReturnValue(empty);
    await subscriptionsService.list({ q: "UPI-9", status: "active", from: "2026-11-01", limit: 20 });
    expect(calls[0]).toMatchObject({ path: "/membership/subscriptions", body: { status: "active", q: "UPI-9", from: "2026-11-01" } });
  });
});

describe("wallets", () => {
  it("read their balances from the list: one call, no call per wallet", async () => {
    reply.mockReturnValue({ items: [{ id: "w1", ownerType: "dealer", ownerId: "DLR-1", balances: { spendable: 10_000, held: 500, pending: 0 } }, { id: "w2", ownerType: "sub_dealer", ownerId: "SDL-1" }], nextCursor: null });
    const res = await walletsService.list({ limit: 20 });
    expect(calls).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ balance: 10_000, held: 500, pending: 0 });
    expect(res.items[1]).toMatchObject({ balance: null });
  });
});

describe("users", () => {
  const user = { id: "u1", email: "a@x", name: "Asha", isSuperAdmin: false, status: "active" as const, mustChangePassword: false, createdAt: "2026-01-01T00:00:00.000Z" };
  it("shows roles, territories and last login from the list", () => {
    const row = userRow({ ...user, roles: [{ id: "r1", name: "Dealer" }, { id: "r2", name: "Finance" }], territoryIds: ["district:230", "district:231"], lastLoginAt: "2026-11-10T04:00:00.000Z" }, new Map([["district:230", "Patna"]]));
    expect(row).toMatchObject({ role: "Dealer, Finance", scope: "Patna +1", lastLogin: "2026-11-10T04:00:00.000Z" });
  });

  it("falls back to dashes for an older API and counts what it cannot name", () => {
    expect(userRow(user)).toMatchObject({ role: "—", scope: "—", lastLogin: null });
    expect(territoryText(["a:1", "b:2"])).toBe("2 territories");
    expect(territoryText(["a:1"])).toBe("1 territory");
    expect(roleText({ isSuperAdmin: true })).toBe("Super Admin");
    expect(userRow({ ...user, isSuperAdmin: true }).scope).toBe("All territories");
  });

  it("names the first territory of each user with one lookup per place", async () => {
    reply.mockImplementation((path) => (path === "/users" ? { items: [{ ...user, territoryIds: ["district:230"] }, { ...user, id: "u2", territoryIds: ["district:230"] }], nextCursor: null } : { territory: { name: "Patna" } }));
    const res = await usersService.list({ limit: 20 });
    expect(res.items.map((r) => r.scope)).toEqual(["Patna", "Patna"]);
    expect(calls.filter((c) => c.path.startsWith("/territories"))).toHaveLength(1);
  });
});
