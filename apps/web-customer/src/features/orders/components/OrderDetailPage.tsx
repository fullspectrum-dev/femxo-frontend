"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { formatINR } from "@femxo/shared";
import { isApiError } from "@femxo/shared/api";
import type { OrdersApi, PaymentApi } from "@femxo/shared/api";
import type { OrderDetail, PaymentIntent } from "@femxo/shared/contracts";
import { Badge, Button, Dialog, ErrorState, Skeleton, TextField, useToast } from "@femxo/ui";
import { RequireCustomer } from "@/features/auth/components/Guards";
import { BillSummary } from "@/features/cart/components/BillSummary";
import { PaymentSheet } from "@/features/payments/components/PaymentSheet";
import { getOrdersApi, getPaymentApi } from "@/lib/api";
import { ORDER_STATUS, PAYMENT_STATUS } from "../status";
import { OrderTimeline } from "./OrderTimeline";

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const METHOD: Record<OrderDetail["paymentMethod"], string> = { upi: "UPI", card: "Card", netbanking: "Net banking", cod: "Cash on delivery" };

function CancelDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cancel this order?"
      description="The items go back on the shelf. If you've already paid, your money is refunded."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep my order
          </Button>
          <Button
            variant="danger"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
          >
            Cancel order
          </Button>
        </>
      }
    >
      <p className="text-sm">You can&apos;t undo this.</p>
    </Dialog>
  );
}

