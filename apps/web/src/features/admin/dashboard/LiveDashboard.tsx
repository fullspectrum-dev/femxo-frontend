"use client";

import { Clock, ShoppingBag, Store, Truck, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, ErrorState, LoadingSkeleton, PageHeader, StatCard } from "@/components/admin-ui";
import { ChartCard, TrendChart } from "@/components/admin-ui/viz";
import { api } from "@/lib/api";
import { formatCount, formatINR, formatINRCompact, formatINRTick } from "../format";

/*
 * The dashboard on live data: the summaries femxo-backend keeps in its dashboard read model
 * (/dashboard/*). Read by state so every role sees what its territories cover; the API sums
 * nothing for us, so the totals below are added up here.
 */

interface Meta {
  asOf: string;
  stale: boolean;
}
interface Page<T> {
  data: { items: T[] };
  meta: Meta;
}
interface Counts {
  total: number;
  byStatus: Record<string, number>;
}
interface NetworkItem {
  dealers: Counts;
  subDealers: Counts;
}
interface SalesItem {
  date: string;
  placed: { orders: number; salesPaise: number };
  delivered: { orders: number; salesPaise: number };
  cancelled: { orders: number; salesPaise: number };
  returned: { salesPaise: number };
}
interface OpenItem {
  open: { orders: number; salesPaise: number };
  age: Record<string, number>;
}

const DAYS = 30;
const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const SHORT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export interface DashboardTotals {
  days: { date: string; placed: number; delivered: number }[];
  placedSales: number;
  placedOrders: number;
  deliveredSales: number;
  cancelledOrders: number;
  returnedSales: number;
  openOrders: number;
  openSales: number;
  dealers: number;
  activeDealers: number;
  subDealers: number;
}

/** Adds the per-state rows up, and fills quiet days with zero so the chart has no gaps. */
export function totalsOf(from: string, to: string, network: NetworkItem[], sales: SalesItem[], open: OpenItem[]): DashboardTotals {
  const byDate = new Map<string, { placed: number; delivered: number }>();
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY) byDate.set(isoDay(new Date(t)), { placed: 0, delivered: 0 });
  for (const row of sales) {
    const day = byDate.get(row.date);
    if (!day) continue;
    day.placed += row.placed.salesPaise;
    day.delivered += row.delivered.salesPaise;
  }
  return {
    days: [...byDate].map(([date, v]) => ({ date, ...v })),
    placedSales: sum(sales.map((r) => r.placed.salesPaise)),
    placedOrders: sum(sales.map((r) => r.placed.orders)),
    deliveredSales: sum(sales.map((r) => r.delivered.salesPaise)),
    cancelledOrders: sum(sales.map((r) => r.cancelled.orders)),
    returnedSales: sum(sales.map((r) => r.returned.salesPaise)),
    openOrders: sum(open.map((r) => r.open.orders)),
    openSales: sum(open.map((r) => r.open.salesPaise)),
    dealers: sum(network.map((r) => r.dealers.total)),
    activeDealers: sum(network.map((r) => r.dealers.byStatus.active ?? 0)),
    subDealers: sum(network.map((r) => r.subDealers.total)),
  };
}

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; totals: DashboardTotals; asOf: string | null; stale: boolean; from: string; to: string };

export function LiveDashboard() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    const to = isoDay(new Date());
    const from = isoDay(new Date(Date.now() - (DAYS - 1) * DAY));
    try {
      const [network, sales, open] = await Promise.all([
        api.get<Page<NetworkItem>>("/dashboard/network", { groupBy: "state", limit: 200 }),
        api.get<Page<SalesItem>>("/dashboard/sales/daily", { groupBy: "state", from, to, limit: 200 }),
        api.get<Page<OpenItem>>("/dashboard/orders/pending", { groupBy: "state", limit: 200 }),
      ]);
      const stamps = [network.meta, sales.meta, open.meta];
      setState({
        kind: "ready",
        totals: totalsOf(from, to, network.data.items, sales.data.items, open.data.items),
        asOf: stamps.map((m) => m.asOf).sort()[0] ?? null,
        stale: stamps.some((m) => m.stale),
        from,
        to,
      });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once, and again on retry
    void load();
  }, [load, attempt]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title="Dashboard" description={`Sales and network for the last ${DAYS} days, inside the territories you cover.`} />
      {state.kind === "loading" ? <LoadingSkeleton rows={6} label="Loading dashboard" /> : null}
      {state.kind === "error" ? (
        <ErrorState
          title="Couldn't load the dashboard"
          message="You may not have the dashboard permission, or the server is unreachable."
          action={<Button variant="secondary" onClick={() => { setState({ kind: "loading" }); setAttempt((n) => n + 1); }}>Try again</Button>}
        />
      ) : null}
      {state.kind === "ready" ? <Ready {...state} /> : null}
    </div>
  );
}

function Ready({ totals, asOf, stale }: Extract<State, { kind: "ready" }>) {
  const labels = totals.days.map((d) => {
    const text = SHORT.format(new Date(d.date));
    return { axis: text, full: text };
  });
  return (
    <>
      <p className="flex flex-wrap items-center gap-2 text-[13px] fx-muted">
        <Clock size={14} aria-hidden="true" />
        {asOf ? `Figures as of ${new Date(asOf).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}` : "No summary has been computed yet"}
        {stale ? <Badge tone="warning">Stale</Badge> : null}
      </p>

      <section aria-label="Key figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales placed" value={formatINRCompact(totals.placedSales)} context={`${formatCount(totals.placedOrders)} orders, GST included`} icon={Wallet} />
        <StatCard label="Sales delivered" value={formatINRCompact(totals.deliveredSales)} context={`${formatINR(totals.returnedSales)} returned`} icon={Truck} />
        <StatCard label="Open orders" value={formatCount(totals.openOrders)} context={`${formatINRCompact(totals.openSales)} waiting to be delivered`} icon={ShoppingBag} />
        <StatCard label="Dealers" value={formatCount(totals.dealers)} context={`${formatCount(totals.activeDealers)} active · ${formatCount(totals.subDealers)} sub-dealers`} icon={Store} />
      </section>

      <ChartCard
        title="Daily sales"
        description="Placed by order date, delivered by delivery date. Neither is profit."
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
    </>
  );
}
