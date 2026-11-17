"use client";

import { useEffect, useState } from "react";
import { Badge, Card, CardHeader } from "@/components/admin-ui";
import { api } from "@/lib/api";
import { formatCount, formatDateTime } from "../format";

/*
 * How far the dashboard can be trusted: GET /dashboard/status (refresh cycle, backlog, stale) for anyone with
 * dashboard.view, and GET /dashboard/reconciliation/latest (last nightly check) for dashboard.manage.
 */

interface Status {
  lastCycleFinishedAt: string | null;
  cycleDurationMs: number | null;
  backlog: Record<string, number>;
  oldestDirtyAgeSeconds: number;
  stale: boolean;
}
interface Run {
  businessDates: string[];
  bucketsChecked: number;
  mismatchTotal: number;
  corrected: number;
  consistencyBreaks: number;
  truncated: boolean;
  repeatedDrift: boolean;
  startedAt: string;
  finishedAt: string | null;
}

const minutes = (seconds: number) => (seconds < 90 ? `${seconds}s` : `${Math.round(seconds / 60)} min`);

export function DataHealth({ held, tick }: { held: string; tick: number }) {
  const can = (permission: string) => held === "*" || held.split(",").includes(permission);
  const viewStatus = can("dashboard.view");
  const viewRuns = can("dashboard.manage");
  const [status, setStatus] = useState<Status | null>(null);
  const [run, setRun] = useState<Run | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    if (viewStatus) api.get<{ data: Status }>("/dashboard/status").then((res) => live && setStatus(res.data)).catch(() => undefined);
    if (viewRuns) api.get<{ run: Run | null }>("/dashboard/reconciliation/latest").then((res) => live && setRun(res.run)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [viewStatus, viewRuns, tick]);

  if (!status && run === undefined) return null;
  const waiting = status ? Object.values(status.backlog).reduce((a, b) => a + b, 0) : 0;

  return (
    <Card>
      <CardHeader title="Data freshness" description="How up to date the summaries above are." />
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {status ? (
          <dl className="grid gap-2 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <dt className="fx-muted">Summaries</dt>
              <dd>{status.stale ? <Badge tone="warning">Delayed</Badge> : <Badge tone="success">Up to date</Badge>}</dd>
            </div>
            <div>
              <dt className="fx-muted">Last refresh finished</dt>
              <dd className="font-medium">
                {status.lastCycleFinishedAt ? formatDateTime(status.lastCycleFinishedAt) : "Never"}
                {status.cycleDurationMs !== null ? ` · took ${minutes(Math.round(status.cycleDurationMs / 1000))}` : ""}
              </dd>
            </div>
            <div>
              <dt className="fx-muted">Waiting to be recomputed</dt>
              <dd className="font-medium">{waiting ? `${formatCount(waiting)} · oldest ${minutes(status.oldestDirtyAgeSeconds)}` : "Nothing"}</dd>
            </div>
          </dl>
        ) : null}
        {run !== undefined ? (
          <dl className="grid gap-2 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <dt className="fx-muted">Nightly check</dt>
              <dd>
                {run === null ? (
                  <Badge tone="neutral">Not run yet</Badge>
                ) : run.repeatedDrift ? (
                  <Badge tone="error">Drift two nights running</Badge>
                ) : run.mismatchTotal ? (
                  <Badge tone="warning">Differences corrected</Badge>
                ) : (
                  <Badge tone="success">Matched</Badge>
                )}
              </dd>
            </div>
            {run ? (
              <>
                <div>
                  <dt className="fx-muted">Last run</dt>
                  <dd className="font-medium">{formatDateTime(run.finishedAt ?? run.startedAt)}</dd>
                </div>
                <div>
                  <dt className="fx-muted">Result</dt>
                  <dd className="font-medium">
                    {formatCount(run.bucketsChecked)} checked · {formatCount(run.mismatchTotal)} differences · {formatCount(run.corrected)} corrected
                    {run.consistencyBreaks ? ` · ${formatCount(run.consistencyBreaks)} roll-ups recomputed` : ""}
                    {run.truncated ? " · not everything was checked" : ""}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        ) : null}
      </div>
    </Card>
  );
}
