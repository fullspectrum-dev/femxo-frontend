import { authApi } from "@/features/auth";
import { api, idempotencyKey } from "@/lib/api";
import type { RecordRow } from "../data/records";
import type { CreateSpec } from "../modules/types";
import { pageOf, stepsOf } from "./shared";
import type { LiveService } from "./types";

/* Report jobs, notification templates and failed background jobs against femxo-backend. */

// ---------- Reports ----------

type JobStatus = "queued" | "running" | "done" | "failed";
interface ApiReportJob {
  id: string;
  type: string;
  format: "csv" | "pdf";
  params: { from: string; to: string };
  status: JobStatus;
  rowCount: number | null;
  truncated: boolean;
  error: string | null;
  createdAt: string;
}

const REPORT_LABEL: Record<string, string> = {
  "dealer-performance": "Dealer performance",
  "territory-sales": "Territory sales",
  "village-sales": "Sales by village or ward",
  "subdealer-performance": "Sub-dealer performance",
  "product-performance": "Product performance",
  membership: "Prime membership",
  profit: "Profit",
};
const REPORT_STATUS = { queued: "queued", running: "processing", done: "completed", failed: "failed" } as const;
const labelToType = new Map(Object.entries(REPORT_LABEL).map(([type, label]) => [label, type]));

export function reportRow(j: ApiReportJob): RecordRow {
  return {
    id: j.id,
    name: REPORT_LABEL[j.type] ?? j.type,
    range: `${j.params.from} to ${j.params.to}`,
    format: j.format.toUpperCase(),
    rows: j.rowCount,
    problem: j.error,
    requested: j.createdAt,
    status: REPORT_STATUS[j.status],
  };
}

/**
 * The permission each queued report needs (the backend's REPORT_PERMISSIONS). The sales reports read orders, so their permission
 * is taken from GET /reports/types (the `orders` entry) when it answers; membership and profit are not listed there.
 */
const REPORT_NEEDS: Record<string, string> = {
  "dealer-performance": "orders",
  "territory-sales": "orders",
  "village-sales": "orders",
  "subdealer-performance": "orders",
  "product-performance": "orders",
  membership: "membership.view",
  profit: "finance.report.view",
};

/** The reports the signed-in user may request: GET /reports/types plus their own permissions (GET /access/me). */
async function reportChoices(): Promise<string[]> {
  const [types, access] = await Promise.all([
    api.get<{ reports: { id: string; permission: string }[] }>("/reports/types").catch(() => ({ reports: [] })),
    authApi.access().catch(() => null),
  ]);
  const listed = new Map(types.reports.map((r) => [r.id, r.permission]));
  const held = (permission: string) => !access || access.isSuperAdmin || access.permissions.includes(permission);
  const allowed = Object.entries(REPORT_LABEL)
    .filter(([type]) => held(REPORT_NEEDS[type] === "orders" ? (listed.get("orders") ?? "order.view") : (REPORT_NEEDS[type] ?? "")))
    .map(([, label]) => label);
  return allowed.length ? allowed : [...labelToType.keys()];
}

const DATE = { regex: /^\d{4}-\d{2}-\d{2}$/, message: "Use the form 2026-11-01." };
const reportCreate: CreateSpec = {
  label: "Request report",
  title: "Request report",
  description: "Runs in the background and you are notified when the file is ready. Data is limited to your territory.",
  fields: [
    { name: "report", label: "Report", kind: "select", required: true, options: [...labelToType.keys()] },
    { name: "from", label: "From (YYYY-MM-DD)", kind: "text", required: true, placeholder: "2026-10-01", pattern: DATE },
    { name: "to", label: "To (YYYY-MM-DD)", kind: "text", required: true, placeholder: "2026-10-31", pattern: DATE },
    { name: "format", label: "Format", kind: "select", required: true, options: ["CSV", "PDF"] },
  ],
  validate: (v) => (v.from && v.to && v.from > v.to ? { to: "The end date can't be before the start date." } : {}),
  prepare: async () => ({ report: await reportChoices() }),
  status: "queued",
  toRow: (v) => v,
  toast: (v) => `"${v.report}" queued. You'll be notified when it's ready.`,
};

const REPORT_STEPS = ["Queued", "Running", "Ready to download"] as const;

