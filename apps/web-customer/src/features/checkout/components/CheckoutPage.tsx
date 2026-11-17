"use client";

import { Banknote, Check, CreditCard, MapPin, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatINR, packArtUrl } from "@femxo/shared";
import { isApiError, userMessage } from "@femxo/shared/api";
import type { AddressApi, OrdersApi } from "@femxo/shared/api";
import type { Address, AddressInput, PaymentMethod, PaymentOrder } from "@femxo/shared/contracts";
import { Button, buttonClasses, cn, EmptyState, ErrorState, Skeleton } from "@femxo/ui";
import { AddressLines } from "@/features/account/components/AddressBookPage";
import { AddressForm } from "@/features/addresses/components/AddressForm";
import { RequireCustomer } from "@/features/auth/components/Guards";
import { BillSummary } from "@/features/cart/components/BillSummary";
import { useCart } from "@/features/cart/components/CartProvider";
import { PaymentProgress } from "@/features/payments/components/PaymentProgress";
import { outcomeMessage } from "@/features/payments/outcome-copy";
import { useOrderPayment } from "@/features/payments/useOrderPayment";
import type { OrderPayResult } from "@/features/payments/useOrderPayment";
import { getAddressApi, getOrdersApi } from "@/lib/api";
import { createAttemptKeys } from "../attempt";

const panel = "grid gap-3 rounded-card border border-line bg-surface p-4 md:p-5";
const panelTitle = "flex items-center gap-2 font-display text-base font-semibold";

/** Errors that mean "the cart is not what you reviewed": go and look at it again. */
const CART_ERRORS = ["CART_CHANGED", "PRICE_CHANGED", "INSUFFICIENT_STOCK", "VARIANT_UNAVAILABLE", "VARIANT_NOT_FOUND", "CART_EMPTY", "PRICE_NOT_SET_FOR_TIER"];

interface Placed {
  orderId: string;
  orderNumber: string;
  amountPaise: number;
  payment: PaymentOrder | null;
}

/**
 * One-page checkout: where it goes, how you pay, and what is in it, with "Place order" beside the bill (pinned to the bottom on
 * phones). The server prices the cart again and compares with the total shown here (`expectedTotalPaise`); one Idempotency-Key per
 * attempt means a double tap or a retry after a bad connection can never place two orders. An online order is paid with Razorpay
 * Checkout straight after, and is only called paid once our server says so.
 */
