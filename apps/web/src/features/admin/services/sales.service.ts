import { api, idempotencyKey } from "@/lib/api";
import type { RecordRow } from "../data/records";
import { OrderPaymentInfo } from "../modules/extras/OrderExtras";
import type { CreateSpec, EditSpec } from "../modules/types";
import { formatDateTime } from "../format";
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
  rev?: number;
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
    rev: c.rev ?? null,
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

/** GET /customers/:id: the fields the edit form fills from. `rev` is optional: older APIs don't send it. */
interface ApiCustomerDetail extends ApiCustomer {
  email: string | null;
  addressLine: string | null;
  pincode: string | null;
  locationId: string;
  rev?: number;
}

const customerOriginals = new Map<string, ApiCustomerDetail>();
/** Revisions this page has moved a customer to, for APIs that don't return `rev`: an unedited customer is at 0. */
const customerRevs = new Map<string, number>();
const revOf = (c: ApiCustomerDetail) => c.rev ?? customerRevs.get(c.id) ?? 0;
const STATUS_CHOICES = { Active: "active", Blocked: "blocked" } as const;

const customerEdit: EditSpec = {
  label: "Save changes",
  title: "Edit customer",
  description: "The mobile number can't be changed. Blocking stops new orders and Prime sales for this customer.",
  fields: [
    { name: "name", label: "Full name", kind: "text", required: true },
    { name: "email", label: "Email", kind: "email", helper: "Leave empty to remove.", pattern: { regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email address." } },
    { name: "addressLine", label: "Address", kind: "text", helper: "Leave empty to remove." },
    { name: "pincode", label: "Pincode", kind: "text", helper: "Leave empty to remove.", pattern: { regex: /^\d{6}$/, message: "Enter a 6-digit pincode." } },
    { name: "locationId", label: "Village, ward or town ID", kind: "text", required: true, pattern: { regex: /^[a-z_]{3,20}:[A-Za-z0-9_-]{1,32}$/, message: "Use the form village:5001 or ward:7001." } },
    { name: "status", label: "Status", kind: "select", required: true, options: Object.keys(STATUS_CHOICES) },
  ],
  async load(row) {
    const { customer } = await api.get<{ customer: ApiCustomerDetail }>(`/customers/${row.id}`);
    customerOriginals.set(customer.id, customer);
    const masked = (value: string | null) => Boolean(value && value.includes("•"));
    return {
      values: {
        name: customer.name,
        // A masked email (no customer.view_pii) can't be sent back; it is left empty and kept unless typed over.
        email: masked(customer.email) ? "" : (customer.email ?? ""),
        addressLine: customer.addressLine ?? "",
        pincode: customer.pincode ?? "",
        locationId: customer.locationId,
        status: customer.status === "blocked" ? "Blocked" : "Active",
      },
      images: [],
      note: masked(customer.email) ? "The email is hidden from you; it stays as it is unless you type a new one." : undefined,
    };
  },
  toast: (values) => `${values.name} saved.`,
};

export const customersService: LiveService = {
  editSpec: customerEdit,
  async update(row, values) {
    const before = customerOriginals.get(row.id);
    if (!before) throw new Error("Close and reopen the form, then try again");
    const text = (key: string) => String(values[key] ?? "").trim();
    const patch: Record<string, unknown> = {};
    if (text("name") !== before.name) patch.name = text("name");
    const emailHidden = Boolean(before.email?.includes("•"));
    if (!(emailHidden && !text("email")) && text("email") !== (before.email ?? "")) patch.email = text("email") || null;
    for (const key of ["addressLine", "pincode"] as const) if (text(key) !== (before[key] ?? "")) patch[key] = text(key) || null;
    if (text("locationId") !== before.locationId) patch.locationId = text("locationId");
    const status = STATUS_CHOICES[text("status") as keyof typeof STATUS_CHOICES];
    if (status && status !== before.status) patch.status = status;
    if (!Object.keys(patch).length) return row;
    const rev = revOf(before);
    const res = await api.patch<{ customer: ApiCustomerDetail }>(`/customers/${row.id}`, { rev, ...patch });
    customerRevs.set(row.id, res.customer.rev ?? rev + 1);
    customerOriginals.delete(row.id);
    return customerRow(res.customer, await territoryNames([districtOf(res.customer.territoryPath)]));
  },
  canCreate: true,
  // Block and unblock send the revision that was read; a change made meanwhile is a conflict (CUSTOMER_CHANGED), never an overwrite.
  actions: ["block", "unblock"],
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
    actions: [
      {
        key: "block",
        label: "Block customer",
        from: ["active"],
        to: "blocked",
        variant: "danger",
        requires: "customer.manage",
        confirm: { kind: "destructive", title: "Block customer", description: "They can't sign in, order or buy Prime until unblocked, and their sessions end now.", confirmLabel: "Block customer" },
        toast: (r) => `${r.name} blocked.`,
      },
      { key: "unblock", label: "Unblock", from: ["blocked"], to: "active", variant: "secondary", requires: "customer.manage", toast: (r) => `${r.name} unblocked.` },
    ],
  },
  async transition(row, _actionKey, to) {
    const rev = typeof row.rev === "number" ? row.rev : (customerRevs.get(row.id) ?? 0);
    const res = await api.patch<{ customer: ApiCustomerDetail }>(`/customers/${row.id}`, { rev, status: to });
    customerRevs.set(row.id, res.customer.rev ?? rev + 1);
    customerOriginals.delete(row.id);
    return customerRow(res.customer, await territoryNames([districtOf(res.customer.territoryPath)]));
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

export type OrderStatus = "pending_approval" | "pending_payment" | "payment_failed" | "placed" | "cancelled" | "completed";
export interface ApiOrder {
  id: string;
  orderNumber: string;
  placedAt: string;
  status: OrderStatus;
  customerId?: string;
  source?: "staff" | "store";
  paymentMethod?: "cod" | "online" | null;
  paymentStatus?: "none" | "pending" | "captured" | "failed";
  totalPaise?: number | null;
  approvalId?: string | null;
  expiresAt?: string | null;
  confirmedAt?: string | null;
  cancelReason?: string | null;
  ownerDealerId: string | null;
  ownerSubDealerId: string | null;
  territoryPath: string[];
  deliveryChargePaise: number;
  itemCount: number;
}

const PAYMENT_METHOD_LABEL = { cod: "Cash on delivery", online: "Online" } as const;
const PAYMENT_STATUS_LABEL = { none: "No payment due", pending: "Awaiting payment", captured: "Paid", failed: "Payment failed" } as const;

/** What the Payment column says: the method and where the money stands ("Online · Paid"). Staff orders have none. */
export function paymentText(o: Pick<ApiOrder, "paymentMethod" | "paymentStatus">): string | null {
  if (!o.paymentMethod) return null;
  const method = PAYMENT_METHOD_LABEL[o.paymentMethod];
  return o.paymentMethod === "cod" ? method : `${method} · ${PAYMENT_STATUS_LABEL[o.paymentStatus ?? "none"]}`;
}

export function orderRow(o: ApiOrder, places: Map<string, string>): RecordRow {
  const district = districtOf(o.territoryPath);
  return {
    id: o.id,
    code: o.orderNumber,
    buyer: o.ownerSubDealerId ?? o.ownerDealerId ?? "Company order",
    channel: o.ownerSubDealerId ? "Sub-dealer" : o.ownerDealerId ? "Dealer" : "Company",
    source: o.source === "store" ? "Customer app" : "Staff",
    district: places.get(district) ?? district,
    items: o.itemCount,
    delivery: o.deliveryChargePaise,
    total: o.totalPaise ?? null,
    payment: paymentText(o),
    paymentStatus: o.paymentStatus ?? null,
    approvalId: o.approvalId ?? null,
    customerId: o.customerId ?? null,
    expiresAt: o.expiresAt ?? null,
    cancelReason: o.cancelReason ?? null,
    date: o.placedAt,
    status: o.status,
  };
}

/** The API finds one order by its full number (ORD-123); partial text would be a validation error, so it is ignored. */
export const orderNumberOf = (q: string | undefined) => (q && /^ORD-\d{1,12}$/i.test(q.trim()) ? q.trim() : undefined);

const ORDER_STEPS = ["Placed", "Delivered"] as const;
const APPROVAL_STEPS = ["Placed", "Discount approved", "Delivered"] as const;
const PAYMENT_STEPS = ["Placed", "Payment received", "Delivered"] as const;

/** Where an order stands, including the three states before it is confirmed. Pure so it can be tested. */
export function orderTimeline(r: RecordRow) {
  const why = typeof r.cancelReason === "string" && r.cancelReason ? `Cancelled: ${r.cancelReason}` : "Cancelled";
  const waiting = r.status === "pending_approval" || r.status === "pending_payment" || r.status === "payment_failed";
  if (waiting) {
    const labels = r.status === "pending_approval" ? APPROVAL_STEPS : PAYMENT_STEPS;
    if (r.status === "payment_failed") return stepsOf(labels, 1, { failed: true, metas: { 1: "Payment failed. The customer can pay again until the window closes." } });
    if (r.status === "pending_payment") return stepsOf(labels, 1, { metas: { 1: r.expiresAt ? `Waiting for payment until ${formatDateTime(String(r.expiresAt))}` : "Waiting for payment" } });
    return stepsOf(labels, 1, { metas: { 1: "Waiting for the approver to decide the discount" } });
  }
  if (r.status === "cancelled") return stepsOf(ORDER_STEPS, 1, { failed: true, metas: { 1: why } });
  return stepsOf(ORDER_STEPS, r.status === "completed" ? 2 : 1);
}

export const ordersService: LiveService = {
  actions: ["cancel"],
  searchPlaceholder: "Full order number, e.g. ORD-1042",
  viewPatch: {
    searchKeys: ["code", "buyer"],
    columns: [
      { key: "code", header: "Order", primary: true, sub: "buyer" },
      { key: "channel", header: "Buyer type" },
      { key: "payment", header: "Payment", hideOnMobile: true },
      { key: "items", header: "Items", format: "count", hideOnMobile: true },
      { key: "date", header: "Placed", format: "datetime", hideOnMobile: true },
      { key: "status", header: "Status", format: "status" },
    ],
    statuses: ["pending_approval", "pending_payment", "payment_failed", "placed", "completed", "cancelled"],
    details: [
      { label: "Buyer", key: "buyer" },
      { label: "Buyer type", key: "channel" },
      { label: "Placed by", key: "source" },
      { label: "Order total", key: "total", format: "inr2" },
      { label: "Payment", key: "payment" },
      { label: "Cancelled because", key: "cancelReason" },
      { label: "District", key: "district" },
      { label: "Items", key: "items", format: "count" },
      { label: "Delivery charge", key: "delivery", format: "inr" },
      { label: "Placed", key: "date", format: "datetime" },
    ],
    timeline: {
      label: "Order progress",
      steps: orderTimeline,
    },
    note: (r) =>
      r.status === "placed"
        ? "Cancelling is possible only before any unit is delivered. Delivered units are cancelled or returned item by item."
        : r.status === "pending_approval"
          ? "The discount is above the cap. The order moves on when the approver approves it under Approvals; if they reject it, it is cancelled with their reason."
          : r.status === "pending_payment"
            ? "Stock is held while the customer pays. If the window closes unpaid, the order is cancelled and the stock goes back."
            : r.status === "payment_failed"
              ? "The payment failed. The customer can try again until the payment window closes."
              : null,
    extra: OrderPaymentInfo,
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
    const res = await api.get<{ items: ApiOrder[]; nextCursor: string | null }>("/orders", { orderNumber: orderNumberOf(q), status, cursor, limit });
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
  searchPlaceholder: "Invoice number (starts with)",
  viewPatch: {
    dateRange: true,
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
  async list({ q, status, cursor, limit, from, to }) {
    // The API filters e-invoices that are pending or failed, the start of the invoice number, and the days issued.
    const res = await api.get<{ items: ApiInvoice[]; nextCursor: string | null }>("/billing/invoices", {
      einvoice: status === "pending" || status === "failed" ? status : undefined,
      q: q?.trim() || undefined,
      from: from || undefined,
      to: to || undefined,
      cursor,
      limit,
    });
    return pageOf(res.items.map(invoiceRow), res.nextCursor);
  },
  async transition(row) {
    const res = await api.post<{ document: ApiInvoice }>(`/billing/documents/${row.id}/einvoice/retry`, {}, { "Idempotency-Key": idempotencyKey() });
    return invoiceRow(res.document);
  },
};
