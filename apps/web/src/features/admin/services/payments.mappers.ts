import type { TimelineStep } from "@/components/admin-ui";
import type { RecordRow } from "../data/records";
import { formatDateTime, formatINR } from "../format";
import { stepsOf } from "./shared";

/*
 * Pure helpers for the payments screens (no network): how the API's payments and refunds become
 * rows, how a list is narrowed by search, day and amount, what the summary cards add up, and the
 * wording for flags and reconciliation findings. Money is integer paise throughout.
 */

export type PaymentStatus = "created" | "authorized" | "captured" | "failed" | "expired" | "partially_refunded" | "refunded";
export type RefundStatus = "awaiting_approval" | "approved" | "processing" | "processed" | "failed" | "rejected";

export interface ApiPayment {
  id: string;
  reference: string;
  purpose: "order" | "membership";
  orderId: string | null;
  amountPaise: number;
  currency: "INR";
  status: PaymentStatus;
  providerOrderId: string;
  providerPaymentId: string | null;
  capturedAt: string | null;
  createdAt: string;
  customerId: string;
  flags: string[];
  capturedPaise: number;
  refundedPaise: number;
  refundReservedPaise: number;
  mismatch: { expectedPaise: number; actualPaise: number; currency: string; providerPaymentId: string; at: string } | null;
  failureReason: string | null;
  method: string | null;
}

export interface ApiRefund {
  id: string;
  paymentId: string;
  amountPaise: number;
  reason: string;
  status: RefundStatus;
  approvalId: string | null;
  providerRefundId: string | null;
  source: "staff" | "provider";
  failureReason: string | null;
  createdAt: string;
}

export interface ApiReconciliationRun {
  id?: string;
  at: string;
  from: string;
  to: string;
  providerChecked: number;
  localChecked: number;
  mismatches: { kind: string; providerPaymentId?: string | null; paymentId?: string | null; detail: string }[];
  healed: number;
  expired: number;
  replayed: number;
}

/** A refund at or above this needs a second person's approval (the server's default; its own check is the final word). */
export const REFUND_APPROVAL_THRESHOLD_PAISE = 5_00_000;

export const needsRefundApproval = (amountPaise: number) => amountPaise >= REFUND_APPROVAL_THRESHOLD_PAISE;

/** What is still refundable: captured minus everything already asked for (done or on its way). */
export const refundableLeft = (p: Pick<ApiPayment, "capturedPaise" | "refundReservedPaise">) => Math.max(0, p.capturedPaise - p.refundReservedPaise);

export const isRefundable = (p: Pick<ApiPayment, "status" | "capturedPaise" | "refundReservedPaise">) =>
  (p.status === "captured" || p.status === "partially_refunded") && refundableLeft(p) >= 100;

/** "1,250.50" or "1250" → paise; null when it isn't a plain amount with at most 2 decimals. */
export function rupeesToPaise(text: string): number | null {
  const clean = text.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export const paiseToRupeesText = (paise: number) => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));

// ---------- Wording ----------

export const FLAG_LABEL: Record<string, string> = {
  amount_mismatch: "Amount mismatch",
  currency_mismatch: "Currency mismatch",
  paid_after_expiry: "Paid after expiry",
  duplicate_payment: "Duplicate payment",
  reconciliation_mismatch: "Reconciliation mismatch",
};

/** What happened and what a person should do (from the payments runbook). */
export const FLAG_HELP: Record<string, string> = {
  amount_mismatch: "The gateway took a different amount from the one we asked for. It was not captured and nothing was fulfilled. Refund the customer on Razorpay or ask them to pay again.",
  currency_mismatch: "The gateway took a different currency. It was not captured and nothing was fulfilled. Refund the customer on Razorpay or ask them to pay again.",
  paid_after_expiry: "Money arrived after the payment window closed. Fulfil the order or refund the customer.",
  duplicate_payment: "The customer paid twice for the same order. Refund the second payment.",
  reconciliation_mismatch: "The daily reconciliation found this payment differs from the gateway's record. Check the reconciliation report before shipping.",
};

export const flagLabel = (flag: string) => FLAG_LABEL[flag] ?? humanizeCode(flag);

