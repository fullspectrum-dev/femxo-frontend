"use client";

import {
  ArrowRight,
  ArrowRightLeft,
  ClipboardCheck,
  HandCoins,
  PackageOpen,
  RefreshCw,
  ShoppingBag,
  Clock,
  Truck,
  Undo2,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PanelLink as Link } from "../shell/PanelContext";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, StatusBadge, isStatusKey } from "@/components/admin-ui";
import { BarList, ChartCard, TrendChart } from "@/components/admin-ui/viz";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { RecordRow } from "../data/records";
import { formatCount, formatINR, formatINRCompact, formatINRTick } from "../format";
import { humanize } from "../services/approvals.service";
import { istToday, routesOf } from "../services/logistics.service";
import { territoryNames } from "../services/lookups";
import { totalsOf } from "./LiveDashboard";
import { usePanel } from "../shell/PanelContext";
import type { DashboardTotals } from "./LiveDashboard";

/*
 * The command center: what the network sold, what is on the road right now, and every piece of
 * work waiting for a person, in one screen. Each block reads its own API and fails on its own, so
 * a role without (say) COD access still sees the rest. Nothing here is estimated: a block with no
 * data says so instead of showing a made-up number.
 */

const DAYS = 14;
const DAY = 86_400_000;
const REFRESH_MS = 60_000;
const SHORT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const AGO = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto", style: "short" });

/** "3 h ago", "2 d ago". */
function ago(iso: string, now: number) {
  const minutes = Math.round((Date.parse(iso) - now) / 60_000);
  if (Math.abs(minutes) < 60) return AGO.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return AGO.format(hours, "hour");
  return AGO.format(Math.round(hours / 24), "day");
}

// ---------- Data ----------

interface Meta {
  asOf: string;
  stale: boolean;
}
interface Summary<T> {
  data: { items: T[] };
  meta: Meta;
}
type Age = { d0_1: number; d1_3: number; d3_7: number; d7plus: number };
interface SalesRow {
  scopeId?: string;
  date: string;
  placed: { orders: number; salesPaise: number };
  delivered: { orders: number; salesPaise: number };
  cancelled: { orders: number; salesPaise: number };
  returned: { salesPaise: number };
}
interface OpenRow {
  open: { orders: number; salesPaise: number };
  age: Age;
}

type Kind = "approval" | "return" | "cod" | "transfer";
interface Task {
  id: string;
  kind: Kind;
  title: string;
  meta: string;
  at: string;
  urgent: boolean;
  href: `/admin/${string}`;
}

interface Snapshot {
  totals: DashboardTotals | null;
  asOf: string | null;
  stale: boolean;
  today: SalesRow | null;
  age: Age | null;
  states: { label: string; value: number; meta?: string }[];
  tasks: Task[] | null;
  /** Per kind: how many the API returned on its first page, and whether there are more. */
  counts: Partial<Record<Kind, { n: number; more: boolean }>>;
  overdue: number;
  runs: RecordRow[] | null;
  loadedAt: number;
}

const skipped = Promise.resolve({ ok: false as const });
const settled = <T,>(p: Promise<T>) => p.then((value) => ({ ok: true as const, value })).catch(() => ({ ok: false as const }));