function ReturnDialog({ order, open, onClose, onSubmit }: { order: OrderDetail; open: boolean; onClose: () => void; onSubmit: (lineIds: string[], reason: string) => Promise<string | null> }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (chosen.length === 0) return setError("Choose at least one item to return.");
    if (reason.trim().length < 3) return setError("Tell us why you're returning it.");
    setBusy(true);
    const failure = await onSubmit(chosen, reason.trim());
    setBusy(false);
    if (failure) setError(failure);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Return items" description={`You can return items until ${order.canReturnUntil ? DATE.format(new Date(order.canReturnUntil)) : "the window closes"}.`}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">Which items?</legend>
          {order.lines.map((line) => (
            <label key={line.id} className="flex items-start gap-3 rounded-control border border-line p-3 text-sm has-[:disabled]:opacity-60">
              <input
                type="checkbox"
                disabled={!line.returnable}
                checked={chosen.includes(line.id)}
                onChange={(event) => setChosen((current) => (event.target.checked ? [...current, line.id] : current.filter((id) => id !== line.id)))}
                className="mt-1 size-4 accent-primary"
              />
              <span>
                {line.product.name}, {line.variant.label} × {line.quantity}
                {!line.returnable ? <span className="block text-xs text-ink-muted">This item can&apos;t be returned.</span> : null}
              </span>
            </label>
          ))}
        </fieldset>
        <TextField label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Not now
          </Button>
          <Button type="submit" busy={busy}>
            Request return
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Detail({ id, orders, payments }: { id: string; orders?: OrdersApi; payments?: PaymentApi }) {
  const toast = useToast();
  const justPlaced = useSearchParams().get("placed") === "1";
  const ordersRef = useRef(orders);
  const paymentsRef = useRef(payments);
  const ordersApi = () => (ordersRef.current ??= getOrdersApi());
  const paymentsApi = () => (paymentsRef.current ??= getPaymentApi());

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [dialog, setDialog] = useState<"cancel" | "return" | null>(null);
  const [paying, setPaying] = useState<PaymentIntent | null>(null);
  const [payBusy, setPayBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrder(await (ordersRef.current ??= getOrdersApi()).get(id));
      setState("ready");
    } catch (error) {
      setState(isApiError(error, "NOT_FOUND") ? "missing" : "error");
    }
  }, [id]);

  useEffect(() => {
    // load() only sets state once the request has answered.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <div role="status" className="grid gap-4">
        <span className="sr-only">Loading your order…</span>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (state === "missing") return <ErrorState title="We couldn't find that order" message="It may belong to another account." />;
  if (state === "error" || !order) return <ErrorState title="We couldn't load this order" message="Check your connection and try again." onRetry={() => { setState("loading"); void load(); }} />;

  const status = ORDER_STATUS[order.status];

  async function cancel() {
    try {
      setOrder(await ordersApi().cancel(id));
      setDialog(null);
      toast("Order cancelled");
    } catch (error) {
      setDialog(null);
      toast(isApiError(error) ? error.message : "We couldn't cancel that. Please try again.", { tone: "error" });
      void load();
    }
  }

  async function requestReturn(lineIds: string[], reason: string) {
    try {
      setOrder(await ordersApi().requestReturn(id, { lineIds, reason }));
      setDialog(null);
      toast("Return requested");
      return null;
    } catch (error) {
      return isApiError(error) ? error.message : "We couldn't send that. Please try again.";
    }
  }

  async function payNow() {
    setPayBusy(true);
    try {
      setPaying(await paymentsApi().retry(id));
    } catch (error) {
      toast(isApiError(error) ? error.message : "We couldn't start the payment. Please try again.", { tone: "error" });
      void load();
    } finally {
      setPayBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      {justPlaced ? (
        <div role="status" className="rounded-card border border-success bg-success-soft px-4 py-3 text-sm font-medium text-success">
          Thank you! Your order {order.number} is placed. We&apos;ll keep you posted as it moves.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted">Placed {DATE.format(new Date(order.placedAt))}</p>
          <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
            Order {order.number}
            <Badge tone={status.tone}>{status.label}</Badge>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.paymentRetryable ? (
            <Button busy={payBusy} onClick={() => void payNow()}>
              {order.paymentStatus === "failed" ? "Retry payment" : "Pay now"}
            </Button>
          ) : null}
          {order.canCancel ? (
            <Button variant="secondary" onClick={() => setDialog("cancel")}>
              Cancel order
            </Button>
          ) : null}
          {order.canReturnUntil ? (
            <Button variant="secondary" onClick={() => setDialog("return")}>
              Return items
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-5">
          <section aria-labelledby="tracking-heading" className="rounded-card border border-line bg-surface p-4 shadow-card md:p-5">
            <h2 id="tracking-heading" className="mb-4 text-base font-semibold">
              Tracking
            </h2>
            <OrderTimeline timeline={order.timeline} status={order.status} />
          </section>

          <section aria-labelledby="items-heading" className="rounded-card border border-line bg-surface p-4 shadow-card md:p-5">
            <h2 id="items-heading" className="mb-3 text-base font-semibold">
              Items
            </h2>
            <ul className="grid gap-3">
              {order.lines.map((line) => (
                <li key={line.id} className="flex items-center gap-3">
                  <Link href={`/p/${line.product.slug}`} tabIndex={-1} aria-hidden="true" className="relative size-14 flex-none overflow-hidden rounded-control bg-surface-sunken">
                    <Image src={line.product.image} alt="" fill sizes="56px" className="object-cover" />
                  </Link>
                  <div className="min-w-0 flex-1 text-sm">
                    <Link href={`/p/${line.product.slug}`} className="font-semibold hover:text-primary hover:underline">
                      {line.product.name}
                    </Link>
                    <p className="text-ink-muted">
                      {line.variant.label} × {line.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-bold">{formatINR(line.lineTotal)}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="grid gap-4">
          <BillSummary cart={{ breakup: order.breakup, itemCount: order.itemCount, coupon: null }} />
          {order.kind === "prime" ? null : (
          <section aria-labelledby="delivery-heading" className="rounded-card border border-line bg-surface p-4 text-sm shadow-card">
            <h2 id="delivery-heading" className="mb-2 text-base font-semibold">
              Delivery address
            </h2>
            <p className="font-semibold">{order.address.name}</p>
            <p>
              {order.address.line1}
              {order.address.line2 ? `, ${order.address.line2}` : ""}
            </p>
            <p className="text-ink-muted">
              {order.address.city}, {order.address.district}, Bihar {order.address.pincode}
            </p>
            <p className="text-ink-muted">+91 {order.address.mobile}</p>
          </section>
          )}
          <section aria-labelledby="payment-heading" className="rounded-card border border-line bg-surface p-4 text-sm shadow-card">
            <h2 id="payment-heading" className="mb-2 text-base font-semibold">
              Payment
            </h2>
            <p>
              {METHOD[order.paymentMethod]} · {PAYMENT_STATUS[order.paymentStatus]}
            </p>
          </section>
        </div>
      </div>

      <CancelDialog open={dialog === "cancel"} onClose={() => setDialog(null)} onConfirm={cancel} />
      <ReturnDialog order={order} open={dialog === "return"} onClose={() => setDialog(null)} onSubmit={requestReturn} />
      {paying ? (
        <PaymentSheet
          open
          orderId={order.id}
          intent={paying}
          amount={order.total}
          payments={paymentsApi()}
          onPaid={() => {
            setPaying(null);
            toast("Payment received");
            void load();
          }}
          onClose={() => {
            setPaying(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

/** One order: where it is, what's in it, and what can still be done. */
export function OrderDetailPage(props: { orders?: OrdersApi; payments?: PaymentApi; orderId?: string }) {
  const params = useParams<{ id: string }>();
  const id = props.orderId ?? params.id;
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-6">
      <p className="mb-2 text-sm">
        <Link href="/orders" className="font-semibold text-primary hover:underline">
          ← All orders
        </Link>
      </p>
      <h1 className="sr-only">Order details</h1>
      <RequireCustomer>
        <Detail id={id} orders={props.orders} payments={props.payments} />
      </RequireCustomer>
    </section>
  );
}
