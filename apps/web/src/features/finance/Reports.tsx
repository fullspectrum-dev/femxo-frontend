"use client";

import { useState } from "react";
import { Button, Card, CardHeader, ErrorState, FormField, PageHeader, StatCard, Tabs, TextInput } from "@/components/admin-ui";
import { financeApi } from "./finance.api";
import type { Pnl, SalesRegister, Statement } from "./finance.api";
import { dateTime, errorText, money, monthStart, SimpleTable, today } from "./kit";

type Tab = "register" | "pnl" | "statement";

/** The sales register (GSTR-1 layout), the P&L of a period, and a Sub-Dealer's monthly wallet statement. */
export function ReportsScreen() {
  const [tab, setTab] = useState<Tab>("register");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Registers & statements" description="Periods are India-time days. Credit notes count negative." />
      <Tabs
        items={[
          { key: "register", label: "Sales register" },
          { key: "pnl", label: "P&L" },
          { key: "statement", label: "Sub-Dealer statement" },
        ]}
        value={tab}
        onChange={setTab}
        label="Report"
        idPrefix="fin-reports"
      />
      <div id="fin-reports-panel" role="tabpanel">
        {tab === "register" ? <RegisterView /> : tab === "pnl" ? <PnlView /> : <StatementView />}
      </div>
    </div>
  );
}

function Period({ from, to, onFrom, onTo, onRun, busy, extra }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void; onRun: () => void; busy: boolean; extra?: React.ReactNode }) {
  return (
    <form className="mb-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); onRun(); }}>
      <FormField label="From">{({ inputId }) => <TextInput id={inputId} type="date" value={from} max={to} onChange={(e) => onFrom(e.target.value)} />}</FormField>
      <FormField label="To">{({ inputId }) => <TextInput id={inputId} type="date" value={to} min={from} onChange={(e) => onTo(e.target.value)} />}</FormField>
      <Button type="submit" variant="primary" disabled={busy || !from || !to}>{busy ? "Loading…" : "Show"}</Button>
      {extra}
    </form>
  );
}

