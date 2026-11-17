"use client";

import { Check, Copy, Flag, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Badge, Button, Dialog, FormField, SelectInput, StatCard, StatusBadge, TextArea, TextInput, Timeline, isStatusKey, useToast } from "@/components/admin-ui";
import { api } from "@/lib/api";
import { describeError } from "../../data/error-messages";
import type { RecordRow } from "../../data/records";
import { formatDateTime, formatINRCompact, formatINRExact } from "../../format";
import { customerBrief, getPayment, newRefundKey, orderNumber, paymentsInPeriod, requestRefund } from "../../services/payments.api";
import type { CustomerBrief } from "../../services/payments.api";
import { approverOptions, approversFor } from "../../services/approvers";
import {
  FLAG_HELP,
  REFUND_NEXT_STEP,
  flagLabel,
  humanizeCode,
  isRefundable,
  needsRefundApproval,
  paiseToRupeesText,
  paymentTimeline,
  refundableLeft,
  rupeesToPaise,
  summarize,
} from "../../services/payments.mappers";
import type { ApiPayment, ApiRefund, PaymentSummary, RefundStatus } from "../../services/payments.mappers";
import { usePanel } from "../../shell/PanelContext";

/* The payments screens' extras: the summary above the list, the payment and refund detail drawers, and the refund form. */

/** True when the signed-in user holds the permission (a Super Admin holds all of them). */
export function useCan(permission: string): boolean {
  const { access } = usePanel();
  return access?.isSuperAdmin === true || access?.permissions.includes(permission) === true;
}

function CopyId({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-[12px] fx-muted hover:underline"
      aria-label={`Copy ${label}`}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1500);
          },
          () => undefined
        );
      }}
    >
      {done ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="fx-label">{label}</dt>
      <dd className="mt-1 break-words text-[13px] font-medium fx-num">{children}</dd>
    </div>
  );
}

// ---------- Summary cards ----------

/** Captured, failed, refunded and flagged totals for the chosen days (all loaded payments when no days are chosen). */
export function PaymentSummaryBanner({ from, to }: { from?: string; to?: string }) {
  const [state, setState] = useState<{ key: string; summary: PaymentSummary | null; capped: boolean; failed: boolean }>({ key: "", summary: null, capped: false, failed: false });
  const key = `${from ?? ""}|${to ?? ""}`;
  useEffect(() => {
    let live = true;
    paymentsInPeriod(from, to)
      .then(({ payments, capped }) => live && setState({ key, summary: summarize(payments), capped, failed: false }))
      .catch(() => live && setState({ key, summary: null, capped: false, failed: true }));
    return () => {
      live = false;
    };
  }, [key, from, to]);

  const loading = state.key !== key;
  const s = loading ? null : state.summary;
  const period = from || to ? `${from ?? "the start"} to ${to ?? "today"}` : "all payments loaded";
  const cell = (value: (x: PaymentSummary) => string, context: (x: PaymentSummary) => string) => ({
    value: s ? value(s) : "—",
    context: loading ? "Loading…" : s ? context(s) : "Couldn't load",
  });
  const captured = cell((x) => formatINRCompact(x.capturedPaise), (x) => `${x.capturedCount} payments`);
  const failed = cell((x) => formatINRCompact(x.failedPaise), (x) => `${x.failedCount} payments`);
  const refunded = cell((x) => formatINRCompact(x.refundedPaise), (x) => `${x.refundedCount} payments`);
  const flagged = cell((x) => String(x.flaggedCount), (x) => `${formatINRCompact(x.flaggedPaise)} to look at`);
  return (
    <section aria-label="Payment summary">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Captured" value={captured.value} context={captured.context} />
        <StatCard label="Failed" value={failed.value} context={failed.context} />
        <StatCard label="Refunded" value={refunded.value} context={refunded.context} />
        <StatCard label="Flagged" value={flagged.value} context={flagged.context} icon={Flag} />
      </div>
      <p className="mt-2 text-[12px] fx-muted" role={state.failed ? "alert" : undefined}>
        {state.failed
          ? "Couldn't load the totals. The list below still works."
          : `Period: ${period}. ${state.capped ? "Based on the latest 1,000 payments; older ones are not counted." : "The API has no totals call, so these add up the payments loaded."}`}
      </p>
    </section>
  );
}

// ---------- Payment detail ----------

interface Detail {
  payment: ApiPayment;
  refunds: ApiRefund[];
  customer: CustomerBrief | null;
  order: string | null;
}