/** `can` says whether the user holds a permission; calls they would be refused (403) are not made. */
async function loadSnapshot(can: (permission: string) => boolean): Promise<Snapshot> {
  const when = <T,>(permission: string, call: () => Promise<T>) => (can(permission) ? settled(call()) : skipped);
  const to = istToday();
  const from = new Date(Date.parse(to) - (DAYS - 1) * DAY).toISOString().slice(0, 10);

  const [network, sales, open, approvals, returns, cod, transfers, runs] = await Promise.all([
    when("dashboard.view", () => api.get<Summary<{ dealers: { total: number; byStatus: Record<string, number> }; subDealers: { total: number; byStatus: Record<string, number> } }>>("/dashboard/network", { groupBy: "state", limit: 200 })),
    when("dashboard.view", () => api.get<Summary<SalesRow>>("/dashboard/sales/daily", { groupBy: "state", from, to, limit: 200 })),
    when("dashboard.view", () => api.get<Summary<OpenRow>>("/dashboard/orders/pending", { groupBy: "state", limit: 200 })),
    when("approval.view", () => api.get<{ items: { id: string; type: string; subject: { type: string }; overdue: boolean; slaDueAt: string; createdAt: string }[]; nextCursor: string | null }>("/approvals", { status: "pending", limit: 50 })),
    when("delivery.view", () => api.get<{ items: { id: string; orderId: string; quantity: number; reason: string; requestedAt: string }[]; nextCursor: string | null }>("/delivery/returns", { status: "requested", limit: 50 })),
    when("cod.view", () => api.get<{ items: { id: string; orderNumber: string; status: string; escalationLevel: number; createdAt: string; nextActionAt: string | null }[]; nextCursor: string | null }>("/cod/tasks", { limit: 50 })),
    when("stock.view", () => api.get<{ transfers: { id: string; reference: string | null; status: string; lines: { quantity: number }[]; createdAt: string }[]; nextCursor: string | null }>("/inventory/transfers", { limit: 50 })),
    when("delivery.dispatch", () => routesOf(to)),
  ]);

  const tasks: Task[] = [];
  const counts: Snapshot["counts"] = {};
  let overdue = 0;
  if (approvals.ok) {
    counts.approval = { n: approvals.value.items.length, more: approvals.value.nextCursor !== null };
    for (const a of approvals.value.items) {
      if (a.overdue) overdue++;
      tasks.push({ id: a.id, kind: "approval", title: humanize(a.type), meta: a.overdue ? "Past its SLA" : `${humanize(a.subject.type)} · waiting for a checker`, at: a.createdAt, urgent: a.overdue, href: "/admin/approvals" });
    }
  }
  if (returns.ok) {
    counts.return = { n: returns.value.items.length, more: returns.value.nextCursor !== null };
    for (const r of returns.value.items) {
      tasks.push({ id: r.id, kind: "return", title: `Return of ${r.quantity} unit${r.quantity === 1 ? "" : "s"}`, meta: r.reason, at: r.requestedAt, urgent: false, href: "/admin/orders" });
    }
  }
  if (cod.ok) {
    const live = cod.value.items.filter((t) => ["open", "escalated", "investigation", "liability"].includes(t.status));
    counts.cod = { n: live.length, more: cod.value.nextCursor !== null };
    for (const t of live) {
      tasks.push({ id: t.id, kind: "cod", title: `Cash due on ${t.orderNumber}`, meta: `${humanize(t.status)}${t.escalationLevel ? ` · level ${t.escalationLevel}` : ""}`, at: t.createdAt, urgent: t.escalationLevel >= 2, href: "/admin/orders" });
    }
  }
  if (transfers.ok) {
    const waiting = transfers.value.transfers.filter((t) => t.status === "draft" || t.status === "in_transit");
    counts.transfer = { n: waiting.length, more: transfers.value.nextCursor !== null };
    for (const t of waiting) {
      const units = t.lines.reduce((s, l) => s + l.quantity, 0);
      tasks.push({
        id: t.id,
        kind: "transfer",
        title: `${t.reference ?? `TR-${t.id.slice(-6).toUpperCase()}`} ${t.status === "draft" ? "to dispatch" : "to receive"}`,
        meta: `${formatCount(units)} units`,
        at: t.createdAt,
        urgent: false,
        href: "/admin/warehouse",
      });
    }
  }
  // Urgent first, then oldest first: the thing that has waited longest is the next thing to do.
  tasks.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.at.localeCompare(b.at));

  const metas = [network, sales, open].flatMap((r) => (r.ok ? [r.value.meta] : []));
  const totals = network.ok && sales.ok && open.ok ? totalsOf(from, to, network.value.data.items, sales.value.data.items, open.value.data.items) : null;

  let today: SalesRow | null = null;
  let states: Snapshot["states"] = [];
  if (sales.ok) {
    const rows = sales.value.data.items;
    const todays = rows.filter((r) => r.date === to);
    today = todays.length
      ? {
          date: to,
          placed: { orders: todays.reduce((s, r) => s + r.placed.orders, 0), salesPaise: todays.reduce((s, r) => s + r.placed.salesPaise, 0) },
          delivered: { orders: todays.reduce((s, r) => s + r.delivered.orders, 0), salesPaise: todays.reduce((s, r) => s + r.delivered.salesPaise, 0) },
          cancelled: { orders: todays.reduce((s, r) => s + r.cancelled.orders, 0), salesPaise: 0 },
          returned: { salesPaise: todays.reduce((s, r) => s + r.returned.salesPaise, 0) },
        }
      : { date: to, placed: { orders: 0, salesPaise: 0 }, delivered: { orders: 0, salesPaise: 0 }, cancelled: { orders: 0, salesPaise: 0 }, returned: { salesPaise: 0 } };
    const byState = new Map<string, { sales: number; orders: number }>();
    for (const r of rows) {
      if (!r.scopeId) continue;
      const entry = byState.get(r.scopeId) ?? { sales: 0, orders: 0 };
      entry.sales += r.placed.salesPaise;
      entry.orders += r.placed.orders;
      byState.set(r.scopeId, entry);
    }
    const top = [...byState].sort((a, b) => b[1].sales - a[1].sales).slice(0, 6);
    const names = await territoryNames(top.map(([id]) => id));
    states = top.filter(([, v]) => v.sales > 0).map(([id, v]) => ({ label: names.get(id) ?? id, value: v.sales, meta: `${formatCount(v.orders)} orders` }));
  }

  const age = open.ok
    ? open.value.data.items.reduce<Age>(
        (acc, r) => ({ d0_1: acc.d0_1 + r.age.d0_1, d1_3: acc.d1_3 + r.age.d1_3, d3_7: acc.d3_7 + r.age.d3_7, d7plus: acc.d7plus + r.age.d7plus }),
        { d0_1: 0, d1_3: 0, d3_7: 0, d7plus: 0 }
      )
    : null;

  const anyTaskSource = approvals.ok || returns.ok || cod.ok || transfers.ok;
  return {
    totals,
    asOf: metas.map((m) => m.asOf).sort()[0] ?? null,
    stale: metas.some((m) => m.stale),
    today,
    age,
    states,
    tasks: anyTaskSource ? tasks : null,
    counts,
    overdue,
    runs: runs.ok ? runs.value : null,
    loadedAt: Date.now(),
  };
}

