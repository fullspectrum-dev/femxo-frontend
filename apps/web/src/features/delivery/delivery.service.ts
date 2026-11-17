import { api, idempotencyKey } from "@/lib/api";
import { AuthApiError } from "@/features/auth/services/auth-client";

/*
 * Delivery runs against femxo-backend (modules/delivery-runs, mounted at /delivery) and COD collection (/cod).
 * Shapes follow runs.service.ts `view`/`routeView`/`earnings` and cod.routes.ts.
 */

export type RouteStatus = "planned" | "out" | "closed";
export type StopStatus = "pending" | "delivered" | "failed";
export type FailReason = "not_home" | "refused" | "address_wrong" | "other";

export interface DeliveryStop {
  id: string;
  routeId: string;
  orderId: string;
  seq: number;
  recipientName: string;
  recipientPhone: string;
  status: StopStatus;
  otpSent: boolean;
  deliveredAt: string | null;
  failedReason: string | null;
  cashPaise: number;
}

export interface DeliveryRoute {
  id: string;
  date: string;
  agentUserId: string;
  name: string;
  status: RouteStatus;
  stops: DeliveryStop[];
}

export interface Earnings {
  agentUserId: string;
  from: string;
  to: string;
  deliveredStops: number;
  failedStops: number;
  cashCollectedPaise: number;
  cashHandedOverPaise: number;
  earningsPaise: number | null;
  reason: string | null;
}

export interface CodSummary {
  payablePaise: number;
  collectedPaise: number;
  outstandingPaise: number;
  status: string;
}

/** Today in India time, `YYYY-MM-DD` (the backend's `istDate`). */
export const istToday = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

const keyed = (key: string) => ({ "Idempotency-Key": key });

/** The request never got an answer (offline, timeout): safe to retry with the same key. */
export const isNetworkError = (error: unknown) =>
  error instanceof AuthApiError ? error.code === "NETWORK" || error.code === "TIMEOUT" : error instanceof TypeError;

export const errorCode = (error: unknown) => (error instanceof AuthApiError ? String(error.code) : "UNKNOWN");
export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong");

export const deliveryApi = {
  myRoutes: (date?: string) => api.get<{ items: DeliveryRoute[] }>("/delivery/me/routes", { date }).then((r) => r.items),
  myEarnings: (date?: string) => api.get<Earnings>("/delivery/me/earnings", { date }),
  startRoute: (id: string) => api.post<{ route: DeliveryRoute }>(`/delivery/routes/${id}/start`, {}, keyed(idempotencyKey())).then((r) => r.route),
  closeRoute: (id: string) => api.post<{ route: DeliveryRoute }>(`/delivery/routes/${id}/close`, {}, keyed(idempotencyKey())).then((r) => r.route),
  resendOtp: (stopId: string) => api.post<{ queued: boolean }>(`/delivery/stops/${stopId}/otp/resend`, {}, keyed(idempotencyKey())),
  /** `key` is kept by the caller (and the offline queue) so a replay never delivers twice. */
  deliver: (stopId: string, key: string, body: { otp: string; cash?: { amountPaise: number; reference: string } }) =>
    api.post<{ stop: DeliveryStop; replayed: boolean }>(`/delivery/stops/${stopId}/deliver`, body, keyed(key)),
  fail: (stopId: string, key: string, body: { reason: FailReason; note: string }) =>
    api.post<{ stop: DeliveryStop }>(`/delivery/stops/${stopId}/fail`, body, keyed(key)).then((r) => r.stop),
  codSummary: (orderId: string) => api.get<CodSummary>(`/cod/orders/${orderId}/payments`),
  collect: (orderId: string, body: { amountPaise: number; method: "cash" | "upi"; reference: string; evidenceKey?: string; collectionKey: string }) =>
    api.post<{ payment: unknown; summary: CodSummary }>(`/cod/orders/${orderId}/payments`, body),
  /** Presign, then PUT the file straight to storage. Returns the evidence key to send with the collection. */
  async uploadEvidence(orderId: string, file: File): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    let binary = "";
    for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
    const sha256Base64 = btoa(binary);
    const res = await api.post<{ key: string; upload: { url: string; headers: Record<string, string> } }>(`/cod/orders/${orderId}/evidence-upload`, {
      contentType: file.type,
      size: file.size,
      sha256Base64,
    });
    const put = await fetch(res.upload.url, { method: "PUT", headers: res.upload.headers, body: file });
    if (!put.ok) throw new Error("The photo could not be uploaded");
    return res.key;
  },
  /** The backend's offline contract (modules/sync): only `cod.collect` of the delivery work is a sync action type. */
  sync: (actions: { key: string; type: string; payload: unknown }[]) =>
    api.post<{ results: { key: string; status: "synced" | "failed" | "conflict"; code?: string; message?: string }[] }>("/sync/actions", { actions }),
};
