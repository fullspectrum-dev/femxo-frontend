"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatINR } from "@femxo/shared";
import type { OrdersApi } from "@femxo/shared/api";
import type { Order } from "@femxo/shared/contracts";
import { Badge, Button, buttonClasses, EmptyState, ErrorState, Skeleton, Tabs } from "@femxo/ui";
import { RequireCustomer } from "@/features/auth/components/Guards";
import { getOrdersApi } from "@/lib/api";
import { describeOrder, ORDER_FILTERS, paymentLine } from "../status";
import type { OrderFilterKey } from "../status";

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function OrderRow({ order }: { order: Order }) {
  const status = describeOrder(order);
  return (
    <li>
      <Link
        href={`/orders/${order.id}`}
        data-testid="order-row"
        className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 transition-colors duration-150 hover:border-primary focus-visible:outline-2 focus-visible:outline-focus"
      >
        <span className="grid min-w-0 flex-1 gap-1 text-sm">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Order {order.orderNumber}</span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </span>
          <span className="text-ink-muted">
            Placed {DATE.format(new Date(order.placedAt))} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
          </span>
          <span className="text-ink-muted">{paymentLine(order)}</span>
        </span>
        <span className="flex-none text-right font-bold tabular-nums">{formatINR(order.totalPaise)}</span>
        <ChevronRight size={18} className="flex-none text-ink-muted" aria-hidden="true" />
      </Link>
    </li>
  );
}

function OrderList({ filter, api }: { filter: OrderFilterKey; api?: OrdersApi }) {
  const apiRef = useRef(api);
  const [items, setItems] = useState<Order[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [more, setMore] = useState(false);

  const status = ORDER_FILTERS.find((entry) => entry.key === filter)?.status;

  const load = useCallback(
    async (after?: string) => {
      const client = (apiRef.current ??= getOrdersApi());
      try {
        const result = await client.list({ status, cursor: after });
        setItems((current) => (after ? [...current, ...result.items] : result.items));
        setCursor(result.nextCursor);
        setState("ready");
      } catch {
        setState("error");
      } finally {
        setMore(false);
      }
    },
    [status]
  );

  useEffect(() => {
    // load() only sets state once the request has answered.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (state === "error")
    return (
      <ErrorState
        title="We couldn't load your orders"
        message="Check your connection and try again."
        onRetry={() => {
          setState("loading");
          void load();
        }}
      />
    );
  if (state === "loading") {
    return (
      <div role="status" className="grid gap-3 pt-4">
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
    <div className="grid gap-4 pt-4">
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