function RegisterView() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<SalesRegister | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setData(await financeApi.salesRegister(from, to));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  // The shared client reads JSON only, so the CSV is built here from the same rows, in the backend's column order
  // (amounts in rupees, text cells guarded against spreadsheet formulas).
  function csv() {
    if (!data) return;
    const rupees = (p: number) => `${p < 0 ? "-" : ""}${Math.floor(Math.abs(p) / 100)}.${String(Math.abs(p) % 100).padStart(2, "0")}`;
    const cell = (v: string) => (/[",\n]/.test(v) || /^[=+\-@]/.test(v) ? `"${v.replace(/^([=+\-@])/, "'$1").replaceAll('"', '""')}"` : v);
    const head = "section,kind,number,date,order,buyer,buyer_gstin,place_of_supply,taxable,cgst,sgst,igst,total";
    const lines = data.rows.map((r) =>
      [...[r.section, r.kind, r.number, r.date, r.orderNumber, r.buyer, r.buyerGstin ?? "", r.placeOfSupply].map(cell), ...[r.taxablePaise, r.cgstPaise, r.sgstPaise, r.igstPaise, r.totalPaise].map(rupees)].join(",")
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([[head, ...lines].join("\n") + "\n"], { type: "text/csv" }));
    link.download = `sales-register-${from}-${to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <Card>
      <Period from={from} to={to} onFrom={setFrom} onTo={setTo} onRun={() => void run()} busy={busy} extra={<Button disabled={!data || data.rows.length === 0} onClick={csv}>Download CSV</Button>} />
      {error ? <ErrorState message={error} /> : null}
      {data ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <StatCard label="Taxable" value={money(data.totals.taxablePaise)} />
            <StatCard label="CGST" value={money(data.totals.cgstPaise)} />
            <StatCard label="SGST" value={money(data.totals.sgstPaise)} />
            <StatCard label="IGST" value={money(data.totals.igstPaise)} />
            <StatCard label="Total" value={money(data.totals.totalPaise)} />
          </div>
          <SimpleTable
            rows={data.rows}
            rowKey={(r) => `${r.kind}-${r.number}`}
            empty="No documents in this period."
            cols={[
              { header: "Document", cell: (r) => <><div className="font-medium">{r.number}</div><div className="text-[12px] fx-muted">{r.section} · {r.date}</div></> },
              { header: "Buyer", hideOnMobile: true, cell: (r) => <>{r.buyer}{r.buyerGstin ? <div className="text-[12px] fx-muted">{r.buyerGstin}</div> : null}</> },
              { header: "Order", hideOnMobile: true, cell: (r) => r.orderNumber },
              { header: "Taxable", align: "right", cell: (r) => money(r.taxablePaise) },
              { header: "Total", align: "right", cell: (r) => money(r.totalPaise) },
            ]}
          />
        </>
      ) : null}
    </Card>
  );
}

function PnlView() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<Pnl | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      setData(await financeApi.pnl(from, to));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const line = (label: string, value: number | null, note?: string | null) => (
    <div className="flex justify-between gap-3 border-b border-[color:var(--fx-border,#e5e7eb)] py-2 text-[14px]">
      <span>{label}{note ? <span className="ml-2 text-[12px] fx-muted">({note.replace(/_/g, " ").toLowerCase()})</span> : null}</span>
      <span className="tabular-nums">{value === null ? "—" : money(value)}</span>
    </div>
  );
  return (
    <Card className="max-w-[720px]">
      <CardHeader title="Profit & loss" description="Company-wide. Cost of goods stays empty until purchase cost is recorded on orders." />
      <Period from={from} to={to} onFrom={setFrom} onTo={setTo} onRun={() => void run()} busy={busy} />
      {error ? <ErrorState message={error} /> : null}
      {data ? (
        <div>
          {line("Gross sales (taxable)", data.grossSalesPaise)}
          {line("Credit notes", -data.creditNotesPaise)}
          {line("Debit notes", data.debitNotesPaise)}
          {line("Net revenue", data.netRevenuePaise)}
          {line("Output GST", data.outputGstPaise)}
          {line("Commission expense", -data.commissionExpensePaise)}
          {line("Delivery cost", data.deliveryCostPaise === null ? null : -data.deliveryCostPaise, data.deliveryCostReason)}
          {line("Cost of goods", data.cogsPaise, data.cogsPaise === null ? data.cogsReason : null)}
          {line("Gross margin", data.grossMarginPaise)}
          {line("Contribution", data.contributionPaise)}
        </div>
      ) : null}
    </Card>
  );
}

function StatementView() {
  const [subDealerId, setId] = useState("");
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [data, setData] = useState<Statement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      setData(await financeApi.statement(subDealerId.trim(), month));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const buckets = (b: Record<string, number>) => Object.entries(b).map(([k, v]) => `${k} ${money(v)}`).join(" · ");
  return (
    <Card>
      <form className="mb-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <FormField label="Sub-Dealer ID">{({ inputId }) => <TextInput id={inputId} placeholder="SDL-…" value={subDealerId} onChange={(e) => setId(e.target.value.toUpperCase())} />}</FormField>
        <FormField label="Month">{({ inputId }) => <TextInput id={inputId} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />}</FormField>
        <Button type="submit" variant="primary" disabled={busy || !subDealerId.trim() || !/^\d{4}-\d{2}$/.test(month)}>{busy ? "Loading…" : "Show"}</Button>
      </form>
      {error ? <ErrorState message={error} /> : null}
      {data ? (
        <div className="flex flex-col gap-3">
          <p className="text-[14px]"><strong>Opening:</strong> {buckets(data.opening) || "—"}</p>
          <SimpleTable
            rows={data.rows}
            rowKey={(r) => r.id}
            empty="No movements this month."
            cols={[
              { header: "When", cell: (r) => <><div>{dateTime(r.at)}</div><div className="text-[12px] fx-muted">{r.reference ?? ""}</div></> },
              { header: "Type", cell: (r) => `${r.type.replace(/_/g, " ")} · ${r.bucket}` },
              { header: "Amount", align: "right", cell: (r) => money(r.amount) },
              { header: "Balance", align: "right", cell: (r) => money(r.balanceAfter) },
            ]}
          />
          <p className="text-[14px]"><strong>Closing:</strong> {buckets(data.closing) || "—"}</p>
        </div>
      ) : null}
    </Card>
  );
}