// ---------- Screen ----------

export function CommandCenter() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const { access, panel } = usePanel();
  // The Super Admin may call everything (even before /access/me answers); others only what they hold.
  const held = panel.id === "super-admin" || access?.isSuperAdmin ? "*" : [...(access?.permissions ?? [])].sort().join(",");

  useEffect(() => {
    let live = true;
    const list = held.split(",");
    const can = (permission: string) => held === "*" || list.includes(permission);
    loadSnapshot(can)
      .then((next) => {
        if (!live) return;
        setSnapshot(next);
        setFailed(false);
      })
      .catch(() => live && setFailed(true))
      .finally(() => live && setRefreshing(false));
    return () => {
      live = false;
    };
  }, [tick, held]);

  // Refresh every minute while the tab is visible; a hidden tab does no work.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = () => {
    setRefreshing(true);
    setTick((n) => n + 1);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        title="Command center"
        description="Today's orders, the runs on the road, and every task waiting for a person, inside the territories you cover."
        actions={
          <div className="flex items-center gap-2">
            <Freshness snapshot={snapshot} />
            <Button variant="secondary" onClick={refresh} disabled={refreshing} aria-label="Refresh now">
              <RefreshCw size={16} aria-hidden="true" className={refreshing ? "fx-spin" : undefined} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        }
      />

      {!snapshot && !failed ? <Skeleton /> : null}
      {!snapshot && failed ? (
        <Card>
          <EmptyState title="Couldn't reach the server" message="Nothing was loaded. Check your connection and try again." action={<Button variant="secondary" onClick={refresh}>Try again</Button>} />
        </Card>
      ) : null}
      {snapshot ? <Board snapshot={snapshot} /> : null}
    </div>
  );
}

