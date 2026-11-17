"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, StatusBadge, isStatusKey } from "@/components/admin-ui";
import { api } from "@/lib/api";
import type { RecordRow } from "../../data/records";
import { formatDateTime, formatINRExact } from "../../format";
import { userNames } from "../../services/lookups";
import type { ApiPage } from "../../services/payments.api";
import { flagLabel, humanizeCode } from "../../services/payments.mappers";
import type { ApiPayment } from "../../services/payments.mappers";
import { usePanel } from "../../shell/PanelContext";

/*
 * What the order drawer adds for orders placed in the customer app or held for a discount approval:
 * the online payment behind the order (GET /payments?reference=order:<id>) and the approval request
 * (GET /approvals/:id). Each part needs its own permission and simply says so when the call is refused.
 */

interface ApprovalBrief {
  status: string;
  assignedTo: string;
  slaDueAt: string;
  overdue?: boolean;
  decidedAt: string | null;
  decisionReason: string | null;
}

export function OrderPaymentInfo({ row }: { row: RecordRow; onChanged: () => void }) {
  const { to } = usePanel();
  const online = row.payment !== null && typeof row.payment === "string" && row.payment.startsWith("Online");
  const approvalId = typeof row.approvalId === "string" ? row.approvalId : null;
  const [payment, setPayment] = useState<{ state: "loading" | "none" | "denied" | "ready"; value?: ApiPayment }>({ state: online ? "loading" : "none" });
  const [approval, setApproval] = useState<{ brief: ApprovalBrief; who: string } | null>(null);

  useEffect(() => {
    if (!online) return;
    let live = true;
    api
      .get<ApiPage<ApiPayment>>("/payments", { reference: `order:${row.id}`, limit: 1 })
      .then((res) => live && setPayment(res.items[0] ? { state: "ready", value: res.items[0] } : { state: "none" }))
      .catch(() => live && setPayment({ state: "denied" }));
    return () => {
      live = false;
    };
  }, [online, row.id, row.status]);

  useEffect(() => {
    if (!approvalId) return;
    let live = true;
    api
      .get<{ approval: ApprovalBrief }>(`/approvals/${approvalId}`)
      .then(async ({ approval: brief }) => {
        const names = await userNames().catch(() => new Map<string, string>());
        if (live) setApproval({ brief, who: names.get(brief.assignedTo) ?? "—" });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [approvalId, row.status]);

  if (!online && !approvalId) return null;
  const p = payment.value;

  return (
    <div className="grid gap-6">
      {approvalId ? (
        <section aria-label="Discount approval" className="grid gap-2">
          <h3 className="text-[15px] font-semibold">Discount approval</h3>
          {approval ? (
            <p className="text-[13px]">
              {isStatusKey(approval.brief.status) ? <StatusBadge status={approval.brief.status} /> : <Badge>{humanizeCode(approval.brief.status)}</Badge>}{" "}
              Assigned to <strong>{approval.who}</strong>
              {approval.brief.status === "pending" ? ` · decide by ${formatDateTime(approval.brief.slaDueAt)}${approval.brief.overdue ? " (overdue)" : ""}` : ""}
              {approval.brief.decisionReason ? ` · “${approval.brief.decisionReason}”` : ""}
            </p>
          ) : (
            <p className="text-[13px] fx-muted">Loading the request…</p>
          )}
          <p className="text-[13px]">
            The approver approves or rejects it in{" "}
            <Link className="underline" href={`${to("/admin/approvals")}`}>
              Approvals
            </Link>
            . Approved: the order is placed. Rejected: it is cancelled with their reason.
          </p>
        </section>
      ) : null}

      {online ? (
        <section aria-label="Payment" className="grid gap-2">
          <h3 className="text-[15px] font-semibold">Payment</h3>
          {payment.state === "loading" ? (
            <p className="text-[13px] fx-muted">Loading the payment…</p>
          ) : payment.state === "denied" ? (
            <p className="text-[13px] fx-muted">Payment details need the payment.view permission.</p>
          ) : !p ? (
            <p className="text-[13px] fx-muted">No payment has been started for this order yet.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                <div>
                  <dt className="fx-label">Status</dt>
                  <dd className="mt-1">{isStatusKey(p.status) ? <StatusBadge status={p.status} /> : humanizeCode(p.status)}</dd>
                </div>
                <div>
                  <dt className="fx-label">Amount</dt>
                  <dd className="mt-1 text-[13px] font-medium fx-num">{formatINRExact(p.amountPaise)}</dd>
                </div>
                <div>
                  <dt className="fx-label">Refunded</dt>
                  <dd className="mt-1 text-[13px] font-medium fx-num">{formatINRExact(p.refundedPaise)}</dd>
                </div>
                <div className="col-span-2 min-w-0 sm:col-span-3">
                  <dt className="fx-label">Razorpay payment ID</dt>
                  <dd className="mt-1 break-words text-[13px] font-medium fx-num">{p.providerPaymentId ?? "Not paid yet"}</dd>
                </div>
              </dl>
              {p.flags.length ? (
                <p className="text-[13px]">
                  <Badge tone="warning">Flagged</Badge> {p.flags.map(flagLabel).join(", ")}
                </p>
              ) : null}
              <p className="text-[13px]">
                <Link className="underline" href={to("/admin/payments")}>
                  Open Payments
                </Link>{" "}
                to refund or look into it.
              </p>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
