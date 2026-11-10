import { api, idempotencyKey } from "@/lib/api";
import type { RecordRow } from "../data/records";
import type { CreateSpec } from "../modules/types";
import { lastOf, territoryNames } from "./lookups";
import { dayOf, pageOf, stepsOf } from "./shared";
import type { LiveService } from "./types";

/*
 * Customers, orders and invoices against femxo-backend (/customers, /orders, /billing, /delivery).
 * Orders are placed by dealers and sub-dealers elsewhere; the panel reads them and cancels them.
 */

// ---------- Customers ----------

interface ApiCustomer {
  id: string;
  phone: string;
  name: string;
  territoryPath: string[];
  status: "active" | "blocked";
  prime: { status: "none" | "active" | "expired"; until: string | null };
  createdAt: string;
}

const PRIME_LABEL = { none: "—", active: "Prime", expired: "Expired" } as const;
const districtOf = (path: readonly string[]) => path.find((id) => id.startsWith("district:")) ?? lastOf(path);

export function customerRow(c: ApiCustomer, places: Map<string, string>): RecordRow {
  const district = districtOf(c.territoryPath);
  return {
    id: c.id,
    name: c.name,
    // The API masks the number unless the caller holds customer.view_pii.
    phone: c.phone,
    district: places.get(district) ?? district,
    prime: PRIME_LABEL[c.prime.status],
    joined: dayOf(c.createdAt),
    status: c.status,
  };
}

