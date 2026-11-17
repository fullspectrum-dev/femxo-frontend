"use client";

import { CheckCircle2, Clock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatINR, idempotencyKey, packArtUrl } from "@femxo/shared";
import { isApiError, userMessage } from "@femxo/shared/api";
import type { OrdersApi } from "@femxo/shared/api";
import type { OrderDetail } from "@femxo/shared/contracts";
import { Badge, Button, buttonClasses, Dialog, EmptyState, ErrorState, Skeleton, useToast } from "@femxo/ui";
import { RequireCustomer } from "@/features/auth/components/Guards";
import { useCatalogLookup } from "@/features/catalog/useLookup";
import { PaymentProgress } from "@/features/payments/components/PaymentProgress";
import { outcomeMessage } from "@/features/payments/outcome-copy";
import { useOrderPayment } from "@/features/payments/useOrderPayment";
import type { OrderPayResult } from "@/features/payments/useOrderPayment";
import { getOrdersApi } from "@/lib/api";
import { canPay, describeOrder, paymentLine } from "../status";
import { OrderAgainButton } from "./OrderAgainButton";
import { OrderTimeline } from "./OrderTimeline";

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const POLL_MS = 3000;
const POLL_TRIES = 40;

type Load = { state: "loading" } | { state: "missing" } | { state: "failed" } | { state: "ready"; detail: OrderDetail };