export function PaymentDetail({ row, onChanged }: { row: RecordRow; onChanged: () => void }) {
  const { to } = usePanel();
  const canRefund = useCan("payment.refund");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [refunding, setRefunding] = useState(false);

  useEffect(() => {
    let live = true;
    getPayment(row.id)
      .then(async ({ payment, refunds }) => {
        const [customer, order] = await Promise.all([customerBrief(payment.customerId), payment.orderId ? orderNumber(payment.orderId) : Promise.resolve(null)]);
        if (live) {
          setDetail({ payment, refunds, customer, order });
          setFailed(null);
        }
      })
      .catch((error) => live && setFailed(describeError(error, "Couldn't load the payment.")));
    return () => {
      live = false;
    };
  }, [row.id, row.status, attempt]);

  if (failed)
    return (
      <p className="text-[13px] fx-muted" role="alert">
        {failed}{" "}
        <button type="button" className="underline" onClick={() => setAttempt((n) => n + 1)}>
          Retry
        </button>
      </p>
    );
  if (!detail) return <p className="text-[13px] fx-muted">Loading the payment…</p>;
  const { payment, refunds, customer, order } = detail;
  const left = refundableLeft(payment);

  return (
    <div className="grid gap-6">
      <section aria-label="Amounts">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Fact label="Amount">{formatINRExact(payment.amountPaise)}</Fact>
          <Fact label="Captured">{formatINRExact(payment.capturedPaise)}</Fact>
          <Fact label="Refunded">{formatINRExact(payment.refundedPaise)}</Fact>
          <Fact label="Left to refund">{formatINRExact(left)}</Fact>
        </dl>
      </section>

      {payment.flags.length ? (
        <section aria-label="Flags" className="grid gap-2">
          <h3 className="text-[15px] font-semibold">Needs a person</h3>
          {payment.flags.map((flag) => (
            <p key={flag} role="note" className="rounded-[14px] border border-[var(--fx-note-border)] bg-[var(--fx-lavender-surface)] p-3 text-[13px]">
              <span className="font-semibold">{flagLabel(flag)}.</span> {FLAG_HELP[flag] ?? "Check this payment before fulfilling the order."}
            </p>
          ))}
          {payment.mismatch ? (
            <p className="text-[13px]">
              We asked for <strong>{formatINRExact(payment.mismatch.expectedPaise)}</strong>; the gateway took{" "}
              <strong>
                {formatINRExact(payment.mismatch.actualPaise)} {payment.mismatch.currency !== "INR" ? payment.mismatch.currency : ""}
              </strong>{" "}
              on {formatDateTime(payment.mismatch.at)} (gateway payment {payment.mismatch.providerPaymentId}).
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-label="Payment progress">
        <h3 className="mb-3 text-[15px] font-semibold">Payment progress</h3>
        <Timeline label="Payment progress" steps={paymentTimeline(payment)} />
      </section>

      <section aria-label="Gateway details">
        <h3 className="mb-3 text-[15px] font-semibold">Gateway details</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact label="Razorpay order ID">
            {payment.providerOrderId} <CopyId text={payment.providerOrderId} label="Razorpay order ID" />
          </Fact>
          <Fact label="Razorpay payment ID">
            {payment.providerPaymentId ? (
              <>
                {payment.providerPaymentId} <CopyId text={payment.providerPaymentId} label="Razorpay payment ID" />
              </>
            ) : (
              "Not paid yet"
            )}
          </Fact>
          <Fact label="Reference">{payment.reference}</Fact>
          <Fact label="Method">{payment.method ? humanizeCode(payment.method) : "—"}</Fact>
          <Fact label="Started">{formatDateTime(payment.createdAt)}</Fact>
          <Fact label="Captured at">{payment.capturedAt ? formatDateTime(payment.capturedAt) : "—"}</Fact>
          {payment.failureReason ? <Fact label="Failure reason">{payment.failureReason}</Fact> : null}
        </dl>
      </section>

      <section aria-label="Customer and order">
        <h3 className="mb-3 text-[15px] font-semibold">Customer and order</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact label="Customer">
            {customer?.name ?? "Name hidden for your role"}
            <span className="block text-[12px] font-normal fx-muted">{payment.customerId}</span>
          </Fact>
          <Fact label={payment.purpose === "membership" ? "Bought" : "Order"}>
            {payment.purpose === "membership" ? (
              "Prime plan"
            ) : payment.orderId ? (
              <Link className="underline" href={to("/admin/orders")}>
                {order ?? payment.orderId}
              </Link>
            ) : (
              "—"
            )}
          </Fact>
        </dl>
      </section>

      <section aria-label="Refunds">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-semibold">Refunds</h3>
          {canRefund && isRefundable(payment) ? (
            <Button variant="secondary" size="sm" onClick={() => setRefunding(true)}>
              <RotateCcw size={14} aria-hidden="true" /> Refund
            </Button>
          ) : null}
        </div>
        {refunds.length === 0 ? (
          <p className="text-[13px] fx-muted">No refunds on this payment.</p>
        ) : (
          <ul className="grid gap-2">
            {refunds.map((refund) => (
              <li key={refund.id} className="rounded-[14px] border border-[var(--fx-border)] p-3 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{formatINRExact(refund.amountPaise)}</span>
                  {isStatusKey(refund.status) ? <StatusBadge status={refund.status} /> : <Badge>{humanizeCode(refund.status)}</Badge>}
                </div>
                <p className="mt-1 break-words fx-muted">“{refund.reason}”</p>
                <p className="mt-1 fx-muted">
                  {formatDateTime(refund.createdAt)} · {refund.source === "provider" ? "Made on the Razorpay dashboard" : "Staff"}
                </p>
                <p className="mt-1">{REFUND_NEXT_STEP[refund.status as RefundStatus]}</p>
              </li>
            ))}
          </ul>
        )}
        {!canRefund ? <p className="mt-2 text-[12px] fx-muted">Refunding needs the payment.refund permission.</p> : null}
      </section>

      {refunding ? (
        <RefundDialog
          payment={payment}
          customer={customer}
          onClose={() => setRefunding(false)}
          onDone={() => {
            setRefunding(false);
            setAttempt((n) => n + 1);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

// ---------- Refund form ----------

/** Partial or full refund. Above the approval threshold an approver is chosen first; the server has the final say. */
export function RefundDialog({ payment, customer, onClose, onDone }: { payment: ApiPayment; customer: CustomerBrief | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const left = refundableLeft(payment);
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amountText, setAmountText] = useState(paiseToRupeesText(left));
  const [reason, setReason] = useState("");
  const [approver, setApprover] = useState("");
  const [forceApprover, setForceApprover] = useState(false);
  const [key, setKey] = useState(newRefundKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvers, setApprovers] = useState<{ state: "idle" | "loading" | "ready" | "failed"; items: { value: string; label: string }[] }>({ state: "idle", items: [] });

  const amountPaise = mode === "full" ? left : rupeesToPaise(amountText);
  const amountError =
    amountPaise === null ? "Enter an amount in rupees, like 250 or 99.50." : amountPaise < 100 ? "The smallest refund is ₹1." : amountPaise > left ? `At most ${formatINRExact(left)} is left to refund.` : undefined;
  const approval = amountPaise !== null && (needsRefundApproval(amountPaise) || forceApprover);
  const reasonOk = reason.trim().length >= 3 && reason.trim().length <= 300;
  const canSend = !busy && !amountError && reasonOk && (!approval || approver !== "");

  // Fresh key whenever what is being asked changes: the same key with different details is refused as reused.
  const touch = () => setKey(newRefundKey());

  useEffect(() => {
    if (!approval || approvers.state !== "idle") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starts the one-off approver lookup the first time approval is needed
    setApprovers({ state: "loading", items: [] });
    approversFor("payment.refund", customer?.territoryPath ?? [])
      .then((list) => setApprovers({ state: "ready", items: approverOptions(list) }))
      .catch(() => setApprovers({ state: "failed", items: [] }));
  }, [approval, approvers.state, customer]);

  async function submit() {
    if (amountPaise === null || amountError) return;
    setBusy(true);
    setError(null);
    try {
      const { refund, replayed } = await requestRefund(payment.id, { amountPaise, reason, idempotencyKey: key, assignedTo: approval ? approver : undefined });
      toast(
        replayed
          ? "This refund was already sent."
          : refund.status === "awaiting_approval"
            ? `Refund of ${formatINRExact(refund.amountPaise)} sent for approval. Execute it from Refunds once it is approved.`
            : `Refund of ${formatINRExact(refund.amountPaise)} ${refund.status === "processed" ? "done" : "sent to Razorpay"}.`
      );
      onDone();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "APPROVER_REQUIRED") setForceApprover(true);
      setError(describeError(e, "Couldn't send the refund. Nothing was refunded."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Refund payment"
      description={`${formatINRExact(left)} of ${formatINRExact(payment.capturedPaise)} can still be refunded to the customer.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" disabled={!canSend} onClick={() => void submit()}>
            {busy ? "Sending…" : approval ? "Send for approval" : "Refund now"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div role="radiogroup" aria-label="Refund size" className="flex flex-wrap gap-2">
          {(["full", "partial"] as const).map((value) => (
            <Button
              key={value}
              variant={mode === value ? "primary" : "secondary"}
              role="radio"
              aria-checked={mode === value}
              onClick={() => {
                setMode(value);
                setAmountText(paiseToRupeesText(left));
                touch();
              }}
            >
              {value === "full" ? `Full · ${formatINRExact(left)}` : "Partial"}
            </Button>
          ))}
        </div>
        {mode === "partial" ? (
          <FormField label="Amount to refund (₹)" required error={amountError}>
            {({ inputId, describedBy, invalid }) => (
              <TextInput
                id={inputId}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                inputMode="decimal"
                value={amountText}
                onChange={(e) => {
                  setAmountText(e.target.value);
                  touch();
                }}
              />
            )}
          </FormField>
        ) : null}
        <FormField label="Reason" required helper="3 to 300 characters. Kept in the audit log.">
          {({ inputId, describedBy }) => (
            <TextArea
              id={inputId}
              aria-describedby={describedBy}
              rows={3}
              maxLength={300}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                touch();
              }}
            />
          )}
        </FormField>
        {approval ? (
          <FormField
            label="Who approves this refund?"
            required
            helper={
              approvers.state === "loading"
                ? "Loading…"
                : approvers.state === "failed"
                  ? "Couldn't load approvers. Close and try again."
                  : approvers.state === "ready" && approvers.items.length === 0
                    ? "No one else can approve refunds here. Ask an admin to give someone the approval.decide permission for this area."
                    : "Refunds of ₹5,000 or more need a second person. They decide under Approvals; then press Execute refund."
            }
          >
            {({ inputId, describedBy }) => (
              <SelectInput
                id={inputId}
                aria-describedby={describedBy}
                value={approver}
                disabled={approvers.state !== "ready"}
                onChange={(e) => {
                  setApprover(e.target.value);
                  touch();
                }}
              >
                <option value="">Choose…</option>
                {approvers.items.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </SelectInput>
            )}
          </FormField>
        ) : (
          <p className="text-[12px] fx-muted">Under ₹5,000 it is sent to Razorpay straight away.</p>
        )}
        {error ? (
          <p className="fx-field-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

// ---------- Refund detail ----------

interface ApprovalBrief {
  status: string;
  decisionReason: string | null;
  decidedAt: string | null;
}

export function RefundDetail({ row }: { row: RecordRow; onChanged: () => void }) {
  const { to } = usePanel();
  const [approval, setApproval] = useState<ApprovalBrief | null>(null);
  const approvalId = typeof row.approvalId === "string" ? row.approvalId : null;
  const loadApproval = useCallback(() => {
    if (!approvalId) return () => undefined;
    let live = true;
    api
      .get<{ approval: ApprovalBrief }>(`/approvals/${approvalId}`)
      .then((res) => live && setApproval(res.approval))
      .catch(() => live && setApproval(null));
    return () => {
      live = false;
    };
  }, [approvalId]);
  useEffect(() => loadApproval(), [loadApproval, row.status]);

  const next = useMemo(() => REFUND_NEXT_STEP[row.status as RefundStatus], [row.status]);
  return (
    <section aria-label="Refund details" className="grid gap-3">
      <h3 className="text-[15px] font-semibold">What happens next</h3>
      <p className="text-[13px]">{next}</p>
      {row.problem ? (
        <p className="fx-field-error" role="alert">
          Razorpay said: {String(row.problem)}
        </p>
      ) : null}
      {approvalId ? (
        <p className="text-[13px]">
          Approval:{" "}
          <strong>{approval ? humanizeCode(approval.status) : "…"}</strong>
          {approval?.decisionReason ? ` · “${approval.decisionReason}”` : ""}
          {approval?.decidedAt ? ` · ${formatDateTime(approval.decidedAt)}` : ""} ·{" "}
          <Link className="underline" href={to("/admin/approvals")}>
            Open Approvals
          </Link>
        </p>
      ) : null}
      <p className="text-[12px] fx-muted">
        Payment {String(row.paymentId)}
        {row.providerRefundId ? ` · Razorpay refund ${String(row.providerRefundId)}` : ""}
      </p>
    </section>
  );
}
