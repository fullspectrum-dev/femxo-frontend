"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatINR, idempotencyKey } from "@femxo/shared";
import { isApiError } from "@femxo/shared/api";
import type { AddressApi, CheckoutApi } from "@femxo/shared/api";
import type { Address, AddressInput, CheckoutSession, PaymentIntent, PaymentMethod } from "@femxo/shared/contracts";
import { Button, buttonClasses, EmptyState, ErrorState, Skeleton, Stepper } from "@femxo/ui";
import { AddressForm } from "@/features/addresses/components/AddressForm";
import { RequireCustomer } from "@/features/auth/components/Guards";
import { BillSummary } from "@/features/cart/components/BillSummary";
import { useCart } from "@/features/cart/components/CartProvider";
import { PaymentSheet } from "@/features/payments/components/PaymentSheet";
import { getAddressApi, getCheckoutApi } from "@/lib/api";

const STEPS = ["Address", "Delivery", "Payment"] as const;
type Step = 0 | 1 | 2;

const METHODS: { value: PaymentMethod; label: string; hint: string }[] = [
  { value: "upi", label: "UPI", hint: "Pay with any UPI app." },
  { value: "card", label: "Credit / debit card", hint: "Visa, Mastercard, RuPay." },
  { value: "netbanking", label: "Net banking", hint: "Pay from your bank account." },
  { value: "cod", label: "Cash on delivery", hint: "Pay when it arrives, for orders up to ₹2,000." },
];

const days = ({ min, max }: { min: number; max: number }) => (min === max ? `${min} day${min === 1 ? "" : "s"}` : `${min}–${max} days`);

interface Shortage {
  variantId: string;
  available: number;
}

/** Address, delivery, payment, in that order, with the bill beside it. */
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
  const [step, setStep] = useState<Step>(0);
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
  }

  async function toPayment() {
    if (await choose({ deliveryId: "standard" })) setStep(2);
  }

  /** One key for one attempt: a repeat of this same order gets the same answer, never a second order. */
  function keyFor(sessionId: string, chosen: PaymentMethod) {
    const id = `${sessionId}:${chosen}`;
    if (key.current.for !== id) key.current = { for: id, value: idempotencyKey() };
    return key.current.value;
  }

  async function place() {
    if (!session || placing.current || done.current) return;
    placing.current = true;
    setBusy(true);
    setError(undefined);
    setShortages([]);
    try {
      const result = await checkout().placeOrder(session.id, method, keyFor(session.id, method));
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

  return (
    <>
      <Stepper steps={STEPS} current={step} label="Checkout progress" className="mb-5" />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-4">
          {step === 0 ? (
            <section aria-labelledby="address-heading" className="grid gap-4 rounded-card border border-line bg-surface p-4 shadow-card md:p-5">
              <h2 id="address-heading" className="text-lg font-semibold">
                Where should we deliver?
              </h2>
              {book.length > 0 ? (
                <fieldset className="grid gap-2">
                  <legend className="sr-only">Delivery address</legend>
                  {book.map((entry) => (
                    <label key={entry.id} className="flex cursor-pointer items-start gap-3 rounded-control border border-line p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
                      <input type="radio" name="address" checked={session.address?.id === entry.id} onChange={() => void choose({ addressId: entry.id })} className="mt-1 accent-primary" />
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
              {error ? (
                <p role="alert" className="text-sm font-medium text-danger">
                  {error}
                </p>
              ) : null}
              <Button size="lg" disabled={!session.address || adding} onClick={() => setStep(1)} className="w-max">
                Deliver to this address
              </Button>
            </section>
          ) : null}

          {step === 1 ? (
            <section aria-labelledby="delivery-heading" className="grid gap-4 rounded-card border border-line bg-surface p-4 shadow-card md:p-5">
              <h2 id="delivery-heading" className="text-lg font-semibold">
                How would you like it delivered?
              </h2>
              {session.options.map((option) => (
                <div key={option.id} className="flex items-start justify-between gap-3 rounded-control border border-primary bg-primary-soft p-3 text-sm">
                  <div>
                    <p className="font-semibold">{option.label}</p>
                    <p className="text-ink-muted">Arrives in {days(option.etaDays)}.</p>
                  </div>
                  <p className="font-semibold">{option.fee === 0 ? "Free" : formatINR(option.fee)}</p>
                </div>
              ))}
              {error ? (
                <p role="alert" className="text-sm font-medium text-danger">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button size="lg" onClick={() => void toPayment()}>
                  Continue to payment
                </Button>
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section aria-labelledby="payment-heading" className="grid gap-4 rounded-card border border-line bg-surface p-4 shadow-card md:p-5">
              <h2 id="payment-heading" className="text-lg font-semibold">
                How would you like to pay?
              </h2>
              <fieldset className="grid gap-2">
                <legend className="sr-only">Payment method</legend>
                {METHODS.map((entry) => {
                  const disabled = entry.value === "cod" && !session.codAllowed;
                  return (
                    <div key={entry.value} className={disabled ? "rounded-control border border-line p-3 opacity-60" : "rounded-control border border-line p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"}>
                      <label className={disabled ? "flex items-center gap-3 text-sm font-semibold" : "flex cursor-pointer items-center gap-3 text-sm font-semibold"}>
                        <input type="radio" name="method" value={entry.value} disabled={disabled} checked={method === entry.value} onChange={() => setMethod(entry.value)} aria-describedby={`method-${entry.value}`} className="accent-primary" />
                        {entry.label}
                      </label>
                      <p id={`method-${entry.value}`} className="pl-7 text-xs text-ink-muted">
                        {disabled ? "Not available for this order." : entry.hint}
                      </p>
                    </div>
                  );
                })}
              </fieldset>
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
              {error ? (
                <p role="alert" className="text-sm font-medium text-danger">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button size="lg" busy={busy} onClick={() => void place()}>
                  {method === "cod" ? "Place order" : `Place order and pay ${formatINR(session.breakup.total)}`}
                </Button>
              </div>
            </section>
          ) : null}
        </div>

        <div className="grid gap-4 lg:sticky lg:top-24">
          <BillSummary cart={{ breakup: session.breakup, itemCount: cart?.itemCount ?? 0, coupon: cart?.coupon ?? null }} />
          {session.address && step > 0 ? (
            <p className="rounded-card border border-line bg-surface p-4 text-sm shadow-card">
              <span className="block font-semibold">Delivering to {session.address.name}</span>
              {session.address.line1}, {session.address.city} {session.address.pincode}
            </p>
          ) : null}
        </div>
      </div>

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
      <h1 className="mb-4 font-display text-2xl font-bold md:text-3xl">Checkout</h1>
      <RequireCustomer>
        <Checkout {...props} />
      </RequireCustomer>
    </section>
  );
}
