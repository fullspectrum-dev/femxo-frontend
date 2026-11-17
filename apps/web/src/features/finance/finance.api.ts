import { api, idempotencyKey } from "@/lib/api";

/*
 * Finance endpoints of femxo-backend, typed as the routes answer them:
 * /finance (payouts, payout accounts, reconciliation, registers, P&L, statements), /wallets, /ledger,
 * /billing (documents, notes, PDF, e-invoice), /settlement (cadence, recovery configs), /commission (plans).
 * Every POST that the backend guards with an Idempotency-Key gets a fresh key per user action; a retry of the
 * same action passes the same key back.
 */

export type OwnerType = "dealer" | "sub_dealer";
export type PayoutStatus = "requested" | "approved" | "processing" | "paid" | "rejected" | "failed";
export const PAYOUT_STATUSES: readonly PayoutStatus[] = ["requested", "approved", "processing", "paid", "rejected", "failed"];

export interface Payout {
  id: string;
  ownerType: OwnerType;
  ownerId: string;
  walletId: string;
  amountPaise: number;
  note: string;
  status: PayoutStatus;
  utr: string | null;
  failureReason: string | null;
  requestedBy: string;
  decidedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutAccount {
  id: string;
  ownerType: OwnerType;
  ownerId: string;
  ifsc: string;
  last4: string;
  holderName: string;
}

export interface Wallet {
  id: string;
  ownerType: OwnerType;
  ownerId: string;
}
export interface Balances {
  spendable: number;
  held: number;
  pending: number;
}
export interface LedgerEntry {
  id: string;
  movementId: string;
  type: string;
  bucket: string;
  amount: number;
  balanceAfter: number;
  reversesMovementId: string | null;
  reference: string | null;
  reason: string | null;
  at: string;
}

export interface Finding {
  kind: string;
  recordId: string;
  beneficiary: "dealer" | "subDealer";
  expectedPaise: number;
  actualPaise: number;
}
export interface ReconciliationRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  recordsChecked: number;
  expectedPaise: number;
  actualPaise: number;
  variancePaise: number;
  mismatchCount: number;
  findings?: Finding[];
  truncated: boolean;
}

export interface RegisterRow {
  section: string;
  kind: string;
  number: string;
  date: string;
  orderNumber: string;
  buyer: string;
  buyerGstin: string | null;
  placeOfSupply: string;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}
export interface SalesRegister {
  rows: RegisterRow[];
  totals: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number };
}
export interface Pnl {
  grossSalesPaise: number;
  creditNotesPaise: number;
  debitNotesPaise: number;
  netRevenuePaise: number;
  outputGstPaise: number;
  commissionExpensePaise: number;
  deliveryCostPaise: number | null;
  deliveryCostReason: string | null;
  cogsPaise: number | null;
  grossMarginPaise: number | null;
  cogsReason: string;
  contributionPaise: number;
}
export interface Statement {
  subDealerId: string;
  month: string;
  opening: Record<string, number>;
  closing: Record<string, number>;
  rows: { id: string; at: string; type: string; bucket: string; amount: number; balanceAfter: number; reference: string | null }[];
}

export type DocKind = "invoice" | "credit_note" | "debit_note";
export interface DocLine {
  lineNo: number;
  description: string;
  quantity: number;
  unit: string;
  valuePaise: number;
  gstRateBp: number;
}
export interface BillingDoc {
  id: string;
  kind: DocKind;
  number: string;
  issuedAt: string;
  orderId: string;
  orderNumber: string;
  buyer: { name: string; gstin: string | null };
  lines: DocLine[];
  totals: { taxablePaise: number; totalPaise: number };
  reason: string | null;
  note: string | null;
  pdf: { status: string };
  einvoice: { status: "not_applicable" | "pending" | "generated" | "failed"; irn: string | null; error: string | null; attempts: number };
}
export type CreditReason = "return" | "cancellation" | "price_reduction" | "other";
export type DebitReason = "additional_charge" | "price_reduction" | "other";

export interface Cadence {
  id?: string;
  kind: "weekly" | "monthly" | "interval";
  weekday?: number;
  dayOfMonth?: number;
  days?: number;
  effectiveFrom?: string;
}
export interface RecoveryConfig {
  id: string;
  scope: "global" | "state" | "plan" | "dealer";
  target: string;
  percentBp: number;
  effectiveFrom: string;
}

export interface CommissionPlan {
  id: string;
  name: string;
  scope: { stateId: string | null; dealerId: string | null; categoryId: string | null };
  lastVersion: number;
  createdAt: string;
}
export interface PlanVersion {
  id: string;
  planId: string;
  version: number;
  status: "draft" | "validated" | "published";
  priority: number;
  model: "stacked" | "pool";
  dealerRateBp: number | null;
  subDealerRateBp: number | null;
  poolRateBp: number | null;
  dealerShareBp: number | null;
  subDealerShareBp: number | null;
  effectiveFrom: string | null;
  rev: number;
  effective?: boolean;
}
export interface VersionFields {
  model: "stacked" | "pool";
  priority?: number;
  dealerRateBp?: number | null;
  subDealerRateBp?: number | null;
  poolRateBp?: number | null;
  dealerShareBp?: number | null;
  subDealerShareBp?: number | null;
  effectiveFrom?: string | null;
}

type Page<T> = { items: T[]; nextCursor: string | null };
const keyed = (key: string) => ({ "Idempotency-Key": key });

