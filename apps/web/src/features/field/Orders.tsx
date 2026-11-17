"use client";

import { useState } from "react";
import { Badge, Button, Drawer, ErrorState, FormField, PageHeader, SelectInput, TextInput, useToast } from "@/components/admin-ui";
import { idempotencyKey } from "@/lib/api";
import { dateTime, errorCodeOf, errorText, isNetworkError, money, toPaise, useAsync, useCan, usePaged } from "@/features/finance/kit";
import { fieldApi } from "./field.api";
import type { Order } from "./field.api";

const TONE = { pending_approval: "warning", pending_payment: "warning", payment_failed: "error", placed: "info", completed: "success", cancelled: "error" } as const;
const LABEL = { pending_approval: "Awaiting approval", pending_payment: "Awaiting payment", payment_failed: "Payment failed", placed: "Placed", completed: "Completed", cancelled: "Cancelled" } as const;

/** Orders inside my territories, newest first, and the cash or UPI I collect for one (COD). */
export function FieldOrdersScreen() {
  const [number, setNumber] = useState("");
  const [query, setQuery] = useState<string | undefined>(undefined);
  const list = usePaged((cursor) => fieldApi.orders(query, cursor), [query]);
  const [open, setOpen] = useState<Order | null>(null);
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
      <PageHeader title="My orders" />
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(/^ORD-\d{1,12}$/i.test(number.trim()) ? number.trim().toUpperCase() : undefined); }}>
        <TextInput aria-label="Order number" placeholder="ORD-…" value={number} onChange={(e) => setNumber(e.target.value)} className="flex-1" />
        <Button type="submit">Find</Button>
      </form>
      {list.error ? <ErrorState message={errorText(list.error)} action={<Button onClick={list.reload}>Retry</Button>} /> : null}
      {!list.loading && list.items.length === 0 && !list.error ? <p className="text-[14px] fx-muted">No orders.</p> : null}
      <ul className="flex flex-col gap-2">
        {list.items.map((o) => (
          <li key={o.id}>
            <button type="button" className="fx-card fx-card-pad w-full text-left" onClick={() => setOpen(o)}>
              <div className="flex items-center justify-between gap-2">
                <strong>{o.orderNumber}</strong>
                <Badge tone={TONE[o.status]}>{LABEL[o.status]}</Badge>
              </div>
              <div className="text-[13px] fx-muted">
                {dateTime(o.placedAt)} · {o.itemCount} items · {o.ownerSubDealerId ?? o.ownerDealerId ?? "Company"}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {list.hasMore ? <Button disabled={list.loading} onClick={() => void list.more()}>Load more</Button> : null}
      <Drawer open={open !== null} onClose={() => setOpen(null)} title={open?.orderNumber ?? ""} subtitle={open ? dateTime(open.placedAt) : undefined}>
        {open ? <OrderPayments order={open} /> : null}
      </Drawer>
    </div>
  );
}

function OrderPayments({ order }: { order: Order }) {
  const can = useCan();
  const toast = useToast();
  const summary = useAsync(() => fieldApi.payments(order.id), [order.id]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "upi">("cash");
  const [reference, setReference] = useState("");
  const [key, setKey] = useState(idempotencyKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paise = toPaise(amount);
  const outstanding = summary.data?.outstandingPaise ?? 0;

  async function collect() {
    if (!paise || !reference.trim()) return;
    setBusy(true);
    setError(null);
    const body = { amountPaise: paise, method, reference: reference.trim() };
    try {
      await fieldApi.collect(order.id, { ...body, collectionKey: key });
      toast(`${money(paise)} ${method === "cash" ? "cash" : "UPI"} recorded.`);
      setAmount("");
      setReference("");
      setKey(idempotencyKey());
      summary.reload();
    } catch (e) {
      if (isNetworkError(e)) {
        // The key is kept, so pressing again once back online records it once even if the first try did arrive.
        setError("No connection. Press Record again with the same details when you are back online.");
      } else {
        const code = errorCodeOf(e);
        setError(code === "EXCEEDS_OUTSTANDING" ? "That is more than the order still owes." : code === "ORDER_CANCELLED" ? "This order is cancelled." : errorText(e));
      }
    } finally {
      setBusy(false);
    }
  }

  if (summary.error) return <ErrorState message={errorText(summary.error)} />;
  if (!summary.data) return <p className="fx-muted">Loading…</p>;
  const s = summary.data;
  return (
    <div className="flex flex-col gap-4 text-[14px]">
      <dl className="grid grid-cols-3 gap-2">
        <div><dt className="fx-muted">Payable</dt><dd className="font-semibold">{money(s.payablePaise)}</dd></div>
        <div><dt className="fx-muted">Collected</dt><dd className="font-semibold">{money(s.collectedPaise)}</dd></div>
        <div><dt className="fx-muted">Outstanding</dt><dd className="font-semibold">{money(s.outstandingPaise)}</dd></div>
      </dl>
      {s.payments.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {s.payments.map((p) => (
            <li key={p.id} className="flex justify-between">
              <span>{p.method.toUpperCase()} · {p.reference} <span className="fx-muted">{dateTime(p.recordedAt)}</span></span>
              <span>{money(p.amountPaise)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {can("cod.collect") && outstanding > 0 && (order.status === "placed" || order.status === "completed") ? (
        <div className="fx-card fx-card-pad flex flex-col gap-3">
          <h3 className="fx-card-title">Record collection</h3>
          <FormField label="Amount (₹)" required error={amount && (!paise || paise > outstanding) ? `Up to ${money(outstanding)}` : undefined}>
            {({ inputId }) => <TextInput id={inputId} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setKey(idempotencyKey()); }} />}
          </FormField>
          <Button size="sm" onClick={() => { setAmount((outstanding / 100).toFixed(2)); setKey(idempotencyKey()); }}>Full amount {money(outstanding)}</Button>
          <FormField label="Method">
            {({ inputId }) => (
              <SelectInput id={inputId} value={method} onChange={(e) => { setMethod(e.target.value as "cash" | "upi"); setKey(idempotencyKey()); }}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
              </SelectInput>
            )}
          </FormField>
          <FormField label={method === "upi" ? "UPI transaction ID" : "Receipt number"} required>
            {({ inputId }) => <TextInput id={inputId} maxLength={100} value={reference} onChange={(e) => { setReference(e.target.value); setKey(idempotencyKey()); }} />}
          </FormField>
          {error ? <p className="fx-field-error" role="alert">{error}</p> : null}
          <Button variant="gold" block disabled={busy || !paise || paise > outstanding || !reference.trim()} onClick={() => void collect()}>
            {busy ? "Recording…" : "Record collection"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