function Freshness({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot) return null;
  const asOf = snapshot.asOf ? new Date(snapshot.asOf).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }) : null;
  return (
    <p className={cn("fx-live", snapshot.stale && "fx-live--stale")} aria-live="polite">
      <span className="fx-live-dot" aria-hidden="true" />
      {snapshot.stale ? "Summaries delayed" : "Live"}
      {asOf ? <span className="fx-muted">· as of {asOf}</span> : null}
    </p>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5" aria-busy="true" aria-label="Loading the command center">
      <div className="fx-kpi-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="fx-card fx-kpi">
            <span className="fx-skeleton h-3 w-20" />
            <span className="fx-skeleton mt-3 h-7 w-24" />
            <span className="fx-skeleton mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="fx-card h-[360px]" />
        <div className="fx-card h-[360px]" />
      </div>
    </div>
  );
}

function Board({ snapshot }: { snapshot: Snapshot }) {
  const { today, totals, age, runs, counts } = snapshot;
  const runsOut = runs?.filter((r) => r.status === "out").length ?? 0;
  const stops = runs?.reduce((s, r) => s + Number(r.stops), 0) ?? 0;
  const delivered = runs?.reduce((s, r) => s + Number(r.delivered), 0) ?? 0;
  const late = age ? age.d3_7 + age.d7plus : 0;
  const waiting = (kind: Kind) => (counts[kind] ? `${counts[kind]!.n}${counts[kind]!.more ? "+" : ""}` : "—");

  return (
    <>
      <section aria-label="Today at a glance" className="fx-kpi-grid">
        <Kpi icon={Wallet} label="Sales today" value={today ? formatINRCompact(today.placed.salesPaise) : "—"} context={today ? `${formatCount(today.placed.orders)} orders placed` : "No sales access"} />
        <Kpi icon={Truck} label="Delivered" value={today ? formatINRCompact(today.delivered.salesPaise) : "—"} context={today ? `${formatCount(today.delivered.orders)} orders · ${formatCount(today.cancelled.orders)} cancelled` : "No sales access"} />
        <Kpi
          icon={ShoppingBag}
          label="Open orders"
          value={totals ? formatCount(totals.openOrders) : "—"}
          context={age ? (late ? `${formatCount(late)} older than 3 days` : "None older than 3 days") : "No order access"}
          tone={late ? "warning" : undefined}
          href="/admin/orders"
        />
        <Kpi icon={PackageOpen} label="On the road" value={runs ? `${runsOut}/${runs.length}` : "—"} context={runs ? (stops ? `${delivered} of ${stops} stops delivered` : "No runs planned today") : "No dispatch access"} href="/admin/orders" />
        <Kpi
          icon={ClipboardCheck}
          label="Approvals"
          value={waiting("approval")}
          context={snapshot.overdue ? `${snapshot.overdue} past SLA` : counts.approval ? "All within SLA" : "No approval access"}
          tone={snapshot.overdue ? "error" : undefined}
          href="/admin/approvals"
        />
        <Kpi icon={Undo2} label="Returns" value={waiting("return")} context={counts.cod ? `${waiting("cod")} COD recoveries open` : "Commission held until decided"} href="/admin/orders" />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Inbox tasks={snapshot.tasks} counts={counts} now={snapshot.loadedAt} />
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5">
          <Aging age={age} />
          <Card>
            <header className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="fx-card-title">Top states</h2>
                <p className="mt-1 text-[13px] fx-muted">Sales placed, last {DAYS} days</p>
              </div>
            </header>
            {snapshot.states.length ? (
              <BarList label={`Top states by sales placed in the last ${DAYS} days`} items={snapshot.states} formatValue={formatINRCompact} />
            ) : (
              <p className="text-[13px] fx-muted">No sales in this period yet.</p>
            )}
          </Card>
        </div>
      </div>

      <Runs runs={runs} />

      {totals ? <SalesTrend totals={totals} /> : null}
    </>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  context,
  tone,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  context: string;
  tone?: "warning" | "error";
  href?: `/admin/${string}`;
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="fx-label">{label}</span>
        <span className={cn("fx-kpi-icon", tone && `fx-kpi-icon--${tone}`)} aria-hidden="true">
          <Icon size={15} strokeWidth={2.2} />
        </span>
      </span>
      <span className="fx-kpi-value fx-num">{value}</span>
      <span className={cn("fx-kpi-context", tone && `fx-kpi-context--${tone}`)}>{context}</span>
    </>
  );
  return href ? (
    <Link href={href} className="fx-card fx-kpi fx-kpi--link">
      {body}
    </Link>
  ) : (
    <article className="fx-card fx-kpi">{body}</article>
  );
}

