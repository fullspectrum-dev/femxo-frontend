"use client";

import { useState } from "react";
import { Badge, Button, Card, Dialog, Drawer, ErrorState, FormField, PageHeader, SelectInput, TextInput, useToast } from "@/components/admin-ui";
import type { BadgeTone } from "@/components/admin-ui";
import { financeApi } from "./finance.api";
import type { PlanVersion, VersionFields } from "./finance.api";
import { dateTime, errorText, SimpleTable, useAsync, useCan, usePaged } from "./kit";

const TONE: Record<PlanVersion["status"], BadgeTone> = { draft: "neutral", validated: "info", published: "success" };
const pct = (bp: number | null) => (bp === null ? "—" : `${bp / 100}%`);
/** "2.5" → 250 basis points; null when empty, NaN when not a percentage. */
const toBp = (v: string) => (v.trim() === "" ? null : Math.round(Number(v) * 100));
const fromBp = (bp: number | null) => (bp === null ? "" : String(bp / 100));

const rates = (v: Pick<PlanVersion, "model" | "dealerRateBp" | "subDealerRateBp" | "poolRateBp" | "dealerShareBp" | "subDealerShareBp">) =>
  v.model === "stacked"
    ? `Stacked · Dealer ${pct(v.dealerRateBp)} · Sub-Dealer ${pct(v.subDealerRateBp)}`
    : `Pool ${pct(v.poolRateBp)} · shares ${pct(v.dealerShareBp)} / ${pct(v.subDealerShareBp)}`;

/** Commission plans: create a plan, start a new version, edit a draft, validate it, publish it (publish is its own permission). */
export function CommissionPlansScreen() {
  const can = useCan();
  const list = usePaged((cursor) => financeApi.plans(cursor), []);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Commission plans"
        description="Draft → Validated → Published. A published version never changes; a correction is a new version. Orders use the version in force on their date."
        actions={can("commission.plan.manage") ? <Button variant="primary" onClick={() => setCreating(true)}>New plan</Button> : undefined}
      />
      <Card>
        {list.error ? <ErrorState message={errorText(list.error)} action={<Button onClick={list.reload}>Retry</Button>} /> : null}
        <SimpleTable
          rows={list.items}
          rowKey={(p) => p.id}
          onRow={(p) => setOpen(p.id)}
          empty={list.loading ? "Loading…" : "No plans yet."}
          cols={[
            { header: "Plan", cell: (p) => <span className="font-medium">{p.name}</span> },
            { header: "Scope", cell: (p) => [p.scope.stateId, p.scope.dealerId, p.scope.categoryId && "category"].filter(Boolean).join(" · ") || "Company-wide" },
            { header: "Versions", align: "right", cell: (p) => p.lastVersion },
            { header: "Created", hideOnMobile: true, cell: (p) => dateTime(p.createdAt) },
          ]}
        />
        {list.hasMore ? <Button className="mt-3" disabled={list.loading} onClick={() => void list.more()}>Load more</Button> : null}
      </Card>
      <Drawer open={open !== null} onClose={() => setOpen(null)} title="Commission plan">
        {open ? <PlanDetail id={open} /> : null}
      </Drawer>
      {creating ? <CreatePlan onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); list.reload(); setOpen(id); }} /> : null}
    </div>
  );
}

function VersionEditor({ initial, onChange }: { initial: VersionFields; onChange: (v: VersionFields | null) => void }) {
  const [model, setModel] = useState(initial.model);
  const [f, setF] = useState({
    priority: initial.priority === undefined ? "" : String(initial.priority),
    dealer: fromBp(initial.dealerRateBp ?? null),
    sub: fromBp(initial.subDealerRateBp ?? null),
    pool: fromBp(initial.poolRateBp ?? null),
    dShare: fromBp(initial.dealerShareBp ?? null),
    sShare: fromBp(initial.subDealerShareBp ?? null),
    from: initial.effectiveFrom ? initial.effectiveFrom.slice(0, 10) : "",
  });
  function emit(next: typeof f, m = model) {
    const bps = [next.dealer, next.sub, next.pool, next.dShare, next.sShare].map(toBp);
    if (bps.some((b) => b !== null && (!Number.isFinite(b) || b < 0 || b > 10_000))) return onChange(null);
    const [dealer, sub, pool, dShare, sShare] = bps;
    onChange({
      model: m,
      ...(next.priority.trim() ? { priority: Number(next.priority) } : {}),
      ...(m === "stacked" ? { dealerRateBp: dealer, subDealerRateBp: sub, poolRateBp: null, dealerShareBp: null, subDealerShareBp: null } : { poolRateBp: pool, dealerShareBp: dShare, subDealerShareBp: sShare, dealerRateBp: null, subDealerRateBp: null }),
      effectiveFrom: next.from ? new Date(Date.parse(`${next.from}T00:00:00Z`) - 330 * 60_000).toISOString() : null,
    });
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    const next = { ...f, [k]: e.target.value };
    setF(next);
    emit(next);
  };
  const field = (label: string, k: keyof typeof f, helper?: string) => (
    <FormField label={label} helper={helper}>{({ inputId }) => <TextInput id={inputId} inputMode="decimal" value={f[k]} onChange={set(k)} />}</FormField>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label="Model">
        {({ inputId }) => (
          <SelectInput id={inputId} value={model} onChange={(e) => { const m = e.target.value as VersionFields["model"]; setModel(m); emit(f, m); }}>
            <option value="stacked">Stacked (each earns a rate)</option>
            <option value="pool">Pool (one rate, split by shares)</option>
          </SelectInput>
        )}
      </FormField>
      {field("Priority", "priority", "Higher wins; empty for the default")}
      {model === "stacked" ? (
        <>
          {field("Dealer rate (%)", "dealer")}
          {field("Sub-Dealer rate (%)", "sub")}
        </>
      ) : (
        <>
          {field("Pool rate (%)", "pool")}
          {field("Dealer share (%)", "dShare", "Shares total 100%")}
          {field("Sub-Dealer share (%)", "sShare")}
        </>
      )}
      <FormField label="Effective from" helper="India time, start of day">
        {({ inputId }) => <TextInput id={inputId} type="date" value={f.from} onChange={set("from")} />}
      </FormField>
    </div>
  );
}

