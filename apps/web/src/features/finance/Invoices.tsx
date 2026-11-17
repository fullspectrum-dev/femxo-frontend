"use client";

import { useState } from "react";
import { Badge, Button, Card, Drawer, ErrorState, FormField, PageHeader, SelectInput, TextArea, TextInput, useToast } from "@/components/admin-ui";
import type { BadgeTone } from "@/components/admin-ui";
import { idempotencyKey } from "@/lib/api";
import { financeApi } from "./finance.api";
import type { BillingDoc, CreditReason, DebitReason } from "./finance.api";
import { dateTime, errorText, money, SimpleTable, toPaise, useAsync, useCan, usePaged } from "./kit";

const EINV: Record<BillingDoc["einvoice"]["status"], [string, BadgeTone]> = {
  not_applicable: ["Not required", "neutral"],
  pending: ["Pending", "warning"],
  generated: ["Generated", "success"],
  failed: ["Failed", "error"],
};
const KIND = { invoice: "Invoice", credit_note: "Credit note", debit_note: "Debit note" } as const;

/** GST invoices with their credit and debit notes, PDF links and e-invoice (IRN) retry. */
export function InvoicesScreen() {
  const [einvoice, setEinvoice] = useState<"" | "pending" | "failed">("");
  const list = usePaged((cursor) => financeApi.invoices({ einvoice: einvoice || undefined, cursor }), [einvoice]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Invoices & notes" description="A document never changes after issue; a correction is a credit or debit note." />
      <Card>
        <div className="mb-4">
          <SelectInput aria-label="E-invoice" value={einvoice} onChange={(e) => setEinvoice(e.target.value as "" | "pending" | "failed")} className="w-auto">
            <option value="">All invoices</option>
            <option value="pending">E-invoice pending</option>
            <option value="failed">E-invoice failed</option>
          </SelectInput>
        </div>
        {list.error ? <ErrorState message={errorText(list.error)} action={<Button onClick={list.reload}>Retry</Button>} /> : null}
        <SimpleTable
          rows={list.items}
          rowKey={(d) => d.id}
          onRow={(d) => setOpen(d.id)}
          empty={list.loading ? "Loading…" : "No invoices."}
          cols={[
            { header: "Invoice", cell: (d) => <><div className="font-medium">{d.number}</div><div className="text-[12px] fx-muted">{d.orderNumber}</div></> },
            { header: "Buyer", hideOnMobile: true, cell: (d) => d.buyer.name },
            { header: "Issued", hideOnMobile: true, cell: (d) => dateTime(d.issuedAt) },
            { header: "Total", align: "right", cell: (d) => money(d.totals.totalPaise) },
            { header: "E-invoice", cell: (d) => <Badge tone={EINV[d.einvoice.status][1]}>{EINV[d.einvoice.status][0]}</Badge> },
          ]}
        />
        {list.hasMore ? <Button className="mt-3" disabled={list.loading} onClick={() => void list.more()}>Load more</Button> : null}
      </Card>
      <Drawer open={open !== null} onClose={() => setOpen(null)} title="Document">
        {open ? <DocumentDetail id={open} onChanged={list.reload} /> : null}
      </Drawer>
    </div>
  );
}

function DocumentDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const can = useCan();
  const toast = useToast();
  const doc = useAsync(() => financeApi.document(id), [id]);
  const [note, setNote] = useState<"credit" | "debit" | null>(null);
  const [busy, setBusy] = useState(false);

  async function pdf(docId: string) {
    try {
      const { url } = await financeApi.pdf(docId);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast(errorText(e), "error");
    }
  }
  async function retry(docId: string) {
    setBusy(true);
    try {
      await financeApi.retryEinvoice(docId);
      toast("E-invoice queued again.");
      doc.reload();
      onChanged();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }

  if (doc.error) return <ErrorState message={errorText(doc.error)} />;
  if (!doc.data) return <p className="fx-muted">Loading…</p>;
  const d = doc.data.document;
  const retryable = d.einvoice.status === "failed" || d.einvoice.status === "pending";
  return (
    <div className="flex flex-col gap-4 text-[14px]">
      <div>
        <div className="text-[18px] font-semibold">{KIND[d.kind]} {d.number}</div>
        <div className="fx-muted">{d.orderNumber} · {d.buyer.name}{d.buyer.gstin ? ` · ${d.buyer.gstin}` : ""} · {dateTime(d.issuedAt)}</div>
      </div>
      <SimpleTable
        rows={d.lines}
        rowKey={(l) => String(l.lineNo)}
        cols={[
          { header: "#", cell: (l) => l.lineNo },
          { header: "Item", cell: (l) => <>{l.description}<div className="text-[12px] fx-muted">{l.quantity} {l.unit} · GST {l.gstRateBp / 100}%</div></> },
          { header: "Value", align: "right", cell: (l) => money(l.valuePaise) },
        ]}
      />
      <div className="flex justify-between font-semibold"><span>Total</span><span>{money(d.totals.totalPaise)}</span></div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void pdf(d.id)} disabled={d.pdf.status !== "ready"} title={`PDF ${d.pdf.status}`}>Download PDF</Button>
        {retryable && can("invoice.einvoice.manage") ? <Button variant="gold" disabled={busy} onClick={() => void retry(d.id)}>Retry e-invoice</Button> : null}
        {d.kind === "invoice" && can("invoice.note") ? (
          <>
            <Button onClick={() => setNote("credit")}>Credit note</Button>
            <Button onClick={() => setNote("debit")}>Debit note</Button>
          </>
        ) : null}
      </div>
      {d.einvoice.error ? <p className="fx-field-error">E-invoice: {d.einvoice.error} (attempts {d.einvoice.attempts})</p> : null}
      {d.einvoice.irn ? <p className="fx-muted break-all">IRN {d.einvoice.irn}</p> : null}
      {note ? <NoteForm invoice={d} kind={note} onDone={() => { setNote(null); doc.reload(); onChanged(); }} onCancel={() => setNote(null)} /> : null}
      {doc.data.notes.length > 0 ? (
        <div>
          <h3 className="fx-card-title mb-2">Notes</h3>
          <SimpleTable
            rows={doc.data.notes}
            rowKey={(n) => n.id}
            cols={[
              { header: "Note", cell: (n) => <><div className="font-medium">{KIND[n.kind]} {n.number}</div><div className="text-[12px] fx-muted">{n.reason?.replace(/_/g, " ")} · {n.note}</div></> },
              { header: "Total", align: "right", cell: (n) => money(n.totals.totalPaise) },
              { header: "", cell: (n) => <Button size="sm" onClick={() => void pdf(n.id)}>PDF</Button> },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}

function NoteForm({ invoice, kind, onDone, onCancel }: { invoice: BillingDoc; kind: "credit" | "debit"; onDone: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState<string>(kind === "credit" ? "return" : "additional_charge");
  const [text, setText] = useState("");
  const [by, setBy] = useState<"quantity" | "amount">(kind === "credit" ? "quantity" : "amount");
  const [values, setValues] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(idempotencyKey);

  const lines = invoice.lines
    .map((l) => {
      const raw = values[l.lineNo]?.trim();
      if (!raw) return null;
      if (by === "quantity") {
        const q = Number(raw);
        return Number.isInteger(q) && q >= 1 ? { lineNo: l.lineNo, quantity: q } : "bad";
      }
      const p = toPaise(raw);
      return p && p > 0 ? { lineNo: l.lineNo, amountPaise: p } : "bad";
    })
    .filter((l) => l !== null);
  const valid = lines.length > 0 && !lines.includes("bad") && text.trim().length > 0;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const clean = lines.filter((l) => l !== "bad");
      const doc =
        kind === "credit"
          ? await financeApi.creditNote(key, invoice.id, { reason: reason as CreditReason, note: text.trim(), lines: clean })
          : await financeApi.debitNote(key, invoice.id, { reason: reason as DebitReason, note: text.trim(), lines: clean.filter((l): l is { lineNo: number; amountPaise: number } => "amountPaise" in l) });
      toast(`${KIND[doc.kind]} ${doc.number} issued.`);
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fx-card fx-card-pad flex flex-col gap-3">
      <h3 className="fx-card-title">{kind === "credit" ? "Issue credit note" : "Issue debit note"}</h3>
      <FormField label="Reason" required>
        {({ inputId }) => (
          <SelectInput id={inputId} value={reason} onChange={(e) => setReason(e.target.value)}>
            {(kind === "credit" ? ["return", "cancellation", "price_reduction", "other"] : ["additional_charge", "price_reduction", "other"]).map((r) => (
              <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
            ))}
          </SelectInput>
        )}
      </FormField>
      {kind === "credit" ? (
        <FormField label="Credit by">
          {({ inputId }) => (
            <SelectInput id={inputId} value={by} onChange={(e) => { setBy(e.target.value as "quantity" | "amount"); setValues({}); }}>
              <option value="quantity">Units (returned or cancelled)</option>
              <option value="amount">Amount (₹)</option>
            </SelectInput>
          )}
        </FormField>
      ) : null}
      {invoice.lines.map((l) => (
        <FormField key={l.lineNo} label={`#${l.lineNo} ${l.description}`} helper={by === "quantity" ? `Up to ${l.quantity} ${l.unit}` : `Line value ${money(l.valuePaise)}`}>
          {({ inputId }) => (
            <TextInput id={inputId} inputMode={by === "quantity" ? "numeric" : "decimal"} placeholder={by === "quantity" ? "Units" : "₹"} value={values[l.lineNo] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [l.lineNo]: e.target.value }))} />
          )}
        </FormField>
      ))}
      <FormField label="Note" required>
        {({ inputId }) => <TextArea id={inputId} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />}
      </FormField>
      {error ? <p className="fx-field-error" role="alert">{error}</p> : null}
      <div className="flex gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={!valid || busy} onClick={() => void submit()}>{busy ? "Issuing…" : "Issue note"}</Button>
      </div>
    </div>
  );
}
