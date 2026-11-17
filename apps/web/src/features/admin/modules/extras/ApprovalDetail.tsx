"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/admin-ui";
import { api } from "@/lib/api";
import type { RecordRow } from "../../data/records";
import { formatDateTime } from "../../format";
import { territoryNames } from "../../services/lookups";

/* The full approval request (GET /approvals/:id): what the list row leaves out, read fresh when the drawer opens. */

interface ApiApprovalDetail {
  id: string;
  type: string;
  subject: { type: string; id: string };
  territoryPath?: string[];
  status: string;
  slaDueAt: string;
  nextEscalationAt?: string;
  decidedAt: string | null;
  decisionReason: string | null;
  overdue?: boolean;
  version?: number;
  createdAt: string;
}

export function ApprovalDetail({ row }: { row: RecordRow; onChanged: () => void }) {
  const [detail, setDetail] = useState<{ approval: ApiApprovalDetail; place: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get<{ approval: ApiApprovalDetail }>(`/approvals/${row.id}`)
      .then(async ({ approval }) => {
        const last = approval.territoryPath?.at(-1) ?? "";
        const places = last ? await territoryNames([last]) : new Map<string, string>();
        if (live) setDetail({ approval, place: places.get(last) ?? "—" });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [row.id, row.status]);

  if (failed) return <p className="text-[13px] fx-muted">Couldn&rsquo;t load the full request.</p>;
  if (!detail) return <p className="text-[13px] fx-muted">Loading the full request…</p>;
  const { approval, place } = detail;
  const items: [string, string][] = [
    ["Request type", approval.type],
    ["Subject", `${approval.subject.type} ${approval.subject.id}`],
    ["Territory", place],
    ["Raised", formatDateTime(approval.createdAt)],
    ["Decision due", formatDateTime(approval.slaDueAt)],
    ["Next escalation", approval.status === "pending" && approval.nextEscalationAt ? formatDateTime(approval.nextEscalationAt) : "—"],
  ];
  return (
    <section aria-label="Request details">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[15px] font-semibold">Request details</h3>
        {approval.status === "pending" && approval.overdue ? <Badge tone="error">Overdue</Badge> : null}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="fx-label">{label}</dt>
            <dd className="mt-1 break-words text-[13px] font-medium fx-num">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
