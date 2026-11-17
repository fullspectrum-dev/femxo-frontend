"use client";

import { useState } from "react";
import { Badge, Button, Card, CardHeader, Drawer, ErrorState, PageHeader, StatCard, useToast } from "@/components/admin-ui";
import { financeApi } from "./finance.api";
import type { ReconciliationRun } from "./finance.api";
import { dateTime, errorText, money, SimpleTable, useAsync, useCan } from "./kit";

/** Settlement-to-ledger reconciliation: every settled commission record against the wallet credits it should have made. Report only. */
export function ReconciliationScreen() {
  const can = useCan();
  const toast = useToast();
  const runs = useAsync(() => financeApi.reconciliationRuns(), []);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    try {
      const out = await financeApi.runReconciliation();
      toast(out.mismatchCount === 0 ? `Reconciled ${out.recordsChecked} records: no mismatches.` : `${out.mismatchCount} mismatches found.`, out.mismatchCount === 0 ? "success" : "error");
      runs.reload();
      setOpen(out.id);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Reconciliation"
        description="Checks settled commission against wallet ledger credits. It reports only; nothing is changed. Company-wide scope is needed to run it."
        actions={can("finance.reconcile") ? <Button variant="primary" disabled={running} onClick={() => void run()}>{running ? "Running…" : "Run now"}</Button> : undefined}
      />
      <Card>
        <CardHeader title="Recent runs" />
        {runs.error ? <ErrorState message={errorText(runs.error)} action={<Button onClick={runs.reload}>Retry</Button>} /> : null}
        <SimpleTable
          rows={runs.data ?? []}
          rowKey={(r) => r.id}
          onRow={(r) => setOpen(r.id)}
          empty={runs.loading ? "Loading…" : "No runs yet."}
          cols={[
            { header: "Finished", cell: (r) => dateTime(r.finishedAt) },
            { header: "Records", align: "right", cell: (r) => r.recordsChecked },
            { header: "Expected", align: "right", hideOnMobile: true, cell: (r) => money(r.expectedPaise) },
            { header: "Actual", align: "right", hideOnMobile: true, cell: (r) => money(r.actualPaise) },
            { header: "Variance", align: "right", cell: (r) => money(r.variancePaise) },
            { header: "Result", cell: (r) => <MismatchBadge run={r} /> },
          ]}
        />
      </Card>
      <Drawer open={open !== null} onClose={() => setOpen(null)} title="Reconciliation run">
        {open ? <RunDetail id={open} /> : null}
      </Drawer>
    </div>
  );
}

function MismatchBadge({ run }: { run: ReconciliationRun }) {
  return run.mismatchCount === 0 ? <Badge tone="success">Clean</Badge> : <Badge tone="error">{run.mismatchCount} mismatches</Badge>;
}

function RunDetail({ id }: { id: string }) {
  const run = useAsync(() => financeApi.reconciliationRun(id), [id]);
  if (run.error) return <ErrorState message={errorText(run.error)} />;
  const r = run.data;
  if (!r) return <p className="fx-muted">Loading…</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Expected" value={money(r.expectedPaise)} />
        <StatCard label="Credited" value={money(r.actualPaise)} />
        <StatCard label="Variance" value={money(r.variancePaise)} />
        <StatCard label="Records checked" value={String(r.recordsChecked)} />
      </div>
      <p className="text-[13px] fx-muted">{dateTime(r.startedAt)} → {dateTime(r.finishedAt)}{r.truncated ? " · findings truncated" : ""}</p>
      <SimpleTable
        rows={r.findings ?? []}
        rowKey={(f) => `${f.recordId}-${f.beneficiary}-${f.kind}`}
        empty="No findings."
        cols={[
          { header: "Finding", cell: (f) => <><div>{f.kind.replace(/_/g, " ")}</div><div className="text-[12px] fx-muted">{f.recordId} · {f.beneficiary === "dealer" ? "Dealer" : "Sub-Dealer"}</div></> },
          { header: "Expected", align: "right", cell: (f) => money(f.expectedPaise) },
          { header: "Actual", align: "right", cell: (f) => money(f.actualPaise) },
        ]}
      />
    </div>
  );
}
