"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { isApiError } from "@femxo/shared/api";
import type { OrdersApi, SupportApi } from "@femxo/shared/api";
import { TicketInput } from "@femxo/shared/contracts";
import type { OrderSummary, Ticket } from "@femxo/shared/contracts";
import { Badge, Button, EmptyState, ErrorState, Skeleton, TextField, useToast } from "@femxo/ui";
import type { BadgeTone } from "@femxo/ui";
import { RequireCustomer } from "@/features/auth/components/Guards";
import { getOrdersApi, getSupportApi } from "@/lib/api";
import { Select, TextArea } from "./Fields";

export const TICKET_STATUS: Record<Ticket["status"], { label: string; tone: BadgeTone }> = {
  open: { label: "Open", tone: "info" },
  awaiting_customer: { label: "Waiting for you", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
};

const TOPICS: { value: Ticket["category"]; label: string }[] = [
  { value: "order", label: "Order" },
  { value: "payment", label: "Payment" },
  { value: "return", label: "Return or refund" },
  { value: "account", label: "Account" },
  { value: "other", label: "Something else" },
];

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

type Errors = Partial<Record<"subject" | "category" | "orderId" | "message" | "form", string>>;

function NewRequest({ support, orders, onSent, onCancel }: { support: () => SupportApi; orders: () => OrdersApi; onSent: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [values, setValues] = useState({ subject: "", category: "order" as Ticket["category"], orderId: "", message: "" });
  const [recent, setRecent] = useState<OrderSummary[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    orders()
      .list({ limit: 20 })
      .then((page) => !cancelled && setRecent(page.items))
      .catch(() => undefined); // the order picker is optional
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = TicketInput.safeParse({ ...values, orderId: values.orderId || null });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof Errors;
        next[field] ??= field === "subject" ? "Give your request a short subject (at least 4 letters)" : field === "message" ? "Tell us a little more (at least 10 letters)" : issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await support().create(parsed.data);
      toast("Request sent");
      onSent();
    } catch (error) {
      if (isApiError(error, "VALIDATION_FAILED") && error.details?.fields) setErrors(error.details.fields as Errors);
      else setErrors({ form: isApiError(error) ? error.message : "We couldn't send that. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label="New request" className="grid gap-4 rounded-card border border-primary bg-surface p-4 shadow-card">
      <TextField label="Subject" value={values.subject} error={errors.subject} maxLength={120} onChange={(e) => setValues({ ...values, subject: e.target.value })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Topic" value={values.category} onChange={(e) => setValues({ ...values, category: e.target.value as Ticket["category"] })}>
          {TOPICS.map((topic) => (
            <option key={topic.value} value={topic.value}>
              {topic.label}
            </option>
          ))}
        </Select>
        <Select label="Order (optional)" value={values.orderId} error={errors.orderId} onChange={(e) => setValues({ ...values, orderId: e.target.value })}>
          <option value="">Not about a particular order</option>
          {recent.map((order) => (
            <option key={order.id} value={order.id}>
              {order.number} · {DATE.format(new Date(order.placedAt))}
            </option>
          ))}
        </Select>
      </div>
      <TextArea label="Message" value={values.message} error={errors.message} maxLength={2000} onChange={(e) => setValues({ ...values, message: e.target.value })} />
      {errors.form ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {errors.form}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" busy={busy}>
          Send request
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Tickets({ support, orders }: { support?: SupportApi; orders?: OrdersApi }) {
  const supportRef = useRef(support);
  const ordersRef = useRef(orders);
  const supportApi = () => (supportRef.current ??= getSupportApi());
  const ordersApi = () => (ordersRef.current ??= getOrdersApi());
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [composing, setComposing] = useState(false);

  async function load() {
    setFailed(false);
    try {
      setTickets(await supportApi().list());
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    // load() only sets state once the request has answered.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) return <ErrorState title="We couldn't load your requests" message="Check your connection and try again." onRetry={() => void load()} />;
  if (!tickets) {
    return (
      <div role="status" className="grid gap-3">
        <span className="sr-only">Loading your requests…</span>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {composing ? (
        <NewRequest
          support={supportApi}
          orders={ordersApi}
          onCancel={() => setComposing(false)}
          onSent={() => {
            setComposing(false);
            void load();
          }}
        />
      ) : (
        <Button className="w-max" onClick={() => setComposing(true)}>
          <Plus size={16} aria-hidden="true" />
          New request
        </Button>
      )}

      {tickets.length === 0 ? (
        <EmptyState title="No requests yet" message="Ask us about an order, a payment or anything else. We reply right here." headingLevel={2} />
      ) : (
        <ul className="grid gap-3">
          {tickets.map((ticket) => {
            const status = TICKET_STATUS[ticket.status];
            return (
              <li key={ticket.id}>
                <Link href={`/account/support/${ticket.id}`} className="grid gap-1 rounded-card border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-raised focus-visible:outline-2 focus-visible:outline-focus">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{ticket.subject}</span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </span>
                  <span className="text-sm text-ink-muted">
                    Updated <time dateTime={ticket.updatedAt}>{DATE.format(new Date(ticket.updatedAt))}</time> · {ticket.messages.length} {ticket.messages.length === 1 ? "message" : "messages"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Help and support: the customer's requests, and a form to raise a new one. */
export function SupportPage({ support, orders }: { support?: SupportApi; orders?: OrdersApi }) {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6">
      <p className="mb-2 text-sm">
        <Link href="/account" className="font-semibold text-primary hover:underline">
          ← Account
        </Link>
      </p>
      <h1 className="mb-4 font-display text-2xl font-bold">Help &amp; support</h1>
      <RequireCustomer>
        <Tickets support={support} orders={orders} />
      </RequireCustomer>
    </section>
  );
}