const customerCreate: CreateSpec = {
  label: "Add customer",
  title: "Add customer",
  description: "Registers a customer at an address inside your territory.",
  fields: [
    { name: "name", label: "Full name", kind: "text", required: true },
    { name: "phone", label: "Mobile number", kind: "tel", required: true, placeholder: "10-digit mobile", pattern: { regex: /^(\+?91[\s-]?|0)?[6-9]\d{9}$/, message: "Enter a 10-digit mobile number." } },
    { name: "email", label: "Email", kind: "email", helper: "Optional.", pattern: { regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email address." } },
    { name: "addressLine", label: "Address", kind: "text", helper: "Optional." },
    { name: "pincode", label: "Pincode", kind: "text", helper: "Optional.", pattern: { regex: /^\d{6}$/, message: "Enter a 6-digit pincode." } },
    {
      name: "locationId",
      label: "Village, ward or town ID",
      kind: "text",
      required: true,
      placeholder: "village:5001",
      pattern: { regex: /^[a-z_]{3,20}:[A-Za-z0-9_-]{1,32}$/, message: "Use the form village:5001 or ward:7001." },
    },
  ],
  status: "active",
  toRow: (v) => v,
  toast: (v) => `${v.name} registered.`,
};

export const customersService: LiveService = {
  canCreate: true,
  // The API changes a customer only with the revision that was read, and does not return it yet, so block and unblock are not offered.
  actions: [],
  searchPlaceholder: "Find by full 10-digit mobile number",
  createSpec: customerCreate,
  viewPatch: {
    searchKeys: ["name", "phone"],
    columns: [
      { key: "name", header: "Customer", primary: true },
      { key: "phone", header: "Mobile" },
      { key: "district", header: "District", hideOnMobile: true },
      { key: "prime", header: "Prime" },
      { key: "status", header: "Status", format: "status" },
    ],
    details: [
      { label: "Mobile", key: "phone" },
      { label: "District", key: "district" },
      { label: "Prime", key: "prime" },
      { label: "Customer since", key: "joined", format: "date" },
    ],
    actions: [],
  },
  async list({ q, cursor, limit }) {
    const digits = q?.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
    // The API finds one customer by exact number; shorter text is ignored rather than refused.
    const phone = digits && /^[6-9]\d{9}$/.test(digits) ? digits : undefined;
    const res = await api.get<{ items: ApiCustomer[]; nextCursor: string | null }>("/customers", { phone, cursor, limit });
    const places = await territoryNames(res.items.map((c) => districtOf(c.territoryPath)));
    return pageOf(res.items.map((c) => customerRow(c, places)), res.nextCursor);
  },
  async create(values) {
    const optional = (name: string) => {
      const value = String(values[name] ?? "").trim();
      return value ? { [name]: value } : {};
    };
    const res = await api.post<{ customer: ApiCustomer }>("/customers", {
      name: String(values.name).trim(),
      phone: String(values.phone).trim(),
      locationId: String(values.locationId).trim(),
      ...optional("email"),
      ...optional("addressLine"),
      ...optional("pincode"),
    });
    return customerRow(res.customer, await territoryNames([districtOf(res.customer.territoryPath)]));
  },
};

// ---------- Orders ----------

interface ApiOrder {
  id: string;
  orderNumber: string;
  placedAt: string;
  status: "placed" | "cancelled" | "completed";
  ownerDealerId: string | null;
  ownerSubDealerId: string | null;
  territoryPath: string[];
  deliveryChargePaise: number;
  itemCount: number;
}

export function orderRow(o: ApiOrder, places: Map<string, string>): RecordRow {
  const district = districtOf(o.territoryPath);
  return {
    id: o.id,
    code: o.orderNumber,
    buyer: o.ownerSubDealerId ?? o.ownerDealerId ?? "Company order",
    channel: o.ownerSubDealerId ? "Sub-dealer" : o.ownerDealerId ? "Dealer" : "Company",
    district: places.get(district) ?? district,
    items: o.itemCount,
    delivery: o.deliveryChargePaise,
    date: o.placedAt,
    status: o.status,
  };
}

const ORDER_STEPS = ["Placed", "Delivered"] as const;

export const ordersService: LiveService = {
  actions: ["cancel"],
  searchPlaceholder: "Find by order number",
  viewPatch: {
    searchKeys: ["code", "buyer"],
    columns: [
      { key: "code", header: "Order", primary: true, sub: "buyer" },
      { key: "channel", header: "Buyer type" },
      { key: "district", header: "District", hideOnMobile: true },
      { key: "items", header: "Items", format: "count" },
      { key: "date", header: "Placed", format: "datetime", hideOnMobile: true },
      { key: "status", header: "Status", format: "status" },
    ],
    statuses: ["placed", "completed", "cancelled"],
    details: [
      { label: "Buyer", key: "buyer" },
      { label: "Buyer type", key: "channel" },
      { label: "District", key: "district" },
      { label: "Items", key: "items", format: "count" },
      { label: "Delivery charge", key: "delivery", format: "inr" },
      { label: "Placed", key: "date", format: "datetime" },
    ],
    timeline: {
      label: "Order progress",
      steps: (r) => {
        if (r.status === "cancelled") return stepsOf(ORDER_STEPS, 1, { failed: true, metas: { 1: "Cancelled" } });
        return stepsOf(ORDER_STEPS, r.status === "completed" ? 2 : 1);
      },
    },
    note: (r) => (r.status === "placed" ? "Cancelling is possible only before any unit is delivered. Delivered units are cancelled or returned item by item." : null),
    actions: [
      {
        key: "cancel",
        label: "Cancel order",
        from: ["placed"],
        to: "cancelled",
        variant: "danger",
        confirm: {
          kind: "destructive",
          title: "Cancel order",
          description: "Every item's commission is voided and the order can't be reopened.",
          confirmLabel: "Cancel order",
          reason: { label: "Reason for cancelling", min: 3 },
        },
        toast: (r) => `${r.code} cancelled.`,
      },
    ],
  },
  async list({ q, status, cursor, limit }) {
    const res = await api.get<{ items: ApiOrder[]; nextCursor: string | null }>("/orders", { orderNumber: q?.trim() || undefined, status, cursor, limit });
    const places = await territoryNames(res.items.map((o) => districtOf(o.territoryPath)));
    return pageOf(res.items.map((o) => orderRow(o, places)), res.nextCursor);
  },
  async transition(row, _actionKey, to, context) {
    await api.post(`/delivery/orders/${row.id}/cancel`, { reason: context?.reason ?? "Cancelled from the admin panel" });
    return { ...row, status: to };
  },
};

// ---------- Invoices ----------

type EinvoiceStatus = "not_applicable" | "pending" | "generated" | "failed";
interface ApiInvoice {
  id: string;
  number: string;
  orderNumber: string;
  issuedAt: string;
  buyer: { name: string; gstin: string | null };
  totals: { totalPaise: number };
  einvoice: { status: EinvoiceStatus; irn: string | null; error: string | null };
}

const EINVOICE_STATUS = { not_applicable: "not_required", pending: "pending", generated: "generated", failed: "failed" } as const;
const EINVOICE_LABEL = { not_applicable: "Not required", pending: "Pending", generated: "Generated", failed: "Failed" } as const;

export function invoiceRow(d: ApiInvoice): RecordRow {
  return {
    id: d.id,
    number: d.number,
    buyer: d.buyer.name,
    order: d.orderNumber,
    gstin: d.buyer.gstin ?? "—",
    amount: d.totals.totalPaise,
    issued: dayOf(d.issuedAt),
    einvoice: EINVOICE_LABEL[d.einvoice.status],
    irn: d.einvoice.irn,
    error: d.einvoice.error,
    status: EINVOICE_STATUS[d.einvoice.status],
  };
}

export const invoicesService: LiveService = {
  actions: ["retry"],
  searchPlaceholder: "Filter the invoices on this page…",
  viewPatch: {
    searchKeys: ["number", "buyer", "gstin", "order"],
    statuses: ["pending", "failed"],
    details: [
      { label: "Order", key: "order" },
      { label: "Buyer", key: "buyer" },
      { label: "Buyer GSTIN", key: "gstin" },
      { label: "Amount", key: "amount", format: "inr" },
      { label: "Issued", key: "issued", format: "date" },
      { label: "IRN", key: "irn" },
      { label: "E-invoice problem", key: "error" },
    ],
    note: (r) =>
      r.status === "failed"
        ? "Fix the cause shown above, then retry. Issued invoices are corrected with credit or debit notes."
        : r.status === "generated"
          ? "An issued invoice never changes. Corrections are credit or debit notes."
          : null,
    actions: [{ key: "retry", label: "Retry e-invoice", from: ["failed", "pending"], to: "pending", variant: "primary", toast: (r) => `E-invoice for ${r.number} re-queued.` }],
  },
  async list({ q, status, cursor, limit }) {
    // The API can filter on pending or failed e-invoices only. Search narrows the loaded page.
    const res = await api.get<{ items: ApiInvoice[]; nextCursor: string | null }>("/billing/invoices", {
      einvoice: status === "pending" || status === "failed" ? status : undefined,
      cursor,
      limit,
    });
    const needle = q?.trim().toLowerCase();
    const rows = res.items
      .map(invoiceRow)
      .filter((row) => !needle || [row.number, row.buyer, row.gstin, row.order].some((v) => String(v).toLowerCase().includes(needle)));
    return pageOf(rows, res.nextCursor);
  },
  async transition(row) {
    const res = await api.post<{ document: ApiInvoice }>(`/billing/documents/${row.id}/einvoice/retry`, {}, { "Idempotency-Key": idempotencyKey() });
    return invoiceRow(res.document);
  },
};
