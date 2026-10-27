"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatINR } from "@femxo/shared";
import type { OrdersApi } from "@femxo/shared/api";
import type { OrderSummary } from "@femxo/shared/contracts";
import { Badge, Button, buttonClasses, EmptyState, ErrorState, Skeleton, Tabs } from "@femxo/ui";
import { RequireCustomer } from "@/features/auth/components/Guards";
import { getOrdersApi } from "@/lib/api";
import { ORDER_FILTERS, ORDER_STATUS, PAYMENT_STATUS } from "../status";
import type { OrderFilterKey } from "../status";

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function OrderRow({ order }: { order: OrderSummary }) {
  const status = ORDER_STATUS[order.status];
  return (
    <li>
      <Link href={`/orders/${order.id}`} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-card transition-shadow hover:shadow-raised focus-visible:outline-2 focus-visible:outline-focus">
        <span className="relative size-16 flex-none overflow-hidden rounded-control bg-surface-sunken">
          <Image src={order.thumbnail} alt="" fill sizes="64px" className="object-cover" />
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5 text-sm">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Order {order.number}</span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </span>
          <span className="text-ink-muted">
            Placed {DATE.format(new Date(order.placedAt))} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
          </span>
          <span className="text-ink-muted">{PAYMENT_STATUS[order.paymentStatus]}</span>
        </span>
        <span className="flex-none text-right font-bold">{formatINR(order.total)}</span>
      </Link>
    </li>
  );
}

function OrderList({ filter, api }: { filter: OrderFilterKey; api?: OrdersApi }) {
  const apiRef = useRef(api);
  const [items, setItems] = useState<OrderSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [more, setMore] = useState(false);

  const statuses = ORDER_FILTERS.find((entry) => entry.key === filter)?.statuses;

  const load = useCallback(
    async (after?: string) => {
      const client = (apiRef.current ??= getOrdersApi());
      try {
        const result = await client.list({ status: statuses, cursor: after });
        setItems((current) => (after ? [...current, ...result.items] : result.items));
        setCursor(result.nextCursor);
        setState("ready");
      } catch {
        setState("error");
      } finally {
        setMore(false);
      }
    },
    [statuses]
  );

  useEffect(() => {
    // load() only sets state once the request has answered.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (state === "error") return <ErrorState title="We couldn't load your orders" message="Check your connection and try again." onRetry={() => { setState("loading"); void load(); }} />;
  if (state === "loading") {
    return (
      <div role="status" className="grid gap-3">
        <span className="sr-only">Loading your orders…</span>
        {[0, 1, 2].map((n) => (
          <Skeleton key={n} className="h-24 w-full" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title={filter === "all" ? "No orders yet" : "No orders here"}
        message={filter === "all" ? "When you place an order, you can follow it here." : "Nothing matches this filter."}
        action={
          <Link href="/" className={buttonClasses()}>
            Start shopping
          </Link>
        }
      />
    );
  }
  return (
    <div className="grid gap-4">
      <ul className="grid gap-3">
        {items.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </ul>
      {cursor ? (
        <Button
          variant="secondary"
          busy={more}
          onClick={() => {
            setMore(true);
            void load(cursor);
          }}
          className="justify-self-center"
        >
          Show more orders
        </Button>
      ) : null}
    </div>
  );
}

/** Order history, filtered by tab. */
export function OrdersPage({ api }: { api?: OrdersApi }) {
  const [filter, setFilter] = useState<OrderFilterKey>("all");
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-4 font-display text-2xl font-bold md:text-3xl">Your orders</h1>
      <RequireCustomer>
        <Tabs
          label="Filter orders"
          value={filter}
          onChange={setFilter}
          items={ORDER_FILTERS.map((entry) => ({ key: entry.key, label: entry.label, content: <OrderList key={entry.key} filter={entry.key} api={api} /> }))}
        />
      </RequireCustomer>
    </section>
  );
}