export const reportsService: LiveService = {
  canCreate: true,
  actions: ["download"],
  searchPlaceholder: "Filter your reports on this page…",
  createSpec: reportCreate,
  viewPatch: {
    searchKeys: ["name", "range"],
    columns: [
      { key: "name", header: "Report", primary: true, sub: "range" },
      { key: "format", header: "Format" },
      { key: "requested", header: "Requested", format: "datetime" },
      { key: "status", header: "Status", format: "status" },
    ],
    statuses: ["queued", "processing", "completed", "failed"],
    details: [
      { label: "Range", key: "range" },
      { label: "Format", key: "format" },
      { label: "Rows", key: "rows", format: "count" },
      { label: "Problem", key: "problem" },
      { label: "Requested", key: "requested", format: "datetime" },
    ],
    timeline: {
      label: "Report progress",
      steps: (r) => {
        if (r.status === "failed") return stepsOf(REPORT_STEPS, 1, { failed: true, metas: { 1: String(r.problem ?? "Failed") } });
        const at = { queued: 0, processing: 1, completed: 3 } as Partial<Record<string, number>>;
        return stepsOf(REPORT_STEPS, at[r.status] ?? 0);
      },
    },
    actions: [{ key: "download", label: "Download", from: ["completed"], variant: "primary", toast: (r) => `Download of "${r.name}" started (link valid 5 minutes).` }],
  },
  async list({ q, status, limit }) {
    const res = await api.get<{ items: ApiReportJob[] }>("/reports/jobs", { limit: Math.max(limit, 20) });
    const needle = q?.trim().toLowerCase();
    const rows = res.items
      .map(reportRow)
      .filter((r) => (!status || r.status === status) && (!needle || [r.name, r.range].some((v) => String(v).toLowerCase().includes(needle))));
    return { items: rows, nextCursor: null, total: rows.length };
  },
  async create(values) {
    const type = labelToType.get(String(values.report));
    if (!type) throw new Error("Choose a report from the list.");
    const res = await api.post<{ job: ApiReportJob }>(
      "/reports/jobs",
      { type, format: String(values.format).toLowerCase(), params: { from: String(values.from), to: String(values.to) } },
      { "Idempotency-Key": idempotencyKey() }
    );
    return reportRow(res.job);
  },
  async transition(row) {
    // The API checks the permission again and answers with a link that works for 5 minutes.
    const res = await api.get<{ url: string }>(`/reports/jobs/${row.id}/download`);
    window.open(res.url, "_blank", "noopener");
    return row;
  },
};

// ---------- Notification templates ----------

interface ApiTemplate {
  id: string;
  event: string;
  channel: string;
  locale: string;
  version: number;
  status: "active" | "retired";
  vendorTemplateId: string | null;
  body: string;
  subject: string | null;
}

export function templateRow(t: ApiTemplate): RecordRow {
  return {
    id: t.id,
    name: t.event,
    key: `${t.locale} · v${t.version}`,
    channel: t.channel.toUpperCase(),
    dlt: t.vendorTemplateId,
    subject: t.subject,
    body: t.body,
    status: t.status === "retired" ? "archived" : "active",
  };
}

export const templatesService: LiveService = {
  actions: [],
  searchPlaceholder: "Filter the templates on this page…",
  viewPatch: {
    searchKeys: ["name", "channel", "key"],
    columns: [
      { key: "name", header: "Event", primary: true, sub: "key" },
      { key: "channel", header: "Channel" },
      { key: "dlt", header: "Vendor template ID", hideOnMobile: true },
      { key: "status", header: "Status", format: "status" },
    ],
    statuses: ["active", "archived"],
    details: [
      { label: "Channel", key: "channel" },
      { label: "Version", key: "key" },
      { label: "Vendor template ID", key: "dlt" },
      { label: "Subject", key: "subject" },
      { label: "Text", key: "body" },
    ],
    note: (r) => (r.channel === "SMS" ? "Indian SMS needs a DLT-registered template before it can be sent." : null),
    actions: [],
  },
  async list({ q, status }) {
    const res = await api.get<{ items: ApiTemplate[] }>("/notifications/templates");
    const needle = q?.trim().toLowerCase();
    const rows = res.items
      .map(templateRow)
      .filter((r) => (!status || r.status === status) && (!needle || [r.name, r.channel, r.key].some((v) => String(v).toLowerCase().includes(needle))));
    return { items: rows, nextCursor: null, total: rows.length };
  },
};

// ---------- Failed jobs (dead letters) ----------

interface ApiDeadLetter {
  id: string;
  queue: string;
  job: string;
  attemptsMade: number;
  failedReason: string | null;
}

export function deadLetterRow(d: ApiDeadLetter, status: "open" | "retried" = "open"): RecordRow {
  return { id: d.id, job: d.job, queue: d.queue, reason: d.failedReason, attempts: d.attemptsMade, failedAt: null, status };
}

export const deadLettersService: LiveService = {
  actions: ["retry"],
  searchPlaceholder: "Filter the failed jobs on this page…",
  viewPatch: {
    searchKeys: ["job", "queue", "reason"],
    columns: [
      { key: "job", header: "Job", primary: true, sub: "queue" },
      { key: "reason", header: "Reason" },
      { key: "attempts", header: "Attempts", format: "count" },
      { key: "status", header: "Status", format: "status" },
    ],
    details: [
      { label: "Queue", key: "queue" },
      { label: "Reason", key: "reason" },
      { label: "Attempts", key: "attempts", format: "count" },
    ],
  },
  async list({ q, limit }) {
    const res = await api.get<{ items: ApiDeadLetter[] }>("/admin/dead-letters", { limit: Math.max(limit, 50) });
    const needle = q?.trim().toLowerCase();
    const rows = res.items.map((d) => deadLetterRow(d)).filter((r) => !needle || [r.job, r.queue, r.reason].some((v) => String(v ?? "").toLowerCase().includes(needle)));
    return pageOf(rows, null);
  },
  async transition(row) {
    await api.post(`/admin/dead-letters/${encodeURIComponent(row.id)}/retry`, {});
    return { ...row, status: "retried" };
  },
};
