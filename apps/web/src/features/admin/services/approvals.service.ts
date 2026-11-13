import { api } from "@/lib/api";
import type { RecordRow } from "../data/records";
import { userNames } from "./lookups";
import { pageOf } from "./shared";
import type { LiveService } from "./types";

/*
 * The maker-checker queue (/approvals): every request that needs a second person, inside the
 * caller's territories. Approve and reject both need a written reason (kept in the audit log).
 */

interface ApiApproval {
  id: string;
  type: string;
  subject: { type: string; id: string };
  createdBy: string;
  assignedTo: string;
  status: "pending" | "approved" | "rejected";
  slaDueAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  overdue: boolean;
  createdAt: string;
}

/** `cod.write_off` → `Cod write off`. The API sends machine names; people read words. */
export const humanize = (value: string) => {
  const words = value.replace(/[._-]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : value;
};

const people = () => userNames().catch(() => new Map<string, string>());

function toRow(a: ApiApproval, who: Map<string, string>): RecordRow {
  return {
    id: a.id,
    kind: humanize(a.type),
    subject: `${humanize(a.subject.type)} · ${a.subject.id.slice(-8)}`,
    maker: who.get(a.createdBy) ?? "—",
    checker: who.get(a.assignedTo) ?? "—",
    due: a.slaDueAt,
    sla: a.status === "pending" ? (a.overdue ? "Overdue" : "On time") : "—",
    decidedBy: a.decidedBy ? (who.get(a.decidedBy) ?? "—") : null,
    decidedAt: a.decidedAt,
    decision: a.decisionReason,
    created: a.createdAt,
    status: a.status,
  };
}

export const approvalsService: LiveService = {
  actions: ["approve", "reject"],
  searchPlaceholder: "Filter the requests on this page…",
  async list({ q, status, cursor, limit }) {
    const res = await api.get<{ items: ApiApproval[]; nextCursor: string | null }>("/approvals", { status, cursor, limit });
    const who = await people();
    const needle = q?.trim().toLowerCase();
    const rows = res.items
      .map((a) => toRow(a, who))
      .filter((row) => !needle || [row.kind, row.subject, row.maker, row.checker].some((v) => String(v).toLowerCase().includes(needle)));
    return pageOf(rows, res.nextCursor);
  },
  async transition(row, actionKey, _to, context) {
    const res = await api.post<{ approval: ApiApproval }>(`/approvals/${row.id}/${actionKey}`, { reason: context?.reason ?? "" });
    return toRow(res.approval, await people());
  },
};

/** How many requests wait for a decision (the first page only, so "20+" when there are more). */
export async function pendingApprovals(): Promise<{ count: number; more: boolean; overdue: number }> {
  const res = await api.get<{ items: ApiApproval[]; nextCursor: string | null }>("/approvals", { status: "pending", limit: 100 });
  return { count: res.items.length, more: res.nextCursor !== null, overdue: res.items.filter((a) => a.overdue).length };
}