function Order({ id, api }: { id: string; api?: OrdersApi }) {
  const apiRef = useRef(api);
  const client = useCallback(() => (apiRef.current ??= getOrdersApi()), []);
  const params = useSearchParams();
  const toast = useToast();
  const { phase, payOrder } = useOrderPayment();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  /** Waiting for the server to confirm a payment (we were sent here by a payment we could not confirm yet). */
  const [waiting, setWaiting] = useState(params.get("confirming") === "1");
  const [payResult, setPayResult] = useState<OrderPayResult | null>(null);
  const [paying, setPaying] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string>();
  const cancelKey = useRef<string | null>(null);
  const justPlaced = params.get("placed") === "1";

  const refresh = useCallback(async () => {
    try {
      setLoad({ state: "ready", detail: await client().get(id) });
    } catch (error) {
      setLoad((current) => (current.state === "ready" ? current : { state: isApiError(error, "ORDER_NOT_FOUND") || isApiError(error, "NOT_FOUND") ? "missing" : "failed" }));
    }
  }, [client, id]);

  useEffect(() => {
    // refresh() only sets state once the request has answered.
    void refresh();
  }, [refresh]);

  // The webhook is the source of truth: while a payment is unconfirmed, keep reading the order until it moves.
  const status = load.state === "ready" ? load.detail.order.status : null;
  useEffect(() => {
    if (!waiting) return;
    if (status && status !== "pending_payment") {
      setWaiting(false);
      return;
    }
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > POLL_TRIES) {
        clearInterval(timer);
        setWaiting(false);
      } else void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, status, refresh]);

  const lookup = useCatalogLookup({ variantIds: load.state === "ready" ? load.detail.items.map((i) => i.variantId) : [] });

  async function payNow() {
    if (load.state !== "ready") return;
    setPaying(true);
    setPayResult(null);
    const { order } = load.detail;
    const result = await payOrder(order.id, order.orderNumber, null);
    setPaying(false);
    if (result.kind === "unconfirmed") setWaiting(true);
    else if (result.kind !== "paid") setPayResult(result);
    await refresh();
  }

  async function cancel() {
    setCancelling(true);
    setCancelError(undefined);
    cancelKey.current ??= idempotencyKey();
    try {
      await client().cancel(id, cancelKey.current);
      cancelKey.current = null;
      setCancelOpen(false);
      toast("Order cancelled");
      await refresh();
    } catch (error) {
      // A definite answer ends this attempt; a dropped connection keeps the key, so trying again can't cancel twice.
      if (isApiError(error) && error.status >= 400 && error.status < 500) cancelKey.current = null;
      setCancelError(userMessage(error));
      if (isApiError(error, "ORDER_CHANGED") || isApiError(error, "ORDER_NOT_CANCELLABLE") || isApiError(error, "ORDER_DISPATCHED")) void refresh();
    } finally {
      setCancelling(false);
    }
  }

  if (load.state === "loading")
    return (
      <div role="status" className="grid gap-3">
        <span className="sr-only">Loading your order…</span>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (load.state === "missing")
    return (
      <EmptyState
        title="We couldn't find that order"
        message="It may belong to a different account."
        action={
          <Link href="/orders" className={buttonClasses()}>
            Your orders
          </Link>
        }
      />
    );
  if (load.state === "failed") return <ErrorState title="We couldn't load this order" message="Check your connection and try again." onRetry={() => void refresh()} />;

  const { order, items, cancellable, timeline } = load.detail;
  const display = describeOrder(order);
  const confirmed = order.status === "placed" || order.status === "completed";
  const mayPay = canPay(order);
  const expires = order.expiresAt ? DATE.format(new Date(order.expiresAt)) : null;

  return (
    <div className="grid gap-5">
      {justPlaced && confirmed ? (
        <div role="status" data-testid="order-confirmation" className="flex items-start gap-3 rounded-card border border-success bg-success-soft px-4 py-4">
          <CheckCircle2 size={24} className="mt-0.5 flex-none text-success" aria-hidden="true" />
          <div className="grid gap-1">
            <h2 className="font-display text-lg font-bold">Thank you, your order is placed!</h2>
            <p className="text-sm">
              Order <strong>{order.orderNumber}</strong> is confirmed.{" "}
              {order.paymentMethod === "cod" ? `Keep ${formatINR(order.totalPaise)} ready to pay when it arrives.` : "Your payment was received."}
            </p>
          </div>
        </div>
      ) : null}

      {waiting && status === "pending_payment" ? (
        <div role="status" data-testid="payment-confirming" className="flex items-start gap-3 rounded-card border border-info bg-info-soft px-4 py-3 text-sm">
          <Clock size={20} className="mt-0.5 flex-none text-info" aria-hidden="true" />
          <p>We&apos;re waiting for your bank to confirm the payment. This page updates by itself. You don&apos;t need to pay again.</p>
        </div>
      ) : null}

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-display text-2xl font-bold md:text-3xl">Order {order.orderNumber}</h1>
          <p className="text-sm text-ink-muted">Placed {DATE.format(new Date(order.placedAt))}</p>
        </div>
        <Badge tone={display.tone} className="text-sm">
          {display.label}
        </Badge>
        <span className="sr-only" data-testid="order-status">
          {display.label}
        </span>
      </header>
      {display.hint ? <p className="-mt-3 text-sm">{display.hint}</p> : null}
      {order.cancelReason && order.status === "cancelled" ? <p className="-mt-3 text-sm text-ink-muted">Reason: {order.cancelReason}</p> : null}

      {mayPay || payResult ? (
        <section className="grid gap-3 rounded-card border border-warning bg-warning-soft p-4" aria-labelledby="pay-heading">
          <h2 id="pay-heading" className="font-display text-base font-semibold">
            {mayPay ? `Pay ${formatINR(order.totalPaise)} to confirm` : "Payment"}
          </h2>
          {mayPay && expires ? <p className="text-sm">Your order is held until {expires}.</p> : null}
          <PaymentProgress phase={phase} />
          <div role="alert" data-testid="pay-outcome">
            {payResult ? <p className="text-sm font-medium">{outcomeMessage(payResult)}</p> : null}
          </div>
          {mayPay ? (
            <Button size="lg" busy={paying} onClick={() => void payNow()} className="w-max">
              {payResult ? "Try payment again" : "Pay now"}
            </Button>
          ) : null}
        </section>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="items-heading" className="rounded-card border border-line bg-surface px-4 shadow-card">
          <h2 id="items-heading" className="py-4 font-display text-base font-semibold">
            Items ({order.itemCount})
          </h2>
          <ul>
            {items.map((item) => {
              const product = lookup.productOfVariant(item.variantId);
              const variant = lookup.variant(item.variantId);
              const delivered = item.units?.delivered ?? 0;
              return (
                <li key={item.lineNo} data-testid="order-item" className="grid grid-cols-[4rem_1fr_auto] items-center gap-3 border-t border-line py-3 text-sm">
                  <span className="relative block aspect-square overflow-hidden rounded-control bg-surface-sunken">
                    <Image src={product?.image ?? packArtUrl({ name: "Item", brand: "Femxo", toneKey: item.variantId })} alt="" fill sizes="64px" className="object-contain p-1" />
                  </span>
                  <span className="grid gap-0.5">
                    {product ? (
                      <Link href={`/p/${product.slug}`} className="font-semibold hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus">
                        {product.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">Item</span>
                    )}
                    <span className="text-xs text-ink-muted">
                      {variant?.label ? `${variant.label} · ` : ""}
                      {item.quantity} × {formatINR(item.unitPricePaise)}
                    </span>
                    {item.units && item.units.delivered > 0 ? (
                      <span className="text-xs text-success">
                        {delivered} of {item.units.ordered} delivered
                      </span>
                    ) : null}
                    {order.status === "completed" && product ? (
                      <Link href={`/p/${product.slug}#reviews`} className="w-max text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus">
                        Review this product
                      </Link>
                    ) : null}
                  </span>
                  <span className="font-semibold tabular-nums">{formatINR(item.linePaise)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="grid gap-4">
          <section aria-labelledby="bill-heading" className="grid gap-2 rounded-card border border-line bg-surface p-4 text-sm shadow-card">
            <h2 id="bill-heading" className="text-base font-semibold">
              Bill
            </h2>
            <dl className="grid gap-2">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Items</dt>
                <dd>{formatINR(order.subtotalPaise)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Delivery</dt>
                <dd>{order.deliveryChargePaise === 0 ? "Free" : formatINR(order.deliveryChargePaise)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd data-testid="order-total">{formatINR(order.totalPaise)}</dd>
              </div>
            </dl>
            <p className="text-xs text-ink-muted">{paymentLine(order)}. Prices include GST.</p>
          </section>

          {order.shipping ? (
            <section aria-labelledby="ship-heading" className="grid gap-1 rounded-card border border-line bg-surface p-4 text-sm">
              <h2 id="ship-heading" className="text-base font-semibold">
                Delivering to
              </h2>
              <p className="font-semibold">{order.shipping.name}</p>
              <p>
                {order.shipping.line1}
                {order.shipping.line2 ? `, ${order.shipping.line2}` : ""}
              </p>
              {order.shipping.landmark ? <p className="text-ink-muted">Near {order.shipping.landmark}</p> : null}
              <p className="text-ink-muted">
                Pincode {order.shipping.pincode} · +91 {order.shipping.phone}
              </p>
            </section>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="timeline-heading" className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h2 id="timeline-heading" className="mb-3 font-display text-base font-semibold">
          Order progress
        </h2>
        <OrderTimeline entries={timeline} />
      </section>

      <div className="flex flex-wrap gap-3">
        {cancellable ? (
          <Button variant="secondary" onClick={() => setCancelOpen(true)}>
            Cancel order
          </Button>
        ) : null}
        <OrderAgainButton items={items} />
        <Link href="/orders" className={buttonClasses({ variant: "ghost" })}>
          All orders
        </Link>
      </div>

      <Dialog
        open={cancelOpen}
        onClose={() => !cancelling && setCancelOpen(false)}
        title="Cancel this order?"
        description={`Order ${order.orderNumber}`}
        footer={
          <>
            <Button variant="ghost" disabled={cancelling} onClick={() => setCancelOpen(false)}>
              Keep my order
            </Button>
            <Button variant="danger" busy={cancelling} onClick={() => void cancel()}>
              Yes, cancel it
            </Button>
          </>
        }
      >
        <p className="text-sm">
          {order.paymentMethod === "online" && order.paymentStatus === "captured"
            ? "Your items go back on the shelf and the money you paid is refunded."
            : "Your items go back on the shelf. You haven't paid anything, so there is nothing to refund."}
        </p>
        <div role="alert">{cancelError ? <p className="mt-2 text-sm font-medium text-danger">{cancelError}</p> : null}</div>
      </Dialog>
    </div>
  );
}

/** One order: confirmation (right after placing it), progress, items, bill, address, paying and cancelling. */
export function OrderDetailPage({ api }: { api?: OrdersApi }) {
  const { id } = useParams<{ id: string }>();
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-6">
      <p className="mb-3 text-sm">
        <Link href="/orders" className="font-semibold text-primary hover:underline">
          ← Your orders
        </Link>
      </p>
      <RequireCustomer>
        <Order id={id} api={api} />
      </RequireCustomer>
    </section>
  );
}
