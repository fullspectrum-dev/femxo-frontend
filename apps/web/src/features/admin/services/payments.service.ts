import { api } from "@/lib/api";
import { PaymentDetail, PaymentSummaryBanner, RefundDetail } from "../modules/extras/PaymentExtras";
import type { RecordRow } from "../data/records";
import { executeRefund, isOlder, scan } from "./payments.api";
import type { ApiPage } from "./payments.api";
import { hasClientFilter, interpretSearch, matchesPayment, matchesRefund, paymentRow, refundRow } from "./payments.mappers";
import type { ApiPayment, ApiRefund, PaymentFilter } from "./payments.mappers";
import { pageOf } from "./shared";
import type { LiveService } from "./types";

/*
 * The payments and refunds lists. The API filters payments by status, customer, reference and "flagged" only.
 * Search, days and amounts are applied here, on pages read newest first (see `scan`).
 */

const PAGE = 100;
const fromTo = (from?: string, to?: string) => ({ from: from || undefined, to: to || undefined });

export const paymentsService: LiveService = {
  actions: [],
  searchPlaceholder: "Payment, order or Razorpay ID · reference · customer ID",
  viewPatch: { extra: PaymentDetail, banner: PaymentSummaryBanner },
  async list({ q, status, cursor, limit, flags, from, to, minPaise, maxPaise }) {
    const search = interpretSearch(q);
    const filter: PaymentFilter = { needle: search.needle, ...fromTo(from, to), minPaise, maxPaise };
    const base = { status, customerId: search.customerId, reference: search.reference, flagged: flags?.includes("flagged") ? "true" : undefined };
    if (!hasClientFilter(filter)) {
      const res = await api.get<ApiPage<ApiPayment>>("/payments", { ...base, cursor, limit });
      return pageOf(res.items.map(paymentRow), res.nextCursor);
    }
    const res = await scan<ApiPayment>((c, l) => api.get<ApiPage<ApiPayment>>("/payments", { ...base, cursor: c, limit: l }), (p) => matchesPayment(p, filter), {
      cursor: cursor ?? null,
      want: limit,
      limit: PAGE,
      from,
      olderThanFrom: isOlder,
    });
    return pageOf(res.items.map(paymentRow), res.nextCursor);
  },
};


export const refundsService: LiveService = {
  actions: ["execute"],
  searchPlaceholder: "Refund, payment or Razorpay refund ID · reason",
  viewPatch: { extra: RefundDetail },
  async list({ q, status, cursor, limit, from, to, minPaise, maxPaise }) {
    const filter = { needle: q?.trim().toLowerCase() || undefined, ...fromTo(from, to), minPaise, maxPaise };
    const read = (c: string | null, l: number) => api.get<ApiPage<ApiRefund>>("/payments/refunds", { status, cursor: c, limit: l });
    if (!filter.needle && !filter.from && !filter.to && filter.minPaise === undefined && filter.maxPaise === undefined) {
      const res = await read(cursor ?? null, limit);
      return pageOf(res.items.map(refundRow), res.nextCursor);
    }
    const res = await scan<ApiRefund>(read, (r) => matchesRefund(r, filter), { cursor: cursor ?? null, want: limit, limit: PAGE, from, olderThanFrom: isOlder });
    return pageOf(res.items.map(refundRow), res.nextCursor);
  },
  async transition(row): Promise<RecordRow> {
    return refundRow(await executeRefund(row.id));
  },
};

