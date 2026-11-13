"use client";

import { Banknote, Check, CreditCard, Landmark, MapPin, Plus, Smartphone, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatINR, idempotencyKey } from "@femxo/shared";
import { isApiError } from "@femxo/shared/api";
import type { AddressApi, CheckoutApi } from "@femxo/shared/api";
import type { Address, AddressInput, CheckoutSession, PaymentIntent, PaymentMethod } from "@femxo/shared/contracts";
import { Button, buttonClasses, cn, EmptyState, ErrorState, Skeleton } from "@femxo/ui";
import { AddressForm } from "@/features/addresses/components/AddressForm";
import { RequireCustomer } from "@/features/auth/components/Guards";
import { BillSummary } from "@/features/cart/components/BillSummary";
import { useCart } from "@/features/cart/components/CartProvider";
import { PaymentSheet } from "@/features/payments/components/PaymentSheet";
import { getAddressApi, getCheckoutApi } from "@/lib/api";

const METHODS: { value: PaymentMethod; label: string; hint: string; icon: typeof Smartphone }[] = [
  { value: "upi", label: "UPI", hint: "Any UPI app", icon: Smartphone },
  { value: "card", label: "Card", hint: "Visa, Mastercard, RuPay", icon: CreditCard },
  { value: "netbanking", label: "Net banking", hint: "From your bank account", icon: Landmark },
  { value: "cod", label: "Cash on delivery", hint: "Orders up to ₹2,000", icon: Banknote },
];

const panel = "grid gap-3 rounded-card border border-line bg-surface p-4 md:p-5";
const panelTitle = "flex items-center gap-2 font-display text-base font-semibold";

const days = ({ min, max }: { min: number; max: number }) => (min === max ? `${min} day${min === 1 ? "" : "s"}` : `${min}–${max} days`);

interface Shortage {
  variantId: string;
  available: number;
}

/**
 * One-page checkout, the quick-commerce way: where it goes, how it arrives, how
 * you pay and what's in it, all on one screen, with "Place order" beside the bill
 * (pinned to the bottom on phones). There is a single delivery option, so it is
 * chosen for the shopper rather than asked as a step.
 */