const KIND: Record<Kind, { label: string; icon: LucideIcon }> = {
  approval: { label: "Approvals", icon: ClipboardCheck },
  return: { label: "Returns", icon: Undo2 },
  cod: { label: "COD", icon: HandCoins },
  transfer: { label: "Transfers", icon: ArrowRightLeft },
};

function Inbox({ tasks, counts, now }: { tasks: Task[] | null; counts: Snapshot["counts"]; now: number }) {
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const kinds = (Object.keys(KIND) as Kind[]).filter((k) => counts[k] !== undefined);
  const shown = useMemo(() => (tasks ?? []).filter((t) => filter === "all" || t.kind === filter).slice(0, 9), [tasks, filter]);
  const total = tasks?.length ?? 0;

  return (
    <Card padded={false} className="flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="fx-card-title">Action inbox</h2>
          <p className="mt-1 text-[13px] fx-muted">{total ? `${total} waiting · most urgent and oldest first` : "Work that needs a person shows up here"}</p>
        </div>
        {kinds.length > 1 ? (
          <Segmented
            label="Show tasks of type"
            value={filter}
            onChange={setFilter}
            items={[{ key: "all", label: "All" }, ...kinds.map((k) => ({ key: k, label: `${KIND[k].label} ${counts[k]!.n}${counts[k]!.more ? "+" : ""}` }))]}
          />
        ) : null}
      </header>
      {tasks === null ? (
        <div className="p-5">
          <EmptyState title="No task queues for your role" message="Approvals, returns, COD recovery and transfers appear here when your role can see them." />
        </div>
      ) : shown.length ? (
        <ul className="fx-inbox">
          {shown.map((task) => {
            const Icon = KIND[task.kind].icon;
            return (
              <li key={`${task.kind}-${task.id}`}>
                <Link href={task.href} className="fx-inbox-row">
                  <span className={cn("fx-inbox-icon", `fx-inbox-icon--${task.kind}`)} aria-hidden="true">
                    <Icon size={16} strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold">{task.title}</span>
                      {task.urgent ? <Badge tone="error">Urgent</Badge> : null}
                    </span>
                    <span className="block truncate text-[12.5px] fx-muted">{task.meta}</span>
                  </span>
                  <span className="flex flex-none items-center gap-1 text-[12px] fx-muted fx-num">
                    <Clock size={13} aria-hidden="true" />
                    {ago(task.at, now)}
                  </span>
                  <ArrowRight size={16} className="fx-inbox-go flex-none" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="p-5">
          <EmptyState title="Inbox zero" message="Nothing is waiting for a decision right now." />
        </div>
      )}
    </Card>
  );
}

const AGE_BANDS: { key: keyof Age; label: string; tone: "good" | "warning" | "serious" | "critical" }[] = [
  { key: "d0_1", label: "Under 1 day", tone: "good" },
  { key: "d1_3", label: "1–3 days", tone: "warning" },
  { key: "d3_7", label: "3–7 days", tone: "serious" },
  { key: "d7plus", label: "Over 7 days", tone: "critical" },
];

function Aging({ age }: { age: Age | null }) {
  const total = age ? AGE_BANDS.reduce((s, b) => s + age[b.key], 0) : 0;
  return (
    <Card>
      <header className="mb-4">
        <h2 className="fx-card-title">Open order aging</h2>
        <p className="mt-1 text-[13px] fx-muted">{age ? `${formatCount(total)} orders not yet delivered` : "Needs the dashboard permission"}</p>
      </header>
      {age && total ? (
        <>
          <div className="fx-aging-bar" role="img" aria-label={AGE_BANDS.map((b) => `${b.label}: ${age[b.key]}`).join(", ")}>
            {AGE_BANDS.map((b) => (age[b.key] ? <span key={b.key} className={`fx-aging-seg fx-aging-seg--${b.tone}`} style={{ flexGrow: age[b.key] }} /> : null))}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            {AGE_BANDS.map((b) => (
              <div key={b.key} className="flex items-center gap-2">
                <span className={`fx-aging-key fx-aging-seg--${b.tone}`} aria-hidden="true" />
                <dt className="text-[12.5px] fx-muted">{b.label}</dt>
                <dd className="ml-auto font-semibold fx-num">{formatCount(age[b.key])}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : age ? (
        <p className="text-[13px] fx-muted">Every order has been delivered or cancelled.</p>
      ) : null}
    </Card>
  );
}

function Runs({ runs }: { runs: RecordRow[] | null }) {
  if (runs === null) return null;
  return (
    <Card padded={false}>
      <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="fx-card-title">Delivery runs today</h2>
          <p className="mt-1 text-[13px] fx-muted">Every stop is confirmed with the customer&rsquo;s OTP.</p>
        </div>
        <Link href="/admin/orders" className="fx-link text-[13px]">
          All runs
        </Link>
      </header>
      {runs.length ? (
        <ul className="fx-runs">
          {runs.map((run) => {
            const stops = Number(run.stops) || 0;
            const pct = (n: unknown) => (stops ? (Number(n) / stops) * 100 : 0);
            return (
              <li key={run.id} className="fx-run">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{run.name}</p>
                    <p className="truncate text-[12.5px] fx-muted">{run.agent}</p>
                  </div>
                  {isStatusKey(String(run.status)) ? <StatusBadge status={run.status} /> : null}
                </div>
                <div className="fx-run-track mt-3" role="img" aria-label={`${run.delivered} delivered, ${run.failed} failed, ${run.pending} to go, of ${stops} stops`}>
                  <span className="fx-run-seg fx-run-seg--done" style={{ width: `${pct(run.delivered)}%` }} />
                  <span className="fx-run-seg fx-run-seg--failed" style={{ width: `${pct(run.failed)}%` }} />
                </div>
                <p className="mt-2 flex justify-between text-[12px] fx-muted fx-num">
                  <span>
                    {String(run.delivered)}/{stops} delivered{Number(run.failed) ? ` · ${run.failed} failed` : ""}
                  </span>
                  <span>{formatINR(Number(run.cash) || 0)} cash</span>
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="p-5">
          <EmptyState title="No runs planned today" message="Runs appear here as soon as dispatch plans them." />
        </div>
      )}
    </Card>
  );
}

function SalesTrend({ totals }: { totals: DashboardTotals }) {
  const labels = totals.days.map((d) => {
    const text = SHORT.format(new Date(d.date));
    return { axis: text, full: text };
  });
  return (
    <ChartCard
      title="Daily sales"
      description={`Placed by order date, delivered by delivery date, last ${DAYS} days. Neither is profit.`}
      table={{
        columns: [
          { key: "date", label: "Date" },
          { key: "placed", label: "Placed", numeric: true },
          { key: "delivered", label: "Delivered", numeric: true },
        ],
        rows: totals.days.map((d) => ({ date: d.date, placed: formatINR(d.placed), delivered: formatINR(d.delivered) })),
      }}
    >
      <TrendChart
        label={`Daily placed and delivered sales for the last ${DAYS} days`}
        labels={labels}
        series={[
          { key: "placed", label: "Placed", values: totals.days.map((d) => d.placed), tone: "accent" },
          { key: "delivered", label: "Delivered", values: totals.days.map((d) => d.delivered), tone: "muted" },
        ]}
        formatValue={formatINR}
        formatTick={formatINRTick}
      />
    </ChartCard>
  );
}
