import { api, idempotencyKey } from "@/lib/api";
import { istDay, matchesPayment } from "./payments.mappers";
import type { ApiPayment, ApiReconciliationRun, ApiRefund, PaymentFilter } from "./payments.mappers";

/*
 * Calls to femxo-backend's /payments routes (ADR 0021) that the detail screens and the services share.
 * The API filters payments by status, customer, reference and "flagged" only. Search, days and amounts
 * are applied here, on pages read newest first; a scan stops after SCAN_PAGES pages.
 */

const SCAN_PAGES = 5;
const PAGE = 100;

export type ApiPage<T> = { items: T[]; nextCursor: string | null };

/** Reads pages (newest first) until `want` rows pass `keep`, the list ends, the rows are older than `from`, or the scan limit is hit. */
export async function scan<T extends { createdAt: string }>(
  read: (cursor: string | null, limit: number) => Promise<ApiPage<T>>,
  keep: (item: T) => boolean,
  opts: { cursor: string | null; want: number; limit: number; from?: string; olderThanFrom: (item: T, from: string) => boolean }
): Promise<{ items: T[]; nextCursor: string | null }> {
  const out: T[] = [];
  let cursor = opts.cursor;
  for (let pages = 0; pages < SCAN_PAGES; pages++) {
    const res = await read(cursor, opts.limit);
    out.push(...res.items.filter(keep));
    const last = res.items.at(-1);
    // Newest first: once a page reaches rows older than the first day, nothing further can match.
    if (opts.from && last && opts.olderThanFrom(last, opts.from)) return { items: out, nextCursor: null };
    cursor = res.nextCursor;
    if (!cursor || out.length >= opts.want) break;
  }
  return { items: out, nextCursor: cursor };
}

export const isOlder = (item: { createdAt: string }, from: string) => istDay(item.createdAt) < from;

/** Every payment of a period for the summary cards: newest first, at most `maxPages` pages. `capped` is true when older ones were left out. */
export async function paymentsInPeriod(from?: string, to?: string, maxPages = 10): Promise<{ payments: ApiPayment[]; capped: boolean }> {
  const filter: PaymentFilter = { from, to };
  const payments: ApiPayment[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const res: ApiPage<ApiPayment> = await api.get("/payments", { cursor, limit: PAGE });
    payments.push(...res.items.filter((p) => matchesPayment(p, filter)));
    const last = res.items.at(-1);
    if (from && last && isOlder(last, from)) return { payments, capped: false };
    cursor = res.nextCursor;
    if (!cursor) return { payments, capped: false };
  }
  return { payments, capped: true };
}

export async function getPayment(id: string): Promise<{ payment: ApiPayment; refunds: ApiRefund[] }> {
  return api.get(`/payments/${id}`);
}


export interface RefundInput {
  amountPaise: number;
  reason: string;
  idempotencyKey: string;
  assignedTo?: string;
}

/** POST /payments/:id/refunds. A repeat with the same key answers the same refund (replayed). */
export async function requestRefund(paymentId: string, input: RefundInput): Promise<{ refund: ApiRefund; replayed: boolean }> {
  const body = { amountPaise: input.amountPaise, reason: input.reason.trim(), idempotencyKey: input.idempotencyKey, ...(input.assignedTo ? { assignedTo: input.assignedTo } : {}) };
  return api.post(`/payments/${paymentId}/refunds`, body);
}

export async function executeRefund(refundId: string): Promise<ApiRefund> {
  return (await api.post<{ refund: ApiRefund }>(`/payments/refunds/${refundId}/execute`, {})).refund;
}

export const newRefundKey = idempotencyKey;
// ---------- Reconciliation ----------

export const latestReconciliation = async (): Promise<ApiReconciliationRun | null> => (await api.get<{ run: ApiReconciliationRun | null }>("/payments/reconciliation/latest")).run;

export const runReconciliation = async (): Promise<ApiReconciliationRun> => (await api.post<{ run: ApiReconciliationRun }>("/payments/reconciliation/run", {})).run;

// ---------- Lookups for the detail screens ----------

export interface CustomerBrief {
  name: string;
  territoryPath: string[];
}

/** The customer behind a payment (needs customer.view); null when the call is refused or fails. */
export async function customerBrief(id: string): Promise<CustomerBrief | null> {
  try {
    const { customer } = await api.get<{ customer: { name: string; territoryPath?: string[] } }>(`/customers/${id}`);
    return { name: customer.name, territoryPath: customer.territoryPath ?? [] };
  } catch {
    return null;
  }
}

/** The order number behind a payment (needs order.view); null when refused or missing. */
export async function orderNumber(id: string): Promise<string | null> {
  try {
    return (await api.get<{ order: { orderNumber: string } }>(`/orders/${id}`)).order.orderNumber;
  } catch {
    return null;
  }
}
