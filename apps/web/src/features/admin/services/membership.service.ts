import { api, idempotencyKey } from "@/lib/api";
import type { RecordRow } from "../data/records";
import type { CreateSpec } from "../modules/types";
import { dayOf, pageOf } from "./shared";
import type { LiveService } from "./types";

/* Prime plans and subscriptions against femxo-backend (/membership). */

// ---------- Subscriptions ----------

interface ApiSubscription {
  id: string;
  customerId: string;
  planName: string;
  pricePaise: number;
  status: "active" | "expired" | "cancelled";
  startAt: string;
  endAt: string;
  paymentRef: string;
  cancelReason: string | null;
}

export function subscriptionRow(s: ApiSubscription): RecordRow {
  return {
    id: s.id,
    customer: s.customerId,
    plan: s.planName,
    price: s.pricePaise,
    start: dayOf(s.startAt),
    end: dayOf(s.endAt),
    paymentRef: s.paymentRef,
    cancelReason: s.cancelReason,
    status: s.status,
  };
}

/** Plan label → id for the subscribe form, and the idempotency key of the form now open (a retried submit sells once). */
let planChoices = new Map<string, string>();
let saleKey = "";

const subscribeCreate: CreateSpec = {
  label: "Subscribe customer",
  title: "Sell Prime membership",
  description: "Records a Prime sale for a customer in your territory. There is no payment gateway: enter the receipt or transaction number you were given.",
  fields: [
    {
      name: "customer",
      label: "Customer mobile or ID",
      kind: "text",
      required: true,
      placeholder: "10-digit mobile",
      pattern: { regex: /^((\+?91[\s-]?|0)?[6-9]\d{9}|[0-9a-fA-F]{24})$/, message: "Enter the customer's 10-digit mobile number or their 24-character ID." },
    },
    { name: "plan", label: "Plan", kind: "select", required: true, options: [] },
    { name: "paymentRef", label: "Payment reference", kind: "text", required: true, helper: "Receipt or UPI transaction number, 3–100 characters.", pattern: { regex: /^.{3,100}$/, message: "Use 3 to 100 characters." } },
  ],
  status: "active",
  toRow: (v) => v,
  toast: () => "Prime membership sold.",
  async prepare() {
    const res = await api.get<{ items: { id: string; name: string; pricePaise: number; durationDays: number }[] }>("/membership/plans", { status: "active" });
    planChoices = new Map(res.items.map((p) => [`${p.name} · ₹${(p.pricePaise / 100).toLocaleString("en-IN")} · ${p.durationDays} days`, p.id]));
    saleKey = idempotencyKey();
    return { plan: [...planChoices.keys()] };
  },
};

async function customerIdOf(text: string): Promise<string> {
  if (/^[0-9a-f]{24}$/i.test(text)) return text;
  const phone = text.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
  const res = await api.get<{ items: { id: string }[] }>("/customers", { phone, limit: 1 });
  const found = res.items[0];
  if (!found) throw new Error("No customer with that mobile number in your territory. Register them under Customers first");
  return found.id;
}

