import { api } from "@/lib/api";
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

export const subscriptionsService: LiveService = {
  actions: ["cancel"],
  searchPlaceholder: "Filter the subscriptions on this page…",
  viewPatch: {
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
  async list({ status, cursor, limit }) {
    const res = await api.get<{ items: ApiSubscription[]; nextCursor: string | null }>("/membership/subscriptions", { cursor, limit });
    // The API has no status filter here; narrow the loaded page.
    return pageOf(res.items.map(subscriptionRow).filter((r) => !status || r.status === status), res.nextCursor);
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