function Checkout({ checkoutApi, addressApi }: { checkoutApi?: CheckoutApi; addressApi?: AddressApi }) {
  const router = useRouter();
  const { cart, status, refresh } = useCart();
  const checkoutRef = useRef(checkoutApi);
  const addressRef = useRef(addressApi);
  const checkout = () => (checkoutRef.current ??= getCheckoutApi());
  const addresses = () => (addressRef.current ??= getAddressApi());

  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [book, setBook] = useState<Address[]>([]);
  const [failed, setFailed] = useState(false);
  const [changingAddress, setChangingAddress] = useState(false);
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [payable, setPayable] = useState<{ orderId: string; intent: PaymentIntent; amount: number } | null>(null);
  const [placed, setPlaced] = useState(false);
  const placing = useRef(false);
  /** Once an order exists, this checkout is finished: no second request, however the button is pressed. */
  const done = useRef(false);
  const key = useRef<{ for: string; value: string }>({ for: "", value: "" });

  const hasItems = (cart?.lines.length ?? 0) > 0;

  const begin = useCallback(async () => {
    setFailed(false);
    try {
      const [started, list] = await Promise.all([checkout().start(), addresses().list()]);
      setSession(started);
      setBook(list);
      if (!started.address) setAdding(list.length === 0);
    } catch {
      setFailed(true);
    }
    // The api getters are stable refs.
  }, []);

  const started = useRef(false);
  useEffect(() => {
    if (started.current || status !== "ready" || !hasItems) return;
    started.current = true;
    // begin() only sets state after the requests have answered.
    void begin();
  }, [status, hasItems, begin]);

  async function choose(change: { addressId?: string; deliveryId?: "standard" }) {
    if (!session) return null;
    setError(undefined);
    try {
      const next = await checkout().update(session.id, change);
      setSession(next);
      return next;
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn't save that. Please try again.");
      return null;
    }
  }

  async function saveAddress(input: AddressInput) {
    const list = await addresses().create(input);
    setBook(list);
    setAdding(false);
    const created = list.find((entry) => entry.line1 === input.line1 && entry.pincode === input.pincode) ?? list[0]!;
    await choose({ addressId: created.id });
    setChangingAddress(false);
  }

  /** One key for one attempt: a repeat of this same order gets the same answer, never a second order. */
  function keyFor(sessionId: string, chosen: PaymentMethod) {
    const id = `${sessionId}:${chosen}`;
    if (key.current.for !== id) key.current = { for: id, value: idempotencyKey() };
    return key.current.value;
  }

  async function place() {
    if (!session || !session.address || placing.current || done.current) return;
    placing.current = true;
    setBusy(true);
    setError(undefined);
    setShortages([]);
    try {
      // The only delivery option is chosen for the shopper, just before the order is placed.
      const ready = session.delivery ? session : await choose({ deliveryId: "standard" });
      if (!ready) return;
      const result = await checkout().placeOrder(ready.id, method, keyFor(ready.id, method));
      done.current = true;
      setPlaced(true);
      void refresh();
      if (result.intent) setPayable({ orderId: result.order.id, intent: result.intent, amount: result.order.total });
      else router.push(`/orders/${result.order.id}?placed=1`);
    } catch (e) {
      if (isApiError(e, "OUT_OF_STOCK")) {
        setShortages((e.details?.lines as Shortage[] | undefined) ?? []);
        void refresh();
      } else if (isApiError(e)) setError(e.message);
      else setError("We couldn't place your order. Check your connection and try again.");
    } finally {
      placing.current = false;
      setBusy(false);
    }
  }

  if (placed && !payable) return <p role="status" className="py-12 text-center">Placing your order…</p>;

  if (status === "ready" && !hasItems && !placed) {
    return (
      <EmptyState
        title="Your cart is empty"
        message="Add something to your cart to check out."
        action={
          <Link href="/" className={buttonClasses()}>
            Start shopping
          </Link>
        }
      />
    );
  }
  if (failed) return <ErrorState title="We couldn't start your checkout" message="Check your connection and try again." onRetry={() => void begin()} />;
  if (!session) {
    return (
      <div role="status" className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <span className="sr-only">Loading your checkout…</span>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const shortNames = shortages.map((line) => ({ ...line, name: cart?.lines.find((entry) => entry.variant.id === line.variantId)?.product.name ?? "An item" }));
  const option = session.delivery ?? session.options[0] ?? null;
  const showBook = adding || changingAddress || !session.address;
  const placeLabel = method === "cod" ? `Place order · ${formatINR(session.breakup.total)}` : `Pay ${formatINR(session.breakup.total)}`;
  const canPlace = Boolean(session.address) && !adding;
  const errorLine = error ? (
    <p role="alert" className="text-sm font-medium text-danger">
      {error}
    </p>
  ) : null;

  return (
    <>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
        <div className="grid gap-3">
          <section aria-labelledby="address-heading" className={panel}>
            <div className="flex items-center justify-between gap-3">
              <h2 id="address-heading" className={panelTitle}>
                <MapPin size={18} className="text-primary" aria-hidden="true" />
                Deliver to
              </h2>
              {session.address && !showBook ? (
                <Button variant="ghost" size="sm" onClick={() => setChangingAddress(true)}>
                  Change
                </Button>
              ) : null}
            </div>

            {session.address && !showBook ? (
              <p className="text-sm">
                <span className="block font-semibold">
                  {session.address.name} <span className="font-normal text-ink-muted">+91 {session.address.mobile}</span>
                </span>
                {session.address.line1}
                {session.address.line2 ? `, ${session.address.line2}` : ""}, {session.address.city}, {session.address.district}, Bihar {session.address.pincode}
              </p>
            ) : (
              <>
                {book.length > 0 ? (
                  <fieldset className="grid gap-2">
                    <legend className="sr-only">Delivery address</legend>
                    {book.map((entry) => (
                      <label
                        key={entry.id}
                        className="flex cursor-pointer items-start gap-3 rounded-control border-2 border-line p-3 transition-colors duration-150 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
                      >
                        <input
                          type="radio"
                          name="address"
                          checked={session.address?.id === entry.id}
                          onChange={() => void choose({ addressId: entry.id }).then((next) => next && setChangingAddress(false))}
                          className="mt-1 size-4 accent-primary"
                        />
                        <span className="text-sm">
                          <span className="block font-semibold">
                            {entry.name} <span className="font-normal text-ink-muted">+91 {entry.mobile}</span>
                          </span>
                          <span className="block">
                            {entry.line1}
                            {entry.line2 ? `, ${entry.line2}` : ""}
                          </span>
                          <span className="block text-ink-muted">
                            {entry.city}, {entry.district}, Bihar {entry.pincode}
                          </span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                {adding ? (
                  <AddressForm onSave={saveAddress} onCancel={book.length > 0 ? () => setAdding(false) : undefined} submitLabel="Save and deliver here" offerDefault={book.length > 0} />
                ) : (
                  <Button variant="secondary" className="w-max" onClick={() => setAdding(true)}>
                    <Plus size={16} aria-hidden="true" />
                    Add a new address
                  </Button>
                )}
              </>
            )}
          </section>

          {option ? (
            <section aria-labelledby="delivery-heading" className={panel}>
              <h2 id="delivery-heading" className={panelTitle}>
                <Truck size={18} className="text-primary" aria-hidden="true" />
                Delivery
              </h2>
              <div className="flex items-center justify-between gap-3 rounded-control border-2 border-primary bg-primary-soft p-3 text-sm">
                <span className="flex items-center gap-2">
                  <Check size={16} className="text-primary" aria-hidden="true" />
                  <span>
                    <span className="block font-semibold">{option.label}</span>
                    {/* The estimate comes from the backend; nothing here invents a delivery time. */}
                    <span className="text-ink-muted">Arrives in {days(option.etaDays)}</span>
                  </span>
                </span>
                <span className={cn("font-display font-semibold", option.fee === 0 && "text-success")}>{option.fee === 0 ? "Free" : formatINR(option.fee)}</span>
              </div>
            </section>
          ) : null}

          <section aria-labelledby="payment-heading" className={panel}>
            <h2 id="payment-heading" className={panelTitle}>
              <CreditCard size={18} className="text-primary" aria-hidden="true" />
              Pay with
            </h2>
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="sr-only">Payment method</legend>
              {METHODS.map(({ value, label, hint, icon: Icon }) => {
                const disabled = value === "cod" && !session.codAllowed;
                return (
                  <label
                    key={value}
                    className={cn(
                      "grid gap-1 rounded-control border-2 border-line p-3 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                      disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary-soft",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <Icon size={20} className="text-primary" aria-hidden="true" />
                      <input
                        type="radio"
                        name="method"
                        value={value}
                        disabled={disabled}
                        checked={method === value}
                        onChange={() => setMethod(value)}
                        aria-describedby={`method-${value}`}
                        className="size-4 accent-primary"
                      />
                    </span>
                    <span className="font-display text-sm font-semibold">{label}</span>
                    <span id={`method-${value}`} className="text-xs text-ink-muted">
                      {disabled ? "Not available for this order" : hint}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          </section>

          {cart && cart.lines.length > 0 ? (
            <section aria-labelledby="items-heading" className={panel}>
              <div className="flex items-center justify-between gap-3">
                <h2 id="items-heading" className={panelTitle}>
                  {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
                </h2>
                <Link href="/cart" className="font-display text-sm font-semibold text-primary hover:underline">
                  Edit cart
                </Link>
              </div>
              <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                {cart.lines.map((line) => (
                  <li key={line.id} className="relative size-16 flex-none overflow-hidden rounded-control border border-line bg-surface-sunken" title={`${line.product.name}, ${line.variant.label}`}>
                    <Image src={line.product.image} alt={`${line.product.name}, ${line.variant.label}`} fill sizes="64px" className="object-contain p-1" />
                    {line.quantity > 1 ? (
                      <span className="absolute right-0.5 top-0.5 rounded-full bg-primary px-1.5 text-[10px] font-bold text-on-primary">×{line.quantity}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {shortNames.length > 0 ? (
            <div role="alert" className="grid gap-1 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
              <p className="font-semibold">Some items are no longer available in that quantity.</p>
              <ul className="list-disc pl-5">
                {shortNames.map((line) => (
                  <li key={line.variantId}>
                    {line.name}: {line.available === 0 ? "out of stock" : `only ${line.available} left`}
                  </li>
                ))}
              </ul>
              <Link href="/cart" className="font-semibold underline">
                Update your cart
              </Link>
            </div>
          ) : null}
          <div className="lg:hidden">{errorLine}</div>
        </div>

        <div className="grid gap-3 lg:sticky lg:top-24">
          <BillSummary cart={{ breakup: session.breakup, itemCount: cart?.itemCount ?? 0, coupon: cart?.coupon ?? null }} />
          <div className="hidden gap-2 lg:grid">
            {errorLine}
            <Button size="lg" block busy={busy} disabled={!canPlace} onClick={() => void place()}>
              {placeLabel}
            </Button>
            {!session.address ? <p className="text-center text-xs text-ink-muted">Choose an address to continue.</p> : null}
          </div>
        </div>
      </div>

      {/* Phones: the total and the one action that matters, always in reach. */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-xs text-ink-muted">{session.address ? "To pay" : "Choose an address"}</p>
          <p className="font-display text-lg font-bold tabular-nums">{formatINR(session.breakup.total)}</p>
        </div>
        <Button size="lg" busy={busy} disabled={!canPlace} onClick={() => void place()} className="flex-none">
          {method === "cod" ? "Place order" : "Pay now"}
        </Button>
      </div>
      <div aria-hidden="true" className="h-16 lg:hidden" />

      {payable ? (
        <PaymentSheet
          open
          orderId={payable.orderId}
          intent={payable.intent}
          amount={payable.amount}
          onPaid={() => router.push(`/orders/${payable.orderId}?placed=1`)}
          onClose={() => router.push(`/orders/${payable.orderId}`)}
        />
      ) : null}
    </>
  );
}

export function CheckoutPage(props: { checkoutApi?: CheckoutApi; addressApi?: AddressApi }) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6">
      <h1 className="mb-4 font-display text-2xl font-bold tracking-tight md:text-3xl">Checkout</h1>
      <RequireCustomer>
        <Checkout {...props} />
      </RequireCustomer>
    </section>
  );
}