export const subscriptionsService: LiveService = {
  canCreate: true,
  createSpec: subscribeCreate,
  async create(values) {
    const planId = planChoices.get(String(values.plan));
    if (!planId) throw new Error("Choose a plan from the list");
    const res = await api.post<{ subscription: ApiSubscription; replayed: boolean }>("/membership/subscriptions", {
      customerId: await customerIdOf(String(values.customer).trim()),
      planId,
      paymentRef: String(values.paymentRef).trim(),
      idempotencyKey: saleKey || idempotencyKey(),
    });
    saleKey = "";
    return subscriptionRow(res.subscription);
  },
  actions: ["cancel"],
  searchPlaceholder: "Payment reference (starts with)",
  viewPatch: {
    dateRange: true,
    searchKeys: ["customer", "plan", "paymentRef"],
    columns: [
      { key: "customer", header: "Customer ID", primary: true, sub: "plan" },
      { key: "price", header: "Price paid", format: "inr" },
      { key: "end", header: "Ends", format: "date", hideOnMobile: true },
      { key: "status", header: "Status", format: "status" },
    ],
    statuses: ["active", "expired", "cancelled"],
    details: [
      { label: "Plan", key: "plan" },
      { label: "Price paid", key: "price", format: "inr" },
      { label: "Started", key: "start", format: "date" },
      { label: "Ends", key: "end", format: "date" },
      { label: "Payment reference", key: "paymentRef" },
      { label: "Cancellation reason", key: "cancelReason" },
    ],
    recordName: (r) => `${r.plan} · ${r.customer}`,
    actions: [
      {
        key: "cancel",
        label: "Cancel membership",
        from: ["active"],
        to: "cancelled",
        variant: "danger",
        confirm: {
          kind: "destructive",
          title: "Cancel membership",
          description: "Prime benefits stop now. Any refund is a separate finance action.",
          confirmLabel: "Cancel membership",
          reason: { label: "Reason for cancelling", min: 3 },
        },
        toast: (r) => `Membership ${r.id.slice(-6)} cancelled.`,
      },
    ],
  },
  async list({ q, status, cursor, limit, from, to }) {
    // The API filters by status, the start of the payment reference, and the days started.
    const res = await api.get<{ items: ApiSubscription[]; nextCursor: string | null }>("/membership/subscriptions", {
      status: status || undefined,
      q: q?.trim() || undefined,
      from: from || undefined,
      to: to || undefined,
      cursor,
      limit,
    });
    return pageOf(res.items.map(subscriptionRow), res.nextCursor);
  },
  async transition(row, _key, _to, context) {
    const res = await api.post<{ subscription: ApiSubscription }>(`/membership/subscriptions/${row.id}/cancel`, {
      reason: context?.reason ?? "Cancelled from the admin panel",
    });
    return subscriptionRow(res.subscription);
  },
};

// ---------- Plans ----------

interface ApiPlan {
  id: string;
  name: string;
  pricePaise: number;
  durationDays: number;
  benefits: string[];
  status: "active" | "archived";
  rev: number;
}

export function planRow(p: ApiPlan): RecordRow {
  return {
    id: p.id,
    name: p.name,
    price: p.pricePaise,
    duration: p.durationDays,
    benefits: p.benefits.length ? p.benefits.join(", ") : "—",
    rev: p.rev,
    status: p.status,
  };
}

const planCreate: CreateSpec = {
  label: "Add plan",
  title: "Add Prime plan",
  description: "Existing subscriptions keep the price they were bought at.",
  fields: [
    { name: "name", label: "Plan name", kind: "text", required: true },
    { name: "price", label: "Price (₹)", kind: "money", required: true, min: 1 },
    { name: "duration", label: "Duration (days)", kind: "number", required: true, min: 1 },
    { name: "benefits", label: "Benefits", kind: "textarea", helper: "One per line. Optional." },
  ],
  status: "active",
  toRow: (v) => v,
  toast: (v) => `Plan "${v.name}" created.`,
};

export const plansService: LiveService = {
  canCreate: true,
  actions: ["archive"],
  searchPlaceholder: "Filter the plans…",
  createSpec: planCreate,
  viewPatch: {
    columns: [
      { key: "name", header: "Plan", primary: true },
      { key: "price", header: "Price", format: "inr" },
      { key: "duration", header: "Days", format: "count" },
      { key: "status", header: "Status", format: "status" },
    ],
    details: [
      { label: "Price", key: "price", format: "inr" },
      { label: "Duration (days)", key: "duration", format: "count" },
      { label: "Benefits", key: "benefits" },
    ],
  },
  async list({ q, status }) {
    const res = await api.get<{ items: ApiPlan[] }>("/membership/plans", { status: status === "active" || status === "archived" ? status : undefined });
    const needle = q?.trim().toLowerCase();
    const rows = res.items.map(planRow).filter((r) => !needle || String(r.name).toLowerCase().includes(needle));
    return { items: rows, nextCursor: null, total: rows.length };
  },
  async create(values) {
    const benefits = String(values.benefits ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const res = await api.post<{ plan: ApiPlan }>("/membership/plans", {
      name: String(values.name).trim(),
      pricePaise: Math.round(Number(values.price) * 100),
      durationDays: Number(values.duration),
      benefits,
    });
    return planRow(res.plan);
  },
  async transition(row) {
    const res = await api.patch<{ plan: ApiPlan }>(`/membership/plans/${row.id}`, { rev: Number(row.rev), status: "archived" });
    return planRow(res.plan);
  },
};
