import { api } from "@/lib/api";
import type { RecordRow } from "../data/records";
import { pageOf } from "./shared";
import type { LiveService } from "./types";

/* Audit log, security events, notification delivery log and vendor status against femxo-backend (read only). */

// ---------- Audit log (GET /admin/audit-logs, audit.view) ----------

interface ApiAuditEntry {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  requestId: string | null;
  at: string;
}

export function auditRow(a: ApiAuditEntry): RecordRow {
  return { id: a.id, action: a.action, entity: `${a.entityType} · ${a.entityId}`, actor: a.actorId, reason: a.reason, requestId: a.requestId, at: a.at, status: "logged" };
}

export const auditLogService: LiveService = {
  actions: [],
  searchPlaceholder: "Exact action (role.update) or record ID",
  viewPatch: {
    columns: [
      { key: "action", header: "Action", primary: true },
      { key: "entity", header: "Record" },
      { key: "actor", header: "Actor (user ID)" },
      { key: "at", header: "Time", format: "datetime" },
    ],
    details: [
      { label: "Record", key: "entity" },
      { label: "Actor (user ID)", key: "actor" },
      { label: "Reason", key: "reason" },
      { label: "Request ID", key: "requestId" },
      { label: "Time", key: "at", format: "datetime" },
    ],
  },
  async list({ q, cursor, limit }) {
    const needle = q?.trim();
    // The API filters exactly: an action looks like `module.verb`, anything else is taken as a record ID.
    const filter = needle ? (/^[a-z_]+(\.[a-z_-]+)+$/.test(needle) ? { action: needle } : { entityId: needle }) : {};
    const res = await api.get<{ items: ApiAuditEntry[]; nextCursor: string | null }>("/admin/audit-logs", { limit: Math.min(limit, 100), ...(cursor ? { cursor } : {}), ...filter });
    return pageOf(res.items.map(auditRow), res.nextCursor);
  },
};

// ---------- Security events (GET /admin/security-events, security.view) ----------

interface ApiSecurityEvent {
  id: string;
  type: string;
  severity: string;
  outcome: "blocked" | "logged";
  userId: string | null;
  emailMasked: string | null;
  ipMasked: string | null;
  meta: Record<string, unknown>;
  at: string;
}

const EVENT_LABEL: Record<string, string> = {
  login_failed_burst: "Repeated failed logins",
  ip_blocked: "IP blocked",
  account_locked: "Account locked",
  role_changed: "Roles changed",
  permission_denied: "Permission denied",
  session_revoked: "Session revoked",
  super_admin_override: "Super Admin override",
  secret_rotated: "Secret rotated",
};
const labelToEventType = new Map(Object.entries(EVENT_LABEL).map(([type, label]) => [label.toLowerCase(), type]));

export function securityRow(e: ApiSecurityEvent): RecordRow {
  return {
    id: e.id,
    event: EVENT_LABEL[e.type] ?? e.type,
    severity: e.severity,
    actor: e.userId ?? e.emailMasked ?? "—",
    ip: e.ipMasked,
    meta: Object.keys(e.meta).length ? JSON.stringify(e.meta) : null,
    at: e.at,
    status: e.outcome,
  };
}

export const securityEventsService: LiveService = {
  actions: [],
  searchPlaceholder: "Event type (e.g. Account locked) or user ID",
  viewPatch: {
    columns: [
      { key: "event", header: "Event", primary: true, sub: "severity" },
      { key: "actor", header: "User" },
      { key: "ip", header: "IP (masked)" },
      { key: "at", header: "Time", format: "datetime" },
      { key: "status", header: "Outcome", format: "status" },
    ],
    details: [
      { label: "Severity", key: "severity" },
      { label: "User", key: "actor" },
      { label: "IP (masked)", key: "ip" },
      { label: "Details", key: "meta" },
      { label: "Time", key: "at", format: "datetime" },
    ],
  },
  async list({ q, status, cursor, limit }) {
    const needle = q?.trim();
    const type = needle ? labelToEventType.get(needle.toLowerCase()) ?? (needle in EVENT_LABEL ? needle : undefined) : undefined;
    const filter = needle ? (type ? { type } : { userId: needle }) : {};
    const res = await api.get<{ items: ApiSecurityEvent[]; nextCursor: string | null }>("/admin/security-events", { limit: Math.min(limit, 100), ...(cursor ? { cursor } : {}), ...filter });
    // The outcome is not an API filter: narrowed on the page.
    return pageOf(res.items.map(securityRow).filter((r) => !status || r.status === status), res.nextCursor);
  },
};

// ---------- Notification deliveries (GET /notifications/deliveries, notification.view) ----------

type ApiDeliveryStatus = "pending" | "sending" | "sent" | "delivered" | "read" | "failed" | "bounced" | "skipped";
interface ApiDelivery {
  id: string;
  event: string;
  entityId: string;
  recipientUserId: string;
  channel: string;
  status: ApiDeliveryStatus;
  provider: string | null;
  providerMessageId: string | null;
  attempts: number;
  reason: string | null;
  lastError: string | null;
  failedCode: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
}

const DELIVERY_STATUS = { pending: "queued", sending: "processing", sent: "sent", delivered: "delivered", read: "delivered", failed: "failed", bounced: "failed", skipped: "cancelled" } as const;
const DELIVERY_FILTER: Record<string, ApiDeliveryStatus> = { queued: "pending", processing: "sending", sent: "sent", delivered: "delivered", failed: "failed", cancelled: "skipped" };
const CHANNELS = ["in_app", "sms", "whatsapp", "email", "push"];

