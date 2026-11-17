import { api, idempotencyKey } from "@/lib/api";
import type { DeliveryRoute, Earnings } from "@/features/delivery/delivery.service";

/* Dispatch against femxo-backend: modules/delivery-runs (routes, hand-overs, reconciliation), /orders, /cod/tasks, /delivery/returns. */

export interface ReconAgentRow {
  agentUserId: string;
  deliveredStops: number;
  otpVerified: boolean;
  collectedCashPaise: number;
  stopCashPaise: number;
  handedOverPaise: number;
  cashVariancePaise: number;
  findings: string[];
}

export interface ReconRun {
  id: string;
  date: string;
  agents: ReconAgentRow[];
  findingCount: number;
  cashVariancePaise: number;
  ranAt?: string;
}

export interface OpenOrder {
  id: string;
  orderNumber: string;
  placedAt: string;
  status: string;
  itemCount: number;
}

export interface CodTask {
  id: string;
  orderId: string;
  orderNumber: string;
  status: string;
  escalationLevel: number;
  attempts: { at: string; by: string; note: string }[];
  nextActionAt: string | null;
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  quantity: number;
  reason: string;
  status: string;
  requestedAt: string;
}

export interface NewStop {
  orderId: string;
  recipientName: string;
  recipientPhone: string;
}

const keyed = () => ({ "Idempotency-Key": idempotencyKey() });

export const dispatchApi = {
  routes: (date: string) => api.get<{ items: DeliveryRoute[] }>("/delivery/routes", { date }).then((r) => r.items),
  createRoute: (key: string, body: { date: string; agentUserId: string; name: string; stops: NewStop[] }) =>
    api.post<{ route: DeliveryRoute; replayed: boolean }>("/delivery/routes", body, { "Idempotency-Key": key }).then((r) => r.route),
  optimize: (id: string) => api.post<{ route: DeliveryRoute }>(`/delivery/routes/${id}/optimize`).then((r) => r.route),
  start: (id: string) => api.post<{ route: DeliveryRoute }>(`/delivery/routes/${id}/start`, {}, keyed()).then((r) => r.route),
  close: (id: string) => api.post<{ route: DeliveryRoute }>(`/delivery/routes/${id}/close`, {}, keyed()).then((r) => r.route),
  /** Placed orders: the ones that may still have units to deliver (the API refuses the rest with NOTHING_TO_DELIVER). */
  openOrders: () => api.get<{ items: OpenOrder[] }>("/orders", { status: "placed", limit: 100 }).then((r) => r.items),
  earnings: (agentUserId: string, from: string, to: string) => api.get<Earnings>(`/delivery/agents/${encodeURIComponent(agentUserId)}/earnings`, { from, to }),
  handover: (key: string, body: { agentUserId: string; date: string; amountPaise: number; reference: string; reason?: string }) =>
    api.post<{ handover: { id: string }; replayed: boolean }>("/delivery/cash-handovers", body, { "Idempotency-Key": key }),
  runReconciliation: (date: string) => api.post<{ run: ReconRun }>("/delivery/reconciliation/run", { date }, keyed()).then((r) => r.run),
  latestReconciliation: (date: string) => api.get<{ run: ReconRun | null }>("/delivery/reconciliation/latest", { date }).then((r) => r.run),
  codTasks: (status?: string, cursor?: string) => api.get<{ items: CodTask[]; nextCursor: string | null }>("/cod/tasks", { status, cursor, limit: 50 }),
  returns: (status?: string, cursor?: string) => api.get<{ items: ReturnRequest[]; nextCursor: string | null }>("/delivery/returns", { status, cursor, limit: 50 }),
};
