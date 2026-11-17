"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingSkeleton, StatCard, useToast } from "@/components/admin-ui";
import { describeError } from "../../data/error-messages";
import { formatDateTime } from "../../format";
import { latestReconciliation, runReconciliation } from "../../services/payments.api";
import { needsAttention, reconciliationKind } from "../../services/payments.mappers";
import type { ApiReconciliationRun } from "../../services/payments.mappers";
import { useCan } from "./PaymentExtras";

/** The last reconciliation report (our payments against Razorpay's of the last 48 hours), its differences, and Run now. */
export function ReconciliationView() {
  const toast = useToast();
  const canRun = useCan("payment.reconcile");
  const [state, setState] = useState<{ run: ApiReconciliationRun | null; status: "loading" | "ready" | "failed"; message?: string }>({ run: null, status: "loading" });
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    setState((s) => ({ ...s, status: "loading" }));
    latestReconciliation().then(
      (run) => setState({ run, status: "ready" }),
      (error) => setState({ run: null, status: "failed", message: describeError(error, "Couldn't load the report.") })
    );
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the report once when the tab opens
    load();
  }, [load]);

  async function runNow() {
    setRunning(true);
    try {
      const run = await runReconciliation();
      setState({ run, status: "ready" });
      const open = needsAttention(run);
      toast(open ? `Reconciliation done: ${open} difference${open === 1 ? "" : "s"} need a person.` : "Reconciliation done: nothing needs attention.");
    } catch (error) {
      toast(`${describeError(error, "Couldn't run the reconciliation.").replace(/\.$/, "")}. Nothing was changed.`, "error");
    } finally {
      setRunning(false);
    }
  }

  const { run, status } = state;
  const open = needsAttention(run);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader
          title="Gateway reconciliation"
          description="Compares our payments with Razorpay's of the last 48 hours. It heals a capture whose webhook never came, replays early webhook events and expires unpaid intents. It runs every day at 01:30 IST."
          action={
            canRun ? (
              <Button variant="primary" disabled={running || status === "loading"} onClick={() => void runNow()}>
                <RefreshCw size={16} aria-hidden="true" /> {running ? "Running…" : "Run now"}
              </Button>
            ) : (
              <Badge tone="neutral" plain>
                Run needs payment.reconcile
              </Badge>
            )
          }
        />
        {status === "loading" && !run ? (
          <LoadingSkeleton rows={3} label="Loading the report" />
        ) : status === "failed" ? (
          <ErrorState message={state.message ?? "Couldn't load the report."} action={<Button onClick={load}>Try again</Button>} />
        ) : !run ? (
          <EmptyState title="No report yet" message="The first one is saved after the daily run at 01:30 IST, or press Run now." />
        ) : (
          <div className="grid gap-4">
            <p className="text-[13px] fx-muted">
              Last run {formatDateTime(run.at)} · window {formatDateTime(run.from)} to {formatDateTime(run.to)}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Needs a person" value={String(open)} context={open ? "See the list below" : "All clear"} />
              <StatCard label="Checked at gateway" value={String(run.providerChecked)} context={`${run.localChecked} checked here`} />
              <StatCard label="Healed" value={String(run.healed)} context="Captures whose webhook was missed" />
              <StatCard label="Expired / replayed" value={`${run.expired} / ${run.replayed}`} context="Unpaid intents · early webhook events" />
            </div>
          </div>
        )}
      </Card>

      {run && status === "ready" ? (
        <Card>
          <CardHeader title="Differences" description={run.mismatches.length ? undefined : "Nothing differed between us and the gateway."} />
          {run.mismatches.length ? (
            <ul className="grid gap-3">
              {run.mismatches.map((m, index) => {
                const kind = reconciliationKind(m.kind);
                return (
                  <li key={`${m.kind}-${m.paymentId ?? m.providerPaymentId ?? index}`} className="rounded-[14px] border border-[var(--fx-border)] p-3 text-[13px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={kind.tone}>{kind.label}</Badge>
                      {m.paymentId ? <span className="fx-muted">Payment {m.paymentId}</span> : null}
                      {m.providerPaymentId ? <span className="fx-muted">Gateway {m.providerPaymentId}</span> : null}
                    </div>
                    <p className="mt-2 break-words">{m.detail}</p>
                    {kind.help ? <p className="mt-1 fx-muted">{kind.help}</p> : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
