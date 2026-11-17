"use client";

import { useState } from "react";
import { Badge, Button, Card, Drawer, ErrorState, FormField, PageHeader, TextInput, useToast } from "@/components/admin-ui";
import { PanelLink } from "@/features/admin/shell/PanelContext";
import { errorCodeOf, errorText, useAsync, useCan, usePaged } from "@/features/finance/kit";
import { fieldApi } from "./field.api";
import type { Customer, Territory } from "./field.api";

const PHONE = /^[6-9]\d{9}$/;
const cleanPhone = (v: string) => v.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");

/** My customers: find one by phone, register a new one at a location in my territory, edit one. Built for a phone. */
export function CustomersScreen() {
  const can = useCan();
  const [phone, setPhone] = useState("");
  const [query, setQuery] = useState<string | undefined>(undefined);
  const list = usePaged((cursor) => fieldApi.customers(query, cursor), [query]);
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const searchPhone = cleanPhone(phone);

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
      <PageHeader title="My customers" actions={can("customer.manage") ? <Button variant="primary" onClick={() => setEditing("new")}>Register</Button> : undefined} />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(searchPhone ? searchPhone : undefined);
        }}
      >
        <TextInput aria-label="Search by phone" type="tel" inputMode="tel" placeholder="Search by mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} className="flex-1" />
        <Button type="submit" disabled={searchPhone !== "" && !PHONE.test(searchPhone)}>Find</Button>
      </form>
      {list.error ? <ErrorState message={errorText(list.error)} action={<Button onClick={list.reload}>Retry</Button>} /> : null}
      {!list.loading && list.items.length === 0 && !list.error ? (
        <Card>
          <p className="text-[14px] fx-muted">{query ? "No customer with that number in your territory." : "No customers yet."}</p>
          {query && can("customer.manage") ? <Button className="mt-3" variant="primary" onClick={() => setEditing("new")}>Register {query}</Button> : null}
        </Card>
      ) : null}
      <ul className="flex flex-col gap-2">
        {list.items.map((c) => (
          <li key={c.id}>
            <Card className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{c.name}</div>
                  <div className="text-[13px] fx-muted">{c.phone}{c.addressLine ? ` · ${c.addressLine}` : ""}</div>
                </div>
                <span className="flex flex-none gap-1">
                  {c.prime.status === "active" ? <Badge tone="gold">Prime</Badge> : null}
                  {c.status === "blocked" ? <Badge tone="error">Blocked</Badge> : null}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {can("order.create") && c.status === "active" ? (
                  <PanelLink href={`/admin/new-order?customer=${c.id}`} className="fx-btn fx-btn--primary fx-btn--sm">Place order</PanelLink>
                ) : null}
                {can("membership.subscribe") && c.prime.status !== "active" && c.status === "active" ? (
                  <PanelLink href={`/admin/sell-prime?customer=${c.id}`} className="fx-btn fx-btn--gold fx-btn--sm">Sell Prime</PanelLink>
                ) : null}
                {can("customer.manage") ? <Button size="sm" onClick={() => setEditing(c)}>Edit</Button> : null}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {list.hasMore ? <Button disabled={list.loading} onClick={() => void list.more()}>Load more</Button> : null}
      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Register customer" : "Edit customer"}>
        {editing ? (
          <CustomerForm
            key={editing === "new" ? "new" : editing.id}
            customer={editing === "new" ? null : editing}
            initialPhone={editing === "new" ? query ?? "" : ""}
            onSaved={() => {
              setEditing(null);
              list.reload();
            }}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

function CustomerForm({ customer, initialPhone, onSaved }: { customer: Customer | null; initialPhone: string; onSaved: () => void }) {
  const toast = useToast();
  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState(customer?.name ?? "");
  const [email, setEmail] = useState("");
  const [addressLine, setAddress] = useState(customer?.addressLine ?? "");
  const [pincode, setPincode] = useState(customer?.pincode ?? "");
  const [location, setLocation] = useState<Territory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = cleanPhone(phone);
  const validPin = pincode === "" || /^\d{6}$/.test(pincode);
  const validEmail = email === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const ready = name.trim() && validPin && validEmail && (customer ? true : PHONE.test(p) && location);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (customer) {
        // Only the fields that changed: phone and email come back masked and must not be written back.
        await fieldApi.updateCustomer(customer.id, {
          rev: customer.rev ?? 0,
          ...(name.trim() !== customer.name ? { name: name.trim() } : {}),
          ...(email ? { email } : {}),
          ...(addressLine.trim() !== (customer.addressLine ?? "") ? { addressLine: addressLine.trim() || null } : {}),
          ...(pincode !== (customer.pincode ?? "") ? { pincode: pincode || null } : {}),
          ...(location ? { locationId: location.id } : {}),
        });
        toast("Customer updated.");
      } else {
        await fieldApi.createCustomer({
          phone: p,
          name: name.trim(),
          ...(email ? { email } : {}),
          ...(addressLine.trim() ? { addressLine: addressLine.trim() } : {}),
          ...(pincode ? { pincode } : {}),
          locationId: location!.id,
        });
        toast(`${name.trim()} registered.`);
      }
      onSaved();
    } catch (e) {
      const code = errorCodeOf(e);
      setError(
        code === "PHONE_ALREADY_REGISTERED"
          ? "This number is already registered. Search for it instead."
          : code === "CUSTOMER_CHANGED"
            ? "This customer changed since it was loaded. Reload the list and try again."
            : code === "OUTSIDE_YOUR_TERRITORY"
              ? "That location is outside your territory."
              : errorText(e)
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {customer ? (
        <p className="text-[14px] fx-muted">{customer.phone}</p>
      ) : (
        <FormField label="Mobile number" required error={phone && !PHONE.test(p) ? "Enter a 10-digit mobile number" : undefined}>
          {({ inputId }) => <TextInput id={inputId} type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} />}
        </FormField>
      )}
      <FormField label="Name" required>{({ inputId }) => <TextInput id={inputId} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />}</FormField>
      <FormField label="Email" helper={customer?.email ? `Now ${customer.email}; leave empty to keep it` : "Optional"} error={validEmail ? undefined : "Enter a valid email"}>
        {({ inputId }) => <TextInput id={inputId} type="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} />}
      </FormField>
      <FormField label="Address">{({ inputId }) => <TextInput id={inputId} value={addressLine} maxLength={300} onChange={(e) => setAddress(e.target.value)} />}</FormField>
      <FormField label="Pincode" error={validPin ? undefined : "6 digits"}>
        {({ inputId }) => <TextInput id={inputId} inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} />}
      </FormField>
      <LocationPicker value={location} current={customer?.locationId ?? null} onChange={setLocation} required={!customer} />
      {error ? <p className="fx-field-error" role="alert">{error}</p> : null}
      <Button variant="primary" block disabled={!ready || busy} onClick={() => void save()}>
        {busy ? "Saving…" : customer ? "Save changes" : "Register customer"}
      </Button>
    </div>
  );
}

/** Drill down the location tree (state → district → … → village or ward) and pick the place the customer lives. */
export function LocationPicker({ value, current, onChange, required }: { value: Territory | null; current: string | null; onChange: (t: Territory | null) => void; required?: boolean }) {
  const [trail, setTrail] = useState<Territory[]>([]);
  const parent = trail.at(-1)?.id;
  const children = useAsync(() => fieldApi.territories(parent), [parent]);
  const now = useAsync(() => (current ? fieldApi.trail(current) : Promise.resolve(null)), [current]);
  const [filter, setFilter] = useState("");
  const shown = (children.data ?? []).filter((t) => t.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="fx-field-label">
        Location{required ? <span className="fx-req" aria-hidden="true">*</span> : null}
      </legend>
      {value ? (
        <div className="flex items-center justify-between gap-2 text-[14px]">
          <span>
            <strong>{value.name}</strong> <span className="fx-muted">({value.type})</span>
          </span>
          <Button size="sm" onClick={() => onChange(null)}>Change</Button>
        </div>
      ) : (
        <>
          {now.data ? <p className="text-[13px] fx-muted">Now: {[...now.data.ancestors, now.data.territory].map((t) => t.name).join(" › ")}</p> : null}
          <nav aria-label="Location path" className="flex flex-wrap items-center gap-1 text-[13px]">
            <button type="button" className="underline" onClick={() => { setTrail([]); setFilter(""); }}>States</button>
            {trail.map((t, i) => (
              <span key={t.id}>
                ›{" "}
                <button type="button" className="underline" onClick={() => { setTrail(trail.slice(0, i + 1)); setFilter(""); }}>{t.name}</button>
              </span>
            ))}
          </nav>
          {trail.length > 0 ? <Button size="sm" onClick={() => onChange(trail.at(-1)!)}>Use {trail.at(-1)!.name}</Button> : null}
          <TextInput aria-label="Filter places" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {children.error ? <p className="fx-field-error">{errorText(children.error)}</p> : null}
          <ul className="max-h-[240px] overflow-y-auto rounded border border-[color:var(--fx-border,#e5e7eb)]">
            {children.loading ? <li className="p-3 text-[13px] fx-muted">Loading…</li> : null}
            {!children.loading && shown.length === 0 ? <li className="p-3 text-[13px] fx-muted">No places below this one. Use the one above.</li> : null}
            {shown.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 border-b border-[color:var(--fx-border,#e5e7eb)] px-3 py-2 text-[14px] last:border-b-0">
                <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => { setTrail([...trail, t]); setFilter(""); }}>
                  {t.name} <span className="fx-muted">›</span>
                </button>
                <Button size="sm" onClick={() => onChange(t)}>Pick</Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </fieldset>
  );
}
