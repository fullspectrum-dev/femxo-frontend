"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardHeader, FormField, PageHeader, SelectInput, TextInput, useToast } from "@/components/admin-ui";
import { idempotencyKey } from "@/lib/api";
import { errorCodeOf, errorText, isNetworkError, money, toPaise } from "@/features/finance/kit";
import { fieldApi } from "./field.api";
import type { CatalogProduct, Customer, Dealer, OrderLine, SubDealer } from "./field.api";
import { queueOrder, useOrderQueue } from "./offline";

interface Line extends OrderLine {
  name: string;
  label: string;
}
type Owner = { kind: "dealer"; id: string; name: string } | { kind: "sub"; id: string; parent: string; name: string };

const PHONE = /^[6-9]\d{9}$/;

/**
 * Place an order for a customer. The owner is a Dealer or a Sub-Dealer inside my territories (for a Sub-Dealer the
 * backend takes its parent Dealer itself). Prices are the catalog's GST-inclusive prices. The idempotency key is made
 * once per order, so a retry or the offline queue can never place it twice.
 */
export function NewOrderScreen() {
  const toast = useToast();
  const queue = useOrderQueue();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [delivery, setDelivery] = useState("");
  const [key, setKey] = useState(idempotencyKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<string | null>(null);

  // A customer chosen on "My customers" arrives as ?customer=<id>.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("customer");
    if (id && /^[0-9a-f]{24}$/i.test(id)) fieldApi.customer(id).then(setCustomer, () => undefined);
  }, []);

  const deliveryPaise = delivery.trim() ? toPaise(delivery) : 0;
  const itemsTotal = lines.reduce((s, l) => s + l.unitPricePaise * l.quantity, 0);
  const ready = customer && owner && lines.length > 0 && deliveryPaise !== null && lines.every((l) => l.quantity >= 1);

  function addLine(product: CatalogProduct, variantId: string) {
    const v = product.variants.find((x) => x.id === variantId);
    if (!v) return;
    setKey(idempotencyKey());
    setLines((current) => {
      const at = current.findIndex((l) => l.variantId === v.id);
      if (at >= 0) return current.map((l, i) => (i === at ? { ...l, quantity: l.quantity + 1 } : l));
      return [...current, { productId: product.id, variantId: v.id, categoryId: product.categoryId, quantity: 1, unitPricePaise: v.price, gstRateBp: product.gstRateBp, name: product.name, label: v.label }];
    });
  }
  function setQty(variantId: string, quantity: number) {
    setKey(idempotencyKey());
    setLines((current) => (quantity <= 0 ? current.filter((l) => l.variantId !== variantId) : current.map((l) => (l.variantId === variantId ? { ...l, quantity } : l))));
  }

  async function submit() {
    if (!ready || !customer || !owner) return;
    const payload = {
      customerId: customer.id,
      ...(owner.kind === "dealer" ? { ownerDealerId: owner.id } : { ownerSubDealerId: owner.id }),
      deliveryChargePaise: deliveryPaise ?? 0,
      items: lines.map(({ productId, variantId, categoryId, quantity, unitPricePaise, gstRateBp }) => ({ productId, variantId, categoryId, quantity, unitPricePaise, gstRateBp })),
    };
    const reset = (message: string) => {
      setPlaced(message);
      setLines([]);
      setDelivery("");
      setKey(idempotencyKey());
    };
    setBusy(true);
    setError(null);
    try {
      if (!queue.online) throw new TypeError("offline");
      const out = await fieldApi.placeOrder({ ...payload, idempotencyKey: key });
      toast(out.replayed ? `Order ${out.order.orderNumber} was already placed.` : `Order ${out.order.orderNumber} placed.`);
      reset(`Order ${out.order.orderNumber} placed for ${customer.name}.`);
    } catch (e) {
      if (isNetworkError(e)) {
        queueOrder({ key, label: `${customer.name} · ${lines.length} items · ${money(itemsTotal + (deliveryPaise ?? 0))}`, payload });
        toast("No connection. The order is saved on this phone and will be sent when you are back online.");
        reset(`Saved offline for ${customer.name}. It is sent automatically.`);
      } else {
        const code = errorCodeOf(e);
        setError(
          code === "OWNER_MISMATCH"
            ? "That Sub-Dealer works under another Dealer."
            : code === "OWNER_NOT_ACTIVE"
              ? "The chosen owner (or their Dealer) is not active."
              : code === "TERRITORY_OUT_OF_SCOPE"
                ? "You can only place orders for owners inside your territories."
                : code === "NO_COMMISSION_PLAN"
                  ? "No commission plan applies to this owner yet. Ask Finance to publish one."
                  : errorText(e)
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 pb-24">
      <PageHeader title="New order" description={queue.online ? undefined : "You are offline. Orders are saved and sent later."} />
      {queue.entries.length > 0 ? (
        <Card>
          <CardHeader title="Waiting to send" action={<Button size="sm" disabled={!queue.online || queue.flushing} onClick={() => void queue.flush()}>{queue.flushing ? "Sending…" : "Send now"}</Button>} />
          <ul className="flex flex-col gap-2 text-[14px]">
            {queue.entries.map((q) => (
              <li key={q.key} className="flex items-start justify-between gap-2">
                <span>
                  {q.label}
                  {q.error ? <span className="block text-[12px] fx-field-error">{q.error}</span> : null}
                </span>
                {q.error ? <Button size="sm" variant="ghost" onClick={() => queue.drop(q.key)}>Drop</Button> : <Badge tone="warning">Queued</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {placed ? (
        <Card>
          <p className="text-[14px]">{placed}</p>
        </Card>
      ) : null}

      <CustomerStep customer={customer} onChange={(c) => { setCustomer(c); setKey(idempotencyKey()); setPlaced(null); }} />
      <OwnerStep owner={owner} onChange={(o) => { setOwner(o); setKey(idempotencyKey()); }} />
      <ProductStep onAdd={addLine} />

      <Card>
        <CardHeader title="Items" />
        {lines.length === 0 ? <p className="text-[14px] fx-muted">Search or scan products to add them.</p> : null}
        <ul className="flex flex-col gap-3">
          {lines.map((l) => (
            <li key={l.variantId} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{l.name}</div>
                <div className="text-[12px] fx-muted">{l.label} · {money(l.unitPricePaise)} · GST {l.gstRateBp / 100}%</div>
              </div>
              <div className="flex flex-none items-center gap-1">
                <Button size="sm" iconOnly aria-label="One less" onClick={() => setQty(l.variantId, l.quantity - 1)}>−</Button>
                <TextInput aria-label={`Quantity of ${l.name}`} inputMode="numeric" className="w-14 text-center" value={String(l.quantity)} onChange={(e) => setQty(l.variantId, Math.min(1_000_000, Number(e.target.value.replace(/\D/g, "")) || 0))} />
                <Button size="sm" iconOnly aria-label="One more" onClick={() => setQty(l.variantId, l.quantity + 1)}>+</Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <FormField label="Delivery charge (₹)" error={deliveryPaise === null ? "Enter an amount like 40 or 40.50" : undefined}>
            {({ inputId }) => <TextInput id={inputId} inputMode="decimal" placeholder="0" value={delivery} onChange={(e) => { setDelivery(e.target.value); setKey(idempotencyKey()); }} />}
          </FormField>
        </div>
      </Card>

      <Card>
        <CardHeader title="Review" />
        <dl className="flex flex-col gap-1 text-[14px]">
          <div className="flex justify-between"><dt>Customer</dt><dd>{customer ? `${customer.name} (${customer.phone})` : "—"}</dd></div>
          <div className="flex justify-between"><dt>Owner</dt><dd>{owner ? `${owner.name} (${owner.id})` : "—"}</dd></div>
          <div className="flex justify-between"><dt>Items ({lines.reduce((s, l) => s + l.quantity, 0)} units)</dt><dd>{money(itemsTotal)}</dd></div>
          <div className="flex justify-between"><dt>Delivery</dt><dd>{money(deliveryPaise ?? 0)}</dd></div>
          <div className="flex justify-between text-[16px] font-semibold"><dt>Total (GST incl.)</dt><dd>{money(itemsTotal + (deliveryPaise ?? 0))}</dd></div>
        </dl>
        {error ? <p className="fx-field-error mt-3" role="alert">{error}</p> : null}
      </Card>

      <div className="sticky bottom-[72px] z-10 sm:bottom-4">
        <Button variant="primary" size="lg" block disabled={!ready || busy} onClick={() => void submit()}>
          {busy ? "Placing…" : queue.online ? `Place order · ${money(itemsTotal + (deliveryPaise ?? 0))}` : "Save order offline"}
        </Button>
      </div>
    </div>
  );
}

function CustomerStep({ customer, onChange }: { customer: Customer | null; onChange: (c: Customer | null) => void }) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function find() {
    setError(null);
    try {
      const page = await fieldApi.customers(phone, null);
      if (page.items[0]) onChange(page.items[0]);
      else setError("No customer with that number in your territory. Register them first.");
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <Card>
      <CardHeader title="1. Customer" />
      {customer ? (
        <div className="flex items-center justify-between gap-2 text-[14px]">
          <span><strong>{customer.name}</strong> <span className="fx-muted">{customer.phone}</span> {customer.status === "blocked" ? <Badge tone="error">Blocked</Badge> : null}</span>
          <Button size="sm" onClick={() => onChange(null)}>Change</Button>
        </div>
      ) : (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void find(); }}>
          <TextInput aria-label="Customer mobile" type="tel" inputMode="tel" placeholder="Customer mobile number" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, "").slice(-10))} className="flex-1" />
          <Button type="submit" disabled={!PHONE.test(phone)}>Find</Button>
        </form>
      )}
      {error ? <p className="fx-field-error mt-2">{error}</p> : null}
    </Card>
  );
}

function OwnerStep({ owner, onChange }: { owner: Owner | null; onChange: (o: Owner | null) => void }) {
  const [kind, setKind] = useState<"sub" | "dealer">("sub");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<(Dealer | SubDealer)[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function search() {
    setError(null);
    setLoading(true);
    try {
      setResults(kind === "dealer" ? await fieldApi.dealers(q) : await fieldApi.subDealers(q));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <Card>
      <CardHeader title="2. Order owner" description="The Sub-Dealer (or Dealer) who earns the commission. A Sub-Dealer's own Dealer is added by the system." />
      {owner ? (
        <div className="flex items-center justify-between gap-2 text-[14px]">
          <span>
            <strong>{owner.name}</strong> <span className="fx-muted">{owner.id}{owner.kind === "sub" ? ` · under ${owner.parent}` : ""}</span>
          </span>
          <Button size="sm" onClick={() => onChange(null)}>Change</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
            <SelectInput aria-label="Owner type" value={kind} onChange={(e) => { setKind(e.target.value as "sub" | "dealer"); setResults([]); }} className="w-auto">
              <option value="sub">Sub-Dealer</option>
              <option value="dealer">Dealer</option>
            </SelectInput>
            <TextInput aria-label="Search owner" placeholder="Name, ID or mobile" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1" />
            <Button type="submit" disabled={loading}>Search</Button>
          </form>
          {error ? <p className="fx-field-error">{error}</p> : null}
          <ul className="flex flex-col gap-1">
            {results.map((r) => {
              const o: Owner = "subDealerId" in r ? { kind: "sub", id: r.subDealerId, parent: r.parentDealerId, name: r.name } : { kind: "dealer", id: r.dealerId, name: r.businessName };
              return (
                <li key={o.id}>
                  <button type="button" className="w-full rounded px-2 py-2 text-left text-[14px] hover:bg-[color:var(--fx-hover,#f4f4f5)]" onClick={() => onChange(o)}>
                    <strong>{o.name}</strong> <span className="fx-muted">{o.id}{o.kind === "sub" ? ` · under ${o.parent}` : ""}</span>
                  </button>
                </li>
              );
            })}
            {!loading && results.length === 0 && q ? <li className="text-[13px] fx-muted">Search to list active owners in your territory.</li> : null}
          </ul>
        </div>
      )}
    </Card>
  );
}

function ProductStep({ onAdd }: { onAdd: (p: CatalogProduct, variantId: string) => void }) {
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isBarcode = useMemo(() => /^[\d\s-]{8,}$/.test(q.trim()), [q]);

  async function search() {
    const term = q.trim();
    if (term.length < 2) return;
    setError(null);
    setLoading(true);
    try {
      if (isBarcode) {
        const { product, variantId } = await fieldApi.barcode(term);
        onAdd(product, variantId);
        setQ("");
        setProducts([]);
      } else setProducts(await fieldApi.search(term));
    } catch (e) {
      const code = errorCodeOf(e);
      setError(code === "BARCODE_NOT_FOUND" ? "No product has that barcode." : code === "INVALID_BARCODE" ? "That barcode is not valid. Check the digits." : errorText(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader title="3. Products" description="Type a name, or scan / type a barcode." />
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <TextInput aria-label="Product or barcode" placeholder="Product name or barcode" enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1" />
        <Button type="submit" disabled={loading || q.trim().length < 2}>{isBarcode ? "Add" : "Search"}</Button>
      </form>
      {error ? <p className="fx-field-error mt-2">{error}</p> : null}
      <ul className="mt-3 flex flex-col gap-3">
        {products.map((p) => (
          <li key={p.id}>
            <div className="font-medium">{p.name}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {p.variants.map((v) => (
                <Button key={v.id} size="sm" onClick={() => onAdd(p, v.id)}>
                  + {v.label} · {money(v.price)}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
