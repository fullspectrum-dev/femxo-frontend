"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, CardHeader, ErrorState, FormField, PageHeader, TextInput, useToast } from "@/components/admin-ui";
import { idempotencyKey } from "@/lib/api";
import { dateTime, errorCodeOf, errorText, money, useAsync } from "@/features/finance/kit";
import { fieldApi } from "./field.api";
import type { Customer } from "./field.api";

const PHONE = /^[6-9]\d{9}$/;

/** Sell a Prime plan to a customer and record the receipt or transaction number they were given (there is no gateway). */
export function SellPrimeScreen() {
  const toast = useToast();
  const plans = useAsync(() => fieldApi.plans(), []);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [phone, setPhone] = useState("");
  const [planId, setPlanId] = useState<string | null>(null);
  const [paymentRef, setRef] = useState("");
  const [key, setKey] = useState(idempotencyKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("customer");
    if (id && /^[0-9a-f]{24}$/i.test(id)) fieldApi.customer(id).then(setCustomer, () => undefined);
  }, []);

  async function find() {
    setError(null);
    try {
      const page = await fieldApi.customers(phone, null);
      if (page.items[0]) setCustomer(page.items[0]);
      else setError("No customer with that number in your territory.");
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function sell() {
    if (!customer || !planId || paymentRef.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const out = await fieldApi.subscribe({ customerId: customer.id, planId, paymentRef: paymentRef.trim(), idempotencyKey: key });
      const plan = plans.data?.find((p) => p.id === planId);
      setDone(`${customer.name} is now Prime${plan ? ` (${plan.name})` : ""}.`);
      toast(out.replayed ? "This sale was already recorded." : "Prime subscription recorded.");
      setKey(idempotencyKey());
      setRef("");
      setCustomer(null);
    } catch (e) {
      const code = errorCodeOf(e);
      setError(code === "ALREADY_PRIME" ? "This customer already has an active Prime plan." : code === "CUSTOMER_BLOCKED" ? "This customer is blocked." : code === "PLAN_ARCHIVED" ? "That plan is no longer sold." : errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
      <PageHeader title="Sell Prime" />
      {done ? <Card><p className="text-[14px]">{done}</p></Card> : null}
      <Card>
        <CardHeader title="Customer" />
        {customer ? (
          <div className="flex items-center justify-between gap-2 text-[14px]">
            <span>
              <strong>{customer.name}</strong> <span className="fx-muted">{customer.phone}</span>{" "}
              {customer.prime.status === "active" ? <Badge tone="gold">Prime until {dateTime(customer.prime.until)}</Badge> : null}
            </span>
            <Button size="sm" onClick={() => setCustomer(null)}>Change</Button>
          </div>
        ) : (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void find(); }}>
            <TextInput aria-label="Customer mobile" type="tel" inputMode="tel" placeholder="Customer mobile number" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(-10))} className="flex-1" />
            <Button type="submit" disabled={!PHONE.test(phone)}>Find</Button>
          </form>
        )}
      </Card>
      <Card>
        <CardHeader title="Plan" />
        {plans.error ? <ErrorState message={errorText(plans.error)} action={<Button onClick={plans.reload}>Retry</Button>} /> : null}
        <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Prime plan">
          {(plans.data ?? []).map((p) => (
            <li key={p.id}>
              <label className={`fx-card fx-card-pad flex cursor-pointer items-start gap-3 ${planId === p.id ? "ring-2 ring-[color:var(--fx-purple,#6d28d9)]" : ""}`}>
                <input type="radio" name="plan" checked={planId === p.id} onChange={() => { setPlanId(p.id); setKey(idempotencyKey()); }} />
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2"><strong>{p.name}</strong><span>{money(p.pricePaise)}</span></span>
                  <span className="block text-[13px] fx-muted">{p.durationDays} days{p.benefits.length ? ` · ${p.benefits.join(" · ")}` : ""}</span>
                </span>
              </label>
            </li>
          ))}
          {plans.data && plans.data.length === 0 ? <li className="text-[14px] fx-muted">No Prime plans on sale.</li> : null}
        </ul>
      </Card>
      <Card className="flex flex-col gap-3">
        <FormField label="Receipt / transaction number" required helper="What the customer paid with: the cash receipt or the UPI transaction ID.">
          {({ inputId }) => <TextInput id={inputId} maxLength={100} value={paymentRef} onChange={(e) => { setRef(e.target.value); setKey(idempotencyKey()); }} />}
        </FormField>
        {error ? <p className="fx-field-error" role="alert">{error}</p> : null}
        <Button variant="gold" size="lg" block disabled={busy || !customer || !planId || paymentRef.trim().length < 3 || customer.prime.status === "active"} onClick={() => void sell()}>
          {busy ? "Recording…" : "Record Prime sale"}
        </Button>
      </Card>
    </div>
  );
}
