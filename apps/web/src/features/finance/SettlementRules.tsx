"use client";

import { useState } from "react";
import { Badge, Button, Card, CardHeader, ErrorState, FormField, PageHeader, SelectInput, TextInput, useToast } from "@/components/admin-ui";
import { usePanel } from "@/features/admin/shell/PanelContext";
import { financeApi } from "./finance.api";
import type { Cadence, RecoveryConfig } from "./finance.api";
import { dateTime, errorText, statusOf, SimpleTable, useAsync, useCan } from "./kit";

const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ruleText = (c: Cadence) =>
  c.kind === "weekly" ? `Weekly on ${WEEKDAYS[c.weekday ?? 1]}` : c.kind === "monthly" ? `Monthly on day ${c.dayOfMonth}` : `Every ${c.days} days`;

/** 00:00 India time of a YYYY-MM-DD day, as the ISO instant the backend wants. */
const istMidnight = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 330 * 60_000).toISOString();

/**
 * How often commission settles and recovers, and the recovery percentages. The backend answers these to the
 * Super Admin only (whatever roles say), so other finance users see why the section is empty, and only the
 * Super Admin with commission.recovery.manage gets the forms.
 */
export function SettlementRulesScreen() {
  const { access } = usePanel();
  const can = useCan();
  const editable = access?.isSuperAdmin === true && can("commission.recovery.manage");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settlement rules" description="New versions take effect from a future day and apply to future cycles only. Versions are never edited." />
      <CadenceCard editable={editable} />
      <RecoveryCard editable={editable} />
    </div>
  );
}

function Refused({ error, retry }: { error: unknown; retry: () => void }) {
  if (statusOf(error) === 403)
    return <p className="text-[14px] fx-muted">Only the Super Admin can read and change these settings.</p>;
  return <ErrorState message={errorText(error)} action={<Button onClick={retry}>Retry</Button>} />;
}

function CadenceCard({ editable }: { editable: boolean }) {
  const toast = useToast();
  const data = useAsync(() => financeApi.cadence(), []);
  const [kind, setKind] = useState<Cadence["kind"]>("weekly");
  const [n, setN] = useState("1");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const value = Number(n);
    setBusy(true);
    try {
      await financeApi.setCadence({
        kind,
        ...(kind === "weekly" ? { weekday: value } : kind === "monthly" ? { dayOfMonth: value } : { days: value }),
        effectiveFrom: istMidnight(from),
      });
      toast("Cadence saved. It applies from the chosen day.");
      data.reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Settlement cadence" />
      {data.error ? <Refused error={data.error} retry={data.reload} /> : null}
      {data.data ? (
        <div className="flex flex-col gap-3 text-[14px]">
          <p>
            <strong>In force:</strong> {ruleText(data.data.current)} · cycle {data.data.cycle.cycleKey} ({dateTime(data.data.cycle.from)} → {dateTime(data.data.cycle.to)})
            {data.data.cycle.startsToday ? <Badge tone="gold" className="ml-2">Runs today</Badge> : null}
          </p>
          <SimpleTable
            rows={data.data.items}
            rowKey={(c) => c.id ?? `${c.kind}-${c.effectiveFrom}`}
            empty="No versions set: the default (weekly on Monday) applies."
            cols={[
              { header: "Rule", cell: ruleText },
              { header: "From", cell: (c) => dateTime(c.effectiveFrom) },
            ]}
          />
        </div>
      ) : null}
      {editable ? (
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <FormField label="Rule">
            {({ inputId }) => (
              <SelectInput id={inputId} value={kind} onChange={(e) => { setKind(e.target.value as Cadence["kind"]); setN("1"); }}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="interval">Every N days</option>
              </SelectInput>
            )}
          </FormField>
          <FormField label={kind === "weekly" ? "Weekday (1 = Mon … 7 = Sun)" : kind === "monthly" ? "Day of month (1–28)" : "Days (1–90)"}>
            {({ inputId }) => <TextInput id={inputId} inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} />}
          </FormField>
          <FormField label="Effective from">{({ inputId }) => <TextInput id={inputId} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</FormField>
          <Button type="submit" variant="primary" disabled={busy || !from || !n}>Save version</Button>
        </form>
      ) : null}
    </Card>
  );
}

function RecoveryCard({ editable }: { editable: boolean }) {
  const toast = useToast();
  const data = useAsync(() => financeApi.recoveryConfigs(), []);
  const [scope, setScope] = useState<RecoveryConfig["scope"]>("global");
  const [target, setTarget] = useState("");
  const [percent, setPercent] = useState("");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const bp = Math.round(Number(percent) * 100);
  const validPercent = percent !== "" && Number.isFinite(bp) && bp >= 0 && bp <= 10_000;

  async function save() {
    setBusy(true);
    try {
      await financeApi.addRecoveryConfig({ scope, ...(scope === "global" ? {} : { target: target.trim() }), percentBp: bp, effectiveFrom: istMidnight(from) });
      toast("Recovery percentage saved.");
      data.reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Recovery percentages" description="How much of a cycle's commission may be held back to recover money owed." />
      {data.error ? <Refused error={data.error} retry={data.reload} /> : null}
      {data.data ? (
        <SimpleTable
          rows={data.data}
          rowKey={(c) => c.id}
          empty="No versions yet."
          cols={[
            { header: "Scope", cell: (c) => `${c.scope}${c.target ? ` · ${c.target}` : ""}` },
            { header: "Percent", align: "right", cell: (c) => `${c.percentBp / 100}%` },
            { header: "From", cell: (c) => dateTime(c.effectiveFrom) },
          ]}
        />
      ) : null}
      {editable ? (
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <FormField label="Scope">
            {({ inputId }) => (
              <SelectInput id={inputId} value={scope} onChange={(e) => setScope(e.target.value as RecoveryConfig["scope"])}>
                <option value="global">Global</option>
                <option value="state">State</option>
                <option value="plan">Plan</option>
                <option value="dealer">Dealer</option>
              </SelectInput>
            )}
          </FormField>
          {scope !== "global" ? (
            <FormField label="Target" helper={scope === "state" ? "state:…" : scope === "dealer" ? "DLR-…" : "Plan ID"}>
              {({ inputId }) => <TextInput id={inputId} value={target} onChange={(e) => setTarget(e.target.value)} />}
            </FormField>
          ) : null}
          <FormField label="Percent">{({ inputId }) => <TextInput id={inputId} inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} />}</FormField>
          <FormField label="Effective from">{({ inputId }) => <TextInput id={inputId} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</FormField>
          <Button type="submit" variant="primary" disabled={busy || !from || !validPercent || (scope !== "global" && !target.trim())}>Save version</Button>
        </form>
      ) : null}
    </Card>
  );
}