export function deliveryRow(d: ApiDelivery): RecordRow {
  return {
    id: d.id,
    template: d.event,
    channel: d.channel.toUpperCase().replace("_", "-"),
    provider: d.provider,
    recipient: d.recipientUserId,
    attempts: d.attempts,
    problem: [d.reason, d.lastError, d.failedCode].filter(Boolean).join(" · ") || null,
    entity: d.entityId,
    at: d.createdAt,
    sentAt: d.sentAt,
    deliveredAt: d.deliveredAt,
    status: DELIVERY_STATUS[d.status],
  };
}

export const deliveriesService: LiveService = {
  actions: [],
  searchPlaceholder: "Channel (sms, email…) or recipient user ID",
  viewPatch: {
    columns: [
      { key: "template", header: "Event", primary: true, sub: "channel" },
      { key: "provider", header: "Provider" },
      { key: "recipient", header: "Recipient (user ID)", hideOnMobile: true },
      { key: "attempts", header: "Attempts", format: "count" },
      { key: "at", header: "Created", format: "datetime", hideOnMobile: true },
      { key: "status", header: "Status", format: "status" },
    ],
    statuses: ["queued", "processing", "sent", "delivered", "failed", "cancelled"],
    details: [
      { label: "Channel", key: "channel" },
      { label: "Provider", key: "provider" },
      { label: "Recipient (user ID)", key: "recipient" },
      { label: "About record", key: "entity" },
      { label: "Attempts", key: "attempts", format: "count" },
      { label: "Problem", key: "problem" },
      { label: "Created", key: "at", format: "datetime" },
      { label: "Sent", key: "sentAt", format: "datetime" },
      { label: "Delivered", key: "deliveredAt", format: "datetime" },
    ],
    actions: [],
  },
  async list({ q, status, cursor, limit }) {
    const needle = q?.trim().toLowerCase().replace("-", "_");
    const filter = needle ? (CHANNELS.includes(needle) ? { channel: needle } : { recipientUserId: q!.trim() }) : {};
    const apiStatus = status ? DELIVERY_FILTER[status] : undefined;
    const res = await api.get<{ items: ApiDelivery[]; nextCursor: string | null }>("/notifications/deliveries", {
      limit: Math.min(limit, 100),
      ...(cursor ? { cursor } : {}),
      ...(apiStatus ? { status: apiStatus } : {}),
      ...filter,
    });
    return pageOf(res.items.map(deliveryRow), res.nextCursor);
  },
};

// ---------- Integrations (GET /admin/integrations, Super Admin only) ----------

interface ApiIntegration {
  key: string;
  name: string;
  kind: string;
  provider: string;
  configured: boolean;
  fake: boolean;
  status: "operational" | "degraded" | "fake" | "not_configured";
  missingSettings: string[];
  recent: { hours: number; total: number; byStatus: Record<string, number> } | null;
  deadLetters: number;
  lastFailureAt: string | null;
}

const INTEGRATION_STATUS = { operational: "healthy", degraded: "degraded", fake: "draft", not_configured: "disabled" } as const;

export function integrationRow(i: ApiIntegration): RecordRow {
  return {
    id: i.key,
    name: i.name,
    provider: i.provider,
    mode: i.configured ? "Live" : i.fake ? "Fake (test mode)" : "Not configured",
    recent: i.recent ? `${i.recent.total} in ${i.recent.hours}h${i.recent.byStatus.failed ? ` · ${i.recent.byStatus.failed} failed` : ""}` : null,
    deadLetters: i.deadLetters,
    lastFailure: i.lastFailureAt,
    missing: i.missingSettings.length ? i.missingSettings.join(", ") : null,
    status: INTEGRATION_STATUS[i.status],
  };
}

export const integrationsService: LiveService = {
  actions: [],
  searchPlaceholder: "Filter vendors…",
  viewPatch: {
    searchKeys: ["name", "provider"],
    columns: [
      { key: "name", header: "Integration", primary: true, sub: "provider" },
      { key: "mode", header: "Mode" },
      { key: "recent", header: "Last 24h", hideOnMobile: true },
      { key: "deadLetters", header: "Failed jobs", format: "count" },
      { key: "status", header: "Status", format: "status" },
    ],
    statuses: ["healthy", "degraded", "draft", "disabled"],
    details: [
      { label: "Provider", key: "provider" },
      { label: "Mode", key: "mode" },
      { label: "Last 24h", key: "recent" },
      { label: "Failed jobs", key: "deadLetters", format: "count" },
      { label: "Last failure", key: "lastFailure", format: "datetime" },
      { label: "Settings missing", key: "missing" },
    ],
    note: () => "Secrets are never shown: only whether each setting is present. Set them in the server's environment or secrets manager.",
    actions: [],
  },
  async list({ q, status }) {
    const res = await api.get<{ items: ApiIntegration[] }>("/admin/integrations");
    const needle = q?.trim().toLowerCase();
    const rows = res.items.map(integrationRow).filter((r) => (!status || r.status === status) && (!needle || [r.name, r.provider].some((v) => String(v).toLowerCase().includes(needle))));
    return pageOf(rows, null);
  },
};