function CreatePlan({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [stateId, setState] = useState("");
  const [dealerId, setDealer] = useState("");
  const [categoryId, setCategory] = useState("");
  const [version, setVersion] = useState<VersionFields | null>({ model: "stacked" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    if (!version || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const scope = { ...(stateId.trim() ? { stateId: stateId.trim() } : {}), ...(dealerId.trim() ? { dealerId: dealerId.trim() } : {}), ...(categoryId.trim() ? { categoryId: categoryId.trim() } : {}) };
      const out = await financeApi.createPlan({ name: name.trim(), scope, version });
      toast(`Plan ${out.plan.name} created with a draft version.`);
      onCreated(out.plan.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="New commission plan"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !name.trim() || !version} onClick={() => void create()}>Create draft</Button></>}
    >
      <div className="flex flex-col gap-3">
        <FormField label="Name" required>{({ inputId }) => <TextInput id={inputId} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />}</FormField>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="State" helper="state:… (optional)">{({ inputId }) => <TextInput id={inputId} value={stateId} onChange={(e) => setState(e.target.value)} />}</FormField>
          <FormField label="Dealer" helper="DLR-… (optional)">{({ inputId }) => <TextInput id={inputId} value={dealerId} onChange={(e) => setDealer(e.target.value.toUpperCase())} />}</FormField>
          <FormField label="Category ID" helper="Optional">{({ inputId }) => <TextInput id={inputId} value={categoryId} onChange={(e) => setCategory(e.target.value)} />}</FormField>
        </div>
        <VersionEditor initial={{ model: "stacked" }} onChange={setVersion} />
        {error ? <p className="fx-field-error" role="alert">{error}</p> : null}
      </div>
    </Dialog>
  );
}

function PlanDetail({ id }: { id: string }) {
  const can = useCan();
  const toast = useToast();
  const data = useAsync(() => financeApi.plan(id), [id]);
  const [editing, setEditing] = useState<PlanVersion | null>(null);
  const [draft, setDraft] = useState<VersionFields | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(label: string, run: () => Promise<unknown>) {
    setBusy(true);
    try {
      await run();
      toast(label);
      data.reload();
      setEditing(null);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }

  if (data.error) return <ErrorState message={errorText(data.error)} />;
  if (!data.data) return <p className="fx-muted">Loading…</p>;
  const { plan, versions } = data.data;
  const manage = can("commission.plan.manage");
  const publish = can("commission.plan.publish");
  return (
    <div className="flex flex-col gap-4 text-[14px]">
      <div>
        <div className="text-[18px] font-semibold">{plan.name}</div>
        <div className="fx-muted">{[plan.scope.stateId, plan.scope.dealerId, plan.scope.categoryId].filter(Boolean).join(" · ") || "Company-wide"}</div>
      </div>
      {manage ? <Button disabled={busy} onClick={() => void act("New draft version started.", () => financeApi.addVersion(plan.id))}>Start new version</Button> : null}
      {[...versions].reverse().map((v) => (
        <div key={v.id} className="fx-card fx-card-pad flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <strong>Version {v.version}</strong>
            <span className="flex gap-1">
              {v.effective ? <Badge tone="gold">In force</Badge> : null}
              <Badge tone={TONE[v.status]}>{v.status}</Badge>
            </span>
          </div>
          <div>{rates(v)} · priority {v.priority}</div>
          <div className="fx-muted">Effective {v.effectiveFrom ? dateTime(v.effectiveFrom) : "not set"}</div>
          <div className="flex flex-wrap gap-2">
            {manage && v.status !== "published" ? <Button size="sm" onClick={() => { setEditing(v); setDraft(null); }}>Edit</Button> : null}
            {manage && v.status === "draft" ? <Button size="sm" variant="primary" disabled={busy} onClick={() => void act(`Version ${v.version} validated.`, () => financeApi.validateVersion(v.id, v.rev))}>Validate</Button> : null}
            {publish && v.status === "validated" ? <Button size="sm" variant="gold" disabled={busy} onClick={() => void act(`Version ${v.version} published.`, () => financeApi.publishVersion(v.id, v.rev))}>Publish</Button> : null}
          </div>
          {editing?.id === v.id ? (
            <div className="flex flex-col gap-3">
              <VersionEditor
                initial={{ model: v.model, priority: v.priority, dealerRateBp: v.dealerRateBp, subDealerRateBp: v.subDealerRateBp, poolRateBp: v.poolRateBp, dealerShareBp: v.dealerShareBp, subDealerShareBp: v.subDealerShareBp, effectiveFrom: v.effectiveFrom }}
                onChange={setDraft}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                <Button size="sm" variant="primary" disabled={busy || !draft} onClick={() => draft && void act(`Version ${v.version} saved as draft.`, () => financeApi.updateVersion(v.id, { ...draft, rev: v.rev }))}>Save</Button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
