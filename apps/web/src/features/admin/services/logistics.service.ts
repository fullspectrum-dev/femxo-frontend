import { api } from "@/lib/api";
import type { RecordRow } from "../data/records";
import { userNames } from "./lookups";
import { pageOf } from "./shared";
import type { LiveService } from "./types";

/*
 * The last mile against femxo-backend: return requests (/delivery/returns), the day's delivery
 * routes (/delivery/routes) and cash-on-delivery recovery (/cod/tasks).
 */

const people = () => userNames().catch(() => new Map<string, string>());

/** Order id → order number, one lookup per order, cached for the page load. A failure shows a short id. */
const orderNumbers = new Map<string, Promise<string>>();
function orderNumber(id: string): Promise<string> {
  let hit = orderNumbers.get(id);
  if (!hit) {
    hit = api
      .get<{ order: { orderNumber: string } }>(`/orders/${id}`)
      .then((res) => res.order.orderNumber)
      .catch(() => {
        orderNumbers.delete(id);
        return `#${id.slice(-6).toUpperCase()}`;
      });
    orderNumbers.set(id, hit);
  }
  return hit;
}

// ---------- Returns ----------

interface ApiReturn {
  id: string;
  orderId: string;
  orderItemId: string;
  quantity: number;
  reason: string;
  status: "requested" | "approved" | "rejected";
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
}

async function returnRow(r: ApiReturn, who: Map<string, string>): Promise<RecordRow> {
  return {
    id: r.id,
    order: await orderNumber(r.orderId),
    units: r.quantity,
    reason: r.reason,
    requestedBy: who.get(r.requestedBy) ?? "—",
    requested: r.requestedAt,
    decidedBy: r.decidedBy ? (who.get(r.decidedBy) ?? "—") : null,
    decision: r.decisionReason,
    status: r.status,
  };
}

export const returnsService: LiveService = {
  actions: ["approve", "reject"],
  searchPlaceholder: "Filter the returns on this page…",
  async list({ q, status, cursor, limit }) {
    const res = await api.get<{ items: ApiReturn[]; nextCursor: string | null }>("/delivery/returns", { status, cursor, limit });
    const who = await people();
    const needle = q?.trim().toLowerCase();
    const rows = (await Promise.all(res.items.map((r) => returnRow(r, who)))).filter(
      (row) => !needle || [row.order, row.reason, row.requestedBy].some((v) => String(v).toLowerCase().includes(needle))
    );
    return pageOf(rows, res.nextCursor);
  },
  async transition(row, actionKey, _to, context) {
    const res = await api.post<{ request: ApiReturn }>(`/delivery/returns/${row.id}/decision`, {
      decision: actionKey === "approve" ? "approve" : "reject",
      reason: context?.reason ?? "",
    });
    return returnRow(res.request, await people());
  },
};

// ---------- Delivery routes ----------

interface ApiStop {
  id: string;
  orderId: string;
  seq: number;
  recipientName: string;
  status: "pending" | "delivered" | "failed";
  otpSent: boolean;
  deliveredAt: string | null;
  failedReason: string | null;
  cashPaise?: number;
}
interface ApiRoute {
  id: string;
  date: string;
  agentUserId: string;
  name: string;
  status: "planned" | "out" | "closed";
  stops: ApiStop[];
}

/** Today in India time, as the API counts days. */
export const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

function routeRow(r: ApiRoute, who: Map<string, string>): RecordRow {
  const count = (status: ApiStop["status"]) => r.stops.filter((s) => s.status === status).length;
  const delivered = count("delivered");
  return {
    id: r.id,
    name: r.name,
    agent: who.get(r.agentUserId) ?? "—",
    date: r.date,
    stops: r.stops.length,
    delivered,
    failed: count("failed"),
    pending: count("pending"),
    progress: r.stops.length ? `${Math.round((delivered / r.stops.length) * 100)}%` : "—",
    cash: r.stops.reduce((sum, s) => sum + (s.cashPaise ?? 0), 0),
    status: r.status,
  };
}

/** The routes of one day (the search box takes a date, YYYY-MM-DD; empty means today). */
export async function routesOf(date: string): Promise<RecordRow[]> {
  const res = await api.get<{ items: ApiRoute[] }>("/delivery/routes", { date });
  const who = await people();
  return res.items.map((r) => routeRow(r, who));
}

export const routesService: LiveService = {
  actions: [],
  searchPlaceholder: "Day to show, YYYY-MM-DD (today when empty)",
  async list({ q, status }) {
    const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q.trim()) ? q.trim() : istToday();
    const rows = (await routesOf(date)).filter((row) => !status || row.status === status);
    return pageOf(rows, null);
  },
};

// ---------- COD recovery ----------

interface ApiTask {
  id: string;
  orderNumber: string;
  ownerDealerId: string | null;
  ownerSubDealerId: string | null;
  status: "open" | "escalated" | "investigation" | "liability" | "recovered" | "written_off" | "closed";
  escalationLevel: number;
  attempts: { at: string; by: string; note: string }[];
  nextActionAt: string | null;
  investigation: { findings: string | null };
  liability: { beneficiary: "dealer" | "subDealer" | null; amountPaise: number | null };
  approvalKind: "recovery" | "write_off" | null;
  closedReason: string | null;
  createdAt: string;
}

function taskRow(t: ApiTask): RecordRow {
  return {
    id: t.id,
    order: t.orderNumber,
    owner: t.ownerSubDealerId ?? t.ownerDealerId ?? "Company",
    level: t.escalationLevel,
    attempts: t.attempts.length,
    lastAttempt: t.attempts.at(-1)?.note ?? null,
    next: t.nextActionAt,
    findings: t.investigation.findings,
    liable: t.liability.beneficiary === "subDealer" ? "Sub-dealer" : t.liability.beneficiary === "dealer" ? "Dealer" : "—",
    liability: t.liability.amountPaise,
    plan: t.approvalKind === "write_off" ? "Write-off" : t.approvalKind === "recovery" ? "Recover from wallet" : "—",
    created: t.createdAt,
    status: t.status,
  };
}

const TASK_CALL: Record<string, { path: string; body: (reason: string) => Record<string, string> }> = {
  attempt: { path: "attempts", body: (note) => ({ note }) },
  escalate: { path: "escalate", body: (reason) => ({ reason }) },
  investigate: { path: "investigate", body: (findings) => ({ findings }) },
  execute: { path: "execute", body: () => ({}) },
};

export const codTasksService: LiveService = {
  actions: ["attempt", "escalate", "investigate", "execute"],
  searchPlaceholder: "Filter the tasks on this page…",
  async list({ q, status, cursor, limit }) {
    const res = await api.get<{ items: ApiTask[]; nextCursor: string | null }>("/cod/tasks", { status, cursor, limit });
    const needle = q?.trim().toLowerCase();
    const rows = res.items.map(taskRow).filter((row) => !needle || [row.order, row.owner].some((v) => String(v).toLowerCase().includes(needle)));
    return pageOf(rows, res.nextCursor);
  },
  async transition(row, actionKey, _to, context) {
    const call = TASK_CALL[actionKey];
    if (!call) throw new Error(`Unknown action ${actionKey}`);
    const res = await api.post<{ task: ApiTask }>(`/cod/tasks/${row.id}/${call.path}`, call.body(context?.reason ?? ""));
    return taskRow(res.task);
  },
};