export const financeApi = {
  // Payouts (maker-checker).
  payouts: (q: { status?: PayoutStatus; cursor?: string | null }) => api.get<Page<Payout>>("/finance/payouts", { status: q.status, cursor: q.cursor, limit: 20 }),
  requestPayout: (key: string, body: { ownerType: OwnerType; ownerId: string; amountPaise: number; note: string }) =>
    api.post<{ payout: Payout; replayed: boolean }>("/finance/payouts", body, keyed(key)),
  approvePayout: (id: string) => api.post<{ payout: Payout }>(`/finance/payouts/${id}/approve`, {}, keyed(idempotencyKey())),
  rejectPayout: (id: string, reason: string) => api.post<{ payout: Payout }>(`/finance/payouts/${id}/reject`, { reason }, keyed(idempotencyKey())),
  payoutAccount: (ownerType: OwnerType, ownerId: string) =>
    api.get<{ account: PayoutAccount }>(`/finance/payout-accounts/${ownerType}/${encodeURIComponent(ownerId)}`).then((r) => r.account),
  registerAccount: (key: string, body: { ownerType: OwnerType; ownerId: string; holderName: string; accountNumber: string; ifsc: string }) =>
    api.post<{ account: PayoutAccount }>("/finance/payout-accounts", body, keyed(key)).then((r) => r.account),

  // Wallets and ledger.
  wallets: (q: { ownerType?: OwnerType; ownerId?: string; cursor?: string | null }) =>
    api.get<Page<Wallet>>("/wallets", { ownerType: q.ownerType, ownerId: q.ownerId, cursor: q.cursor, limit: 20 }),
  wallet: (id: string) => api.get<{ wallet: Wallet; balances: Balances | null }>(`/wallets/${id}`),
  ledger: (walletId: string, cursor: string | null) => api.get<Page<LedgerEntry>>("/ledger", { walletId, cursor, limit: 20 }),

  // Reconciliation.
  runReconciliation: () => api.post<{ run: ReconciliationRun }>("/finance/reconciliation/settlement", {}, keyed(idempotencyKey())).then((r) => r.run),
  reconciliationRuns: () => api.get<{ items: ReconciliationRun[] }>("/finance/reconciliation/runs", { limit: 50 }).then((r) => r.items),
  reconciliationRun: (id: string) => api.get<{ run: ReconciliationRun }>(`/finance/reconciliation/runs/${id}`).then((r) => r.run),

  // Reports.
  salesRegister: (from: string, to: string) => api.get<SalesRegister>("/finance/registers/sales", { from, to }),
  pnl: (from: string, to: string) => api.get<Pnl>("/finance/pnl", { from, to }),
  statement: (subDealerId: string, month: string) => api.get<Statement>(`/finance/statements/sub-dealer/${encodeURIComponent(subDealerId)}`, { month }),

  // Billing documents.
  invoices: (q: { einvoice?: "pending" | "failed"; cursor?: string | null }) => api.get<Page<BillingDoc>>("/billing/invoices", { einvoice: q.einvoice, cursor: q.cursor, limit: 20 }),
  document: (id: string) => api.get<{ document: BillingDoc; notes: BillingDoc[] }>(`/billing/documents/${id}`),
  pdf: (id: string) => api.get<{ url: string; expiresAt: string }>(`/billing/documents/${id}/pdf`),
  retryEinvoice: (id: string) => api.post<{ document: BillingDoc }>(`/billing/documents/${id}/einvoice/retry`, {}, keyed(idempotencyKey())).then((r) => r.document),
  creditNote: (key: string, invoiceId: string, body: { reason: CreditReason; note: string; lines: ({ lineNo: number; quantity: number } | { lineNo: number; amountPaise: number })[] }) =>
    api.post<{ document: BillingDoc }>(`/billing/invoices/${invoiceId}/credit-notes`, body, keyed(key)).then((r) => r.document),
  debitNote: (key: string, invoiceId: string, body: { reason: DebitReason; note: string; lines: { lineNo: number; amountPaise: number }[] }) =>
    api.post<{ document: BillingDoc }>(`/billing/invoices/${invoiceId}/debit-notes`, body, keyed(key)).then((r) => r.document),

  // Settlement rules (the backend allows these to the Super Admin only).
  cadence: () => api.get<{ current: Cadence; cycle: { cycleKey: string; from: string; to: string; startsToday: boolean }; items: Cadence[] }>("/settlement/cadence"),
  setCadence: (body: Cadence & { effectiveFrom: string }) => api.post<{ cadence: Cadence }>("/settlement/cadence", body),
  recoveryConfigs: () => api.get<{ items: RecoveryConfig[] }>("/settlement/recovery-configs").then((r) => r.items),
  addRecoveryConfig: (body: { scope: RecoveryConfig["scope"]; target?: string; percentBp: number; effectiveFrom: string }) =>
    api.post<{ config: RecoveryConfig }>("/settlement/recovery-configs", body),

  // Commission plans.
  plans: (cursor: string | null) => api.get<Page<CommissionPlan>>("/commission/plans", { cursor, limit: 20 }),
  plan: (id: string) => api.get<{ plan: CommissionPlan; versions: PlanVersion[] }>(`/commission/plans/${id}`),
  createPlan: (body: { name: string; scope: { stateId?: string; dealerId?: string; categoryId?: string }; version: VersionFields }) =>
    api.post<{ plan: CommissionPlan; version: PlanVersion }>("/commission/plans", body),
  addVersion: (planId: string) => api.post<{ version: PlanVersion }>(`/commission/plans/${planId}/versions`, {}),
  updateVersion: (id: string, body: VersionFields & { rev: number }) => api.patch<{ version: PlanVersion }>(`/commission/versions/${id}`, body),
  validateVersion: (id: string, rev: number) => api.post<{ version: PlanVersion }>(`/commission/versions/${id}/validate`, { rev }),
  publishVersion: (id: string, rev: number) => api.post<{ version: PlanVersion }>(`/commission/versions/${id}/publish`, { rev }),
};