export function humanizeCode(value: string) {
  const words = value.replace(/[._-]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : value;
}

export const METHOD_LABEL: Record<string, string> = { upi: "UPI", card: "Card", netbanking: "Net banking", wallet: "Wallet", emi: "EMI", paylater: "Pay later" };
export const methodLabel = (method: string | null) => (method ? (METHOD_LABEL[method.toLowerCase()] ?? humanizeCode(method)) : null);

export const RECONCILIATION_KIND: Record<string, { label: string; tone: "info" | "warning" | "error"; help: string }> = {
  missed_capture_healed: {
    label: "Missed capture healed",
    tone: "info",
    help: "Razorpay had captured it but our webhook never came. We fixed it. Check the webhook delivery log on Razorpay.",
  },
  missing_local: { label: "Unknown payment at gateway", tone: "error", help: "Razorpay has a payment on an order we have no intent for. Investigate." },
  local_captured_not_at_provider: {
    label: "Paid here, not at gateway",
    tone: "error",
    help: "We show it as paid but Razorpay does not. Do not ship; escalate.",
  },
  amount_mismatch: { label: "Amount mismatch", tone: "error", help: "The gateway's amount differs from our intent. It was not captured here." },
  flagged_open: { label: "Flagged payment still open", tone: "warning", help: "A flagged payment is waiting for a person to decide." },
  flagged_at_reconcile: { label: "Flagged at reconciliation", tone: "warning", help: "The gateway's capture differs from the intent (amount or currency)." },
};

export const reconciliationKind = (kind: string) => RECONCILIATION_KIND[kind] ?? { label: humanizeCode(kind), tone: "warning" as const, help: "" };

/** A difference needs a person unless it was healed on its own. */
export const needsAttention = (run: ApiReconciliationRun | null) => (run ? run.mismatches.filter((m) => m.kind !== "missed_capture_healed").length : 0);

// ---------- Rows ----------

export function paymentRow(p: ApiPayment): RecordRow {
  return {
    id: p.id,
    reference: p.reference,
    purpose: p.purpose === "membership" ? "Prime plan" : "Order",
    orderId: p.orderId,
    customerId: p.customerId,
    amount: p.amountPaise,
    captured: p.capturedPaise,
    refunded: p.refundedPaise,
    reserved: p.refundReservedPaise,
    method: methodLabel(p.method),
    providerOrderId: p.providerOrderId,
    providerPaymentId: p.providerPaymentId,
    flags: p.flags.join(","),
    flagText: p.flags.length ? p.flags.map(flagLabel).join(", ") : null,
    failureReason: p.failureReason,
    created: p.createdAt,
    capturedAt: p.capturedAt,
    status: p.status,
  };
}

export function refundRow(r: ApiRefund): RecordRow {
  return {
    id: r.id,
    code: `RF-${r.id.slice(-6).toUpperCase()}`,
    paymentId: r.paymentId,
    amount: r.amountPaise,
    reason: r.reason,
    source: r.source === "provider" ? "Razorpay dashboard" : "Staff",
    approvalId: r.approvalId,
    providerRefundId: r.providerRefundId,
    problem: r.failureReason,
    created: r.createdAt,
    status: r.status,
  };
}

// ---------- Search and filters (the API filters by status, customer, reference and flagged only) ----------

export interface PaymentSearch {
  customerId?: string;
  reference?: string;
  /** Lower-case text to find in the ids and reference of each row. */
  needle?: string;
}

/** What a typed search means: a 24-character ID is a customer, `order:…`/`prime:…` a reference, anything else matches the row text. */
export function interpretSearch(q: string | undefined): PaymentSearch {
  const text = q?.trim();
  if (!text) return {};
  if (/^[0-9a-f]{24}$/i.test(text)) return { customerId: text.toLowerCase() };
  if (/^(order|prime):\S+$/i.test(text)) return { reference: text };
  return { needle: text.toLowerCase() };
}

/** The India-time calendar day of an instant: "2026-11-02". */
export function istDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

export const inDays = (iso: string, from?: string, to?: string) => {
  const day = istDay(iso);
  return (!from || day >= from) && (!to || day <= to);
};

export interface PaymentFilter {
  needle?: string;
  from?: string;
  to?: string;
  minPaise?: number;
  maxPaise?: number;
}

export const hasClientFilter = (f: PaymentFilter) => Boolean(f.needle || f.from || f.to || f.minPaise !== undefined || f.maxPaise !== undefined);

export function matchesPayment(p: ApiPayment, f: PaymentFilter): boolean {
  if (f.needle) {
    const haystack = [p.id, p.reference, p.providerOrderId, p.providerPaymentId, p.customerId, p.orderId].filter(Boolean).join(" ").toLowerCase();
    if (!haystack.includes(f.needle)) return false;
  }
  if (!inDays(p.createdAt, f.from, f.to)) return false;
  if (f.minPaise !== undefined && p.amountPaise < f.minPaise) return false;
  if (f.maxPaise !== undefined && p.amountPaise > f.maxPaise) return false;
  return true;
}

export function matchesRefund(r: ApiRefund, f: { needle?: string; from?: string; to?: string; minPaise?: number; maxPaise?: number }): boolean {
  if (f.needle && ![r.id, r.paymentId, r.providerRefundId, r.reason].filter(Boolean).join(" ").toLowerCase().includes(f.needle)) return false;
  if (!inDays(r.createdAt, f.from, f.to)) return false;
  if (f.minPaise !== undefined && r.amountPaise < f.minPaise) return false;
  if (f.maxPaise !== undefined && r.amountPaise > f.maxPaise) return false;
  return true;
}

// ---------- Summary cards ----------

export interface PaymentSummary {
  capturedPaise: number;
  capturedCount: number;
  failedPaise: number;
  failedCount: number;
  refundedPaise: number;
  refundedCount: number;
  flaggedPaise: number;
  flaggedCount: number;
  total: number;
}

/** What the four cards add up for the payments given (callers have already narrowed them to the period). */
export function summarize(payments: readonly ApiPayment[]): PaymentSummary {
  const out: PaymentSummary = { capturedPaise: 0, capturedCount: 0, failedPaise: 0, failedCount: 0, refundedPaise: 0, refundedCount: 0, flaggedPaise: 0, flaggedCount: 0, total: payments.length };
  for (const p of payments) {
    if (p.capturedPaise > 0) {
      out.capturedPaise += p.capturedPaise;
      out.capturedCount += 1;
    }
    if (p.status === "failed") {
      out.failedPaise += p.amountPaise;
      out.failedCount += 1;
    }
    if (p.refundedPaise > 0) {
      out.refundedPaise += p.refundedPaise;
      out.refundedCount += 1;
    }
    if (p.flags.length > 0) {
      out.flaggedPaise += p.amountPaise;
      out.flaggedCount += 1;
    }
  }
  return out;
}

// ---------- Timeline ----------

const PAYMENT_STEPS = ["Payment started", "Authorized", "Captured", "Refunded"] as const;

/** created → authorized → captured → refunded, with the times and amounts known. A failed or expired payment stops where it did. */
export function paymentTimeline(p: ApiPayment): TimelineStep[] {
  const metas: Record<number, string> = { 0: formatDateTime(p.createdAt) };
  if (p.capturedAt) metas[2] = formatDateTime(p.capturedAt);
  if (p.status === "failed") return stepsOf(PAYMENT_STEPS, 1, { failed: true, metas: { ...metas, 1: p.failureReason ? `Failed: ${p.failureReason}` : "Payment failed" } });
  if (p.status === "expired") return stepsOf(PAYMENT_STEPS, 1, { failed: true, metas: { ...metas, 1: "Not paid in time; the intent expired" } });
  if (p.status === "created") return stepsOf(PAYMENT_STEPS, 1, { metas: { ...metas, 1: "Waiting for the customer to pay" } });
  if (p.status === "authorized") return stepsOf(PAYMENT_STEPS, 2, { metas: { ...metas, 2: "Authorized, not captured yet" } });
  if (p.status === "captured") return stepsOf(PAYMENT_STEPS, 3, { metas: { ...metas, 3: p.refundReservedPaise > 0 ? `${formatINR(p.refundReservedPaise)} refund on its way` : "No refund" } });
  if (p.status === "partially_refunded") return stepsOf(PAYMENT_STEPS, 3, { metas: { ...metas, 3: `${formatINR(p.refundedPaise)} of ${formatINR(p.capturedPaise)} refunded` } });
  return stepsOf(PAYMENT_STEPS, 4, { metas: { ...metas, 3: `${formatINR(p.refundedPaise)} refunded in full` } });
}

/** Refund status → the plain sentence under it. */
export const REFUND_NEXT_STEP: Record<RefundStatus, string> = {
  awaiting_approval: "Waiting for the approver to decide in Approvals.",
  approved: "Approved. Send it to Razorpay with Execute refund.",
  processing: "Sent to Razorpay, no answer yet. Press Execute refund again to check; it never refunds twice.",
  processed: "Done. The money is on its way back to the customer.",
  failed: "Razorpay refused it. See the reason.",
  rejected: "The approver said no. Nothing was refunded.",
};