function Checkout({ ordersApi, addressApi }: { ordersApi?: OrdersApi; addressApi?: AddressApi }) {
  const router = useRouter();
  const { cart, status, refresh } = useCart();
  const ordersRef = useRef(ordersApi);
  const addressRef = useRef(addressApi);
  const orders = useCallback(() => (ordersRef.current ??= getOrdersApi()), []);
  const addresses = useCallback(() => (addressRef.current ??= getAddressApi()), []);
  const attempts = useRef(createAttemptKeys());
  const { phase, payOrder } = useOrderPayment();

  const [book, setBook] = useState<Address[] | null>(null);
  const [bookFailed, setBookFailed] = useState(false);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("online");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; cart: boolean } | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [payResult, setPayResult] = useState<OrderPayResult | null>(null);

  const loadBook = useCallback(async () => {
    setBookFailed(false);
    try {
      const list = await addresses().list();
      setBook(list.items);
      setAddressId((current) => (current && list.items.some((a) => a.id === current) ? current : (list.items.find((a) => a.isDefault) ?? list.items[0])?.id ?? null));
    } catch {
      setBookFailed(true);
    }
  }, [addresses]);

  useEffect(() => {
    // loadBook() only sets state once the request has answered.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBook();
  }, [loadBook]);

  const goToOrder = (orderId: string, extra = "") => router.replace(`/orders/${orderId}?placed=1${extra}`);

  /** Pays the order we just placed (or, on retry, asks the server for its payment again). */
  async function pay(order: Placed, known: PaymentOrder | null) {
    setBusy(true);
    setPayResult(null);
    const result = await payOrder(order.orderId, order.orderNumber, known);
    setBusy(false);
    if (result.kind === "paid") return goToOrder(order.orderId);
    if (result.kind === "unconfirmed") return goToOrder(order.orderId, "&confirming=1");
    setPayResult(result);
  }

  async function placeOrder() {
    if (!cart || !addressId || busy) return;
    setBusy(true);
    setError(null);
    const input = { addressId, paymentMethod: method, cartRev: cart.rev, expectedTotalPaise: cart.total };
    try {
      const result = await orders().checkout(input, attempts.current.keyFor(input));
      attempts.current.reset();
      // The server has spent the cart (or will give it back if the payment fails): read it again.
      void refresh();
      const order: Placed = { orderId: result.order.id, orderNumber: result.order.orderNumber, amountPaise: result.order.totalPaise, payment: result.payment };
      if (result.order.paymentMethod === "cod" || method === "cod") return goToOrder(order.orderId);
      setPlaced(order);
      await pay(order, result.payment);
    } catch (e) {
      setBusy(false);
      const definitive = isApiError(e) && e.status >= 400 && e.status < 500 && e.status !== 429 && e.code !== "CHECKOUT_IN_PROGRESS";
      if (definitive) attempts.current.reset();
      if (isApiError(e, "COD_NOT_AVAILABLE") || isApiError(e, "COD_NOT_ELIGIBLE")) setMethod("online");
      const cartProblem = isApiError(e) && CART_ERRORS.includes(e.code);
      if (cartProblem) void refresh();
      setError({ message: userMessage(e), cart: cartProblem });
    }
  }

  async function saveAddress(input: AddressInput, key: string) {
    const created = await addresses().create(input, key);
    await loadBook();
    setAddressId(created.id);
    setAdding(false);
  }

  if (status === "loading" || (status === "ready" && !cart)) return <CheckoutSkeleton />;
  if (status === "error" || status === "signed-out") return <ErrorState title="We couldn't load your cart" message="Check your connection and try again." onRetry={() => void refresh()} />;

  // An online order is placed and waiting for its payment: the page is now about paying it.
  if (placed) {
    return (
      <div className="mx-auto grid max-w-xl gap-4">
        <section className={panel} aria-labelledby="pay-heading">
          <h2 id="pay-heading" className={panelTitle}>
            <CreditCard size={18} aria-hidden="true" />
            Pay for order {placed.orderNumber}
          </h2>
          <p className="text-sm">
            Amount to pay: <strong className="tabular-nums">{formatINR(placed.amountPaise)}</strong>. Your order is held for a short while until it is paid.
          </p>
          <PaymentProgress phase={phase} />
          <div role="alert" data-testid="pay-outcome">
            {payResult ? <p className={cn("rounded-control px-3 py-2.5 text-sm", payResult.kind === "dismissed" ? "bg-warning-soft text-ink" : "bg-danger-soft text-danger")}>{outcomeMessage(payResult)}</p> : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" busy={busy} onClick={() => void pay(placed, payResult === null ? placed.payment : null)}>
              {payResult ? "Try payment again" : "Pay now"}
            </Button>
            <Link href={`/orders/${placed.orderId}`} className={buttonClasses({ variant: "secondary", size: "lg" })}>
              View order
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (!cart || cart.lines.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        message="Add something to your cart, then come back to check out."
        action={
          <Link href="/" className={buttonClasses()}>
            Start shopping
          </Link>
        }
      />
    );
  }

  const blocked = !cart.canCheckout;
  const selected = book?.find((a) => a.id === addressId) ?? null;
  const ready = !blocked && selected !== null && !busy;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_24rem]">
      <div className="grid gap-4">
        {blocked ? (
          <div role="alert" className="rounded-card border border-warning bg-warning-soft px-4 py-3 text-sm">
            <p className="font-semibold">Your cart needs a look before you can order.</p>
            <p>
              A price changed or something is short on stock.{" "}
              <Link href="/cart" className="font-semibold text-primary underline">
                Review your cart
              </Link>
            </p>
          </div>
        ) : null}

        <section aria-labelledby="address-heading" className={panel}>
          <h2 id="address-heading" className={panelTitle}>
            <MapPin size={18} aria-hidden="true" />
            Delivery address
          </h2>
          {bookFailed ? (
            <ErrorState title="We couldn't load your addresses" onRetry={() => void loadBook()} />
          ) : !book ? (
            <div role="status">
              <span className="sr-only">Loading your addresses…</span>
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              {book.length === 0 && !adding ? <p className="text-sm text-ink-muted">Add an address to deliver to.</p> : null}
              <ul role="radiogroup" aria-labelledby="address-heading" className="grid gap-2">
                {book.map((entry) => (
                  <li key={entry.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-control border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                        addressId === entry.id ? "border-primary bg-primary-soft" : "border-line-input bg-surface"
                      )}
                    >
                      <input type="radio" name="address" className="mt-1 size-4 accent-primary" checked={addressId === entry.id} onChange={() => setAddressId(entry.id)} />
                      <AddressLines address={entry} />
                    </label>
                  </li>
                ))}
              </ul>
              {adding ? (
                <div className="rounded-control border border-primary p-3">
                  <AddressForm onSave={saveAddress} onCancel={() => setAdding(false)} submitLabel="Save and deliver here" offerDefault={book.length > 0} />
                </div>
              ) : (
                <Button variant="secondary" className="w-max" onClick={() => setAdding(true)}>
                  <Plus size={16} aria-hidden="true" />
                  Add a new address
                </Button>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="pay-method-heading" className={panel}>
          <h2 id="pay-method-heading" className={panelTitle}>
            <CreditCard size={18} aria-hidden="true" />
            How would you like to pay?
          </h2>
          <div role="radiogroup" aria-labelledby="pay-method-heading" className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { value: "online", label: "Pay online", hint: "UPI, cards, net banking, wallets", icon: CreditCard },
                { value: "cod", label: "Cash on delivery", hint: "Pay when it arrives (limits apply)", icon: Banknote },
              ] as const
            ).map(({ value, label, hint, icon: Icon }) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-control border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                  method === value ? "border-primary bg-primary-soft" : "border-line-input bg-surface"
                )}
              >
                <input type="radio" name="method" value={value} className="mt-1 size-4 accent-primary" checked={method === value} onChange={() => setMethod(value)} />
                <span className="grid text-sm">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Icon size={16} aria-hidden="true" />
                    {label}
                    {method === value ? <Check size={14} className="text-primary" aria-hidden="true" /> : null}
                  </span>
                  <span className="text-xs text-ink-muted">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section aria-labelledby="items-heading" className={panel}>
          <h2 id="items-heading" className={panelTitle}>
            Items ({cart.itemCount})
          </h2>
          <ul className="grid gap-3">
            {cart.lines.map((line) => (
              <li key={line.id} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 text-sm">
                <span className="relative block aspect-square overflow-hidden rounded-control bg-surface-sunken">
                  <Image src={line.product?.image ?? packArtUrl({ name: "Item", brand: "Femxo", toneKey: line.variantId })} alt="" fill sizes="56px" className="object-contain p-1" />
                </span>
                <span className="grid">
                  <span className="font-medium">{line.product?.name ?? "Item"}</span>
                  <span className="text-xs text-ink-muted">
                    {line.variant?.label ? `${line.variant.label} · ` : ""}Qty {line.quantity}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{line.lineTotal === null ? "—" : formatINR(line.lineTotal)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:sticky lg:top-24">
        <BillSummary cart={cart} />
        <PaymentProgress phase={phase} />
        <div role="alert" data-testid="checkout-error">
          {error ? (
            <p className="rounded-control bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
              {error.message}{" "}
              {error.cart ? (
                <Link href="/cart" className="font-semibold underline">
                  Review your cart
                </Link>
              ) : null}
            </p>
          ) : null}
        </div>
        <Button size="lg" block busy={busy} disabled={!ready && !busy} onClick={() => void placeOrder()} className="hidden md:inline-flex">
          {method === "online" ? `Pay ${formatINR(cart.total)}` : "Place order"}
        </Button>
        {!selected && book ? <p className="text-center text-sm text-ink-muted">Choose or add a delivery address to continue.</p> : null}
        <p className="text-center text-xs text-ink-muted">By placing your order you agree to our terms. Prices include GST.</p>
        {/* Phones: the total and the button, pinned above the bottom bar. */}
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur md:hidden">
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-xs text-ink-muted">To pay</p>
            <p className="text-lg font-bold tabular-nums">{formatINR(cart.total)}</p>
          </div>
          <Button size="lg" busy={busy} disabled={!ready && !busy} onClick={() => void placeOrder()}>
            {method === "online" ? "Pay now" : "Place order"}
          </Button>
        </div>
        <div aria-hidden="true" className="h-16 md:hidden" />
      </div>
    </div>
  );
}

function CheckoutSkeleton() {
  return (
    <div role="status" className="grid gap-4 lg:grid-cols-[1fr_24rem]">
      <span className="sr-only">Loading checkout…</span>
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

/** Checkout needs a signed-in customer: a guest is sent to sign in and comes back here. */
export function CheckoutPage({ ordersApi, addressApi }: { ordersApi?: OrdersApi; addressApi?: AddressApi }) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6">
      <h1 className="mb-4 font-display text-2xl font-bold md:text-3xl">Checkout</h1>
      <RequireCustomer>
        <Checkout ordersApi={ordersApi} addressApi={addressApi} />
      </RequireCustomer>
    </section>
  );
}
