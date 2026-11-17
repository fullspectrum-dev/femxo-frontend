"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, ErrorState, LoadingSkeleton, PageHeader, useToast } from "@/components/admin-ui";
import { idempotencyKey } from "@/lib/api";
import { formatDateTime, formatINR } from "@/features/admin/format";
import { userNames } from "@/features/admin/services/lookups";
import { EarningsCard, Status } from "@/features/delivery/DeliveryPanel";
import { errorCode, errorMessage, istToday } from "@/features/delivery/delivery.service";
import type { DeliveryRoute, Earnings } from "@/features/delivery/delivery.service";
import s from "@/features/delivery/delivery.module.css";
import { dispatchApi } from "./dispatch.service";
import type { CodTask, NewStop, OpenOrder, ReconRun, ReturnRequest } from "./dispatch.service";

/* The Dispatch panel: plan and run the day's routes, partner earnings, cash hand-overs, reconciliation, COD tasks and returns. */

export type DispatchScreen = "dashboard" | "dispatch-earnings" | "cash-handovers" | "reconciliation" | "cod-tasks" | "delivery-returns";

export function DispatchPanel({ screen }: { screen: DispatchScreen }) {
  switch (screen) {
    case "dispatch-earnings":
      return <PartnerEarnings />;
    case "cash-handovers":
      return <CashHandovers />;
    case "reconciliation":
      return <Reconciliation />;
    case "cod-tasks":
      return <CodTasks />;
    case "delivery-returns":
      return <Returns />;
    default:
      return <Routes />;
  }
}

/** Loads whenever `load` changes; `reload` runs it again. */
function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const out = await load();
      setError(null);
      setData(out);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [load]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the state is set after the request answers
    void reload();
  }, [reload]);
  return { data, error, reload };
}

function Loaded<T>({ state, children }: { state: { data: T | null; error: string | null; reload: () => Promise<void> }; children: (data: T) => ReactNode }) {
  if (state.error)
    return (
      <ErrorState
        message={state.error}
        action={
          <Button variant="secondary" onClick={() => void state.reload()}>
            Try again
          </Button>
        }
      />
    );
  if (state.data === null) return <LoadingSkeleton rows={4} />;
  return <>{children(state.data)}</>;
}

function usePeople() {
  const [people, setPeople] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    userNames()
      .then(setPeople)
      .catch(() => undefined);
  }, []);
  return people;
}

const who = (people: Map<string, string>, id: string) => people.get(id) ?? `#${id.slice(-6)}`;

function PartnerSelect({ people, value, onChange }: { people: Map<string, string>; value: string; onChange: (id: string) => void }) {
  return (
    <select className={s.input} required value={value} onChange={(e) => onChange(e.target.value)} aria-label="Delivery Partner">
      <option value="">Choose a Delivery Partner…</option>
      {[...people].map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );
}

// ---------- Routes ----------

function Routes() {
  const toast = useToast();
  const people = usePeople();
  const [date, setDate] = useState(istToday);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => dispatchApi.routes(date), [date]);
  const state = useLoad(load);

  const act = async (route: DeliveryRoute, what: "optimize" | "start" | "close") => {
    if (busy) return;
    if (what === "close" && !window.confirm(`Close ${route.name}? Stops not attempted become failed.`)) return;
    setBusy(`${route.id}:${what}`);
    try {
      await (what === "optimize" ? dispatchApi.optimize(route.id) : what === "start" ? dispatchApi.start(route.id) : dispatchApi.close(route.id));
      toast(what === "optimize" ? "Stops re-ordered" : what === "start" ? "Route started" : "Route closed");
      await state.reload();
    } catch (err) {
      const code = errorCode(err);
      toast(code === "ADDRESSES_NOT_GEOCODED" ? "Optimising needs geocoded addresses, which orders don't have yet. Order stops by hand." : errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`${s.wrap} ${s.wide}`}>
      <PageHeader
        title="Delivery routes"
        description="Plan each Delivery Partner's day, then follow it."
        actions={!creating && <Button onClick={() => setCreating(true)}>New route</Button>}
      />
      <input className={s.input} type="date" value={date} onChange={(e) => setDate(e.target.value || istToday())} aria-label="Day" />
      {creating && (
        <CreateRoute
          date={date}
          people={people}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void state.reload();
          }}
        />
      )}
      <Loaded state={state}>
        {(routes) =>
          routes.length === 0 ? (
            <p className={s.muted}>No routes for {date}.</p>
          ) : (
            routes.map((route) => (
              <div key={route.id} className={s.card}>
                <div className={s.between}>
                  <span>
                    <span className={s.title}>{route.name}</span>
                    <br />
                    <span className={s.muted}>{who(people, route.agentUserId)}</span>
                  </span>
                  <Status value={route.status} />
                </div>
                <div className={s.scroll}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Recipient</th>
                        <th>Status</th>
                        <th>Cash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {route.stops.map((stop) => (
                        <tr key={stop.id}>
                          <td>{stop.seq}</td>
                          <td>
                            {stop.recipientName}
                            <div className={s.muted}>{stop.recipientPhone}</div>
                          </td>
                          <td>
                            <Status value={stop.status} />
                            {stop.failedReason && <div className={s.muted}>{stop.failedReason}</div>}
                          </td>
                          <td>{stop.cashPaise ? formatINR(stop.cashPaise) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={s.row}>
                  {route.status === "planned" && (
                    <>
                      <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void act(route, "optimize")}>
                        Optimise order
                      </Button>
                      <Button size="sm" disabled={busy !== null} onClick={() => void act(route, "start")}>
                        Start
                      </Button>
                    </>
                  )}
                  {route.status !== "closed" && (
                    <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void act(route, "close")}>
                      Close
                    </Button>
                  )}
                </div>
              </div>
            ))
          )
        }
      </Loaded>
    </div>
  );
}

function CreateRoute({ date, people, onCancel, onCreated }: { date: string; people: Map<string, string>; onCancel: () => void; onCreated: () => void }) {
  const toast = useToast();
  const orders = useLoad(dispatchApi.openOrders);
  const key = useRef(idempotencyKey());
  const [name, setName] = useState("");
  const [agent, setAgent] = useState("");
  const [stops, setStops] = useState<(NewStop & { orderNumber: string })[]>([]);
  const [busy, setBusy] = useState(false);

  const add = (order: OpenOrder) => setStops((list) => (list.some((x) => x.orderId === order.id) ? list : [...list, { orderId: order.id, orderNumber: order.orderNumber, recipientName: "", recipientPhone: "" }]));
  const patch = (i: number, change: Partial<NewStop>) => setStops((list) => list.map((x, j) => (j === i ? { ...x, ...change } : x)));
  const move = (i: number, by: number) =>
    setStops((list) => {
      const j = i + by;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const valid = name.trim() && agent && stops.length > 0 && stops.every((x) => x.recipientName.trim() && /^[6-9][0-9]{9}$/.test(x.recipientPhone));

  const submit = async () => {
    if (busy || !valid) return;
    setBusy(true);
    try {
      await dispatchApi.createRoute(key.current, { date, agentUserId: agent, name: name.trim(), stops: stops.map(({ orderId, recipientName, recipientPhone }) => ({ orderId, recipientName: recipientName.trim(), recipientPhone })) });
      toast("Route planned");
      onCreated();
    } catch (err) {
      const friendly: Record<string, string> = {
        NOT_A_DELIVERY_AGENT: "That user is not a Delivery Partner.",
        ORDER_ALREADY_ROUTED: "One of the orders is already on an open route.",
        NOTHING_TO_DELIVER: "One of the orders has nothing left to deliver.",
        ORDER_NOT_DELIVERABLE: "One of the orders can't be delivered.",
      };
      // A network failure keeps the key, so pressing again can't plan the route twice.
      if (errorCode(err) !== "NETWORK" && errorCode(err) !== "TIMEOUT") key.current = idempotencyKey();
      toast(friendly[errorCode(err)] ?? errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.card}>
      <p className={s.title}>New route for {date}</p>
      <input className={s.input} placeholder="Route name, e.g. Patna East AM" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      <PartnerSelect people={people} value={agent} onChange={setAgent} />
      <p className={s.muted}>Stops, in delivery order</p>
      {stops.map((stop, i) => (
        <div key={stop.orderId} className={s.stack} style={{ borderTop: "1px solid var(--fx-border, #e5e7eb)", paddingTop: 8 }}>
          <div className={s.between}>
            <strong>
              {i + 1}. {stop.orderNumber}
            </strong>
            <span className={s.row}>
              <Button size="sm" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)}>
                ↑
              </Button>
              <Button size="sm" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)}>
                ↓
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setStops((list) => list.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </span>
          </div>
          <input className={s.input} placeholder="Recipient name" value={stop.recipientName} onChange={(e) => patch(i, { recipientName: e.target.value })} />
          <input className={s.input} placeholder="Recipient mobile (10 digits)" inputMode="numeric" maxLength={10} value={stop.recipientPhone} onChange={(e) => patch(i, { recipientPhone: e.target.value.replace(/\D/g, "") })} />
        </div>
      ))}
      <Loaded state={orders}>
        {(list) => {
          const left = list.filter((o) => !stops.some((x) => x.orderId === o.id));
          return left.length === 0 ? (
            <p className={s.muted}>No more open orders.</p>
          ) : (
            <select className={s.input} value="" onChange={(e) => { const o = left.find((x) => x.id === e.target.value); if (o) add(o); }} aria-label="Add an undelivered order">
              <option value="">+ Add an undelivered order…</option>
              {left.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"} · {formatDateTime(o.placedAt)}
                </option>
              ))}
            </select>
          );
        }}
      </Loaded>
      <div className={s.row}>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={busy || !valid} onClick={() => void submit()}>
          {busy ? "Planning…" : "Plan route"}
        </Button>
      </div>
    </div>
  );
}

// ---------- Earnings ----------

function PartnerEarnings() {
  const people = usePeople();
  const [agent, setAgent] = useState("");
  const [from, setFrom] = useState(istToday);
  const [to, setTo] = useState(istToday);
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const look = async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await dispatchApi.earnings(agent, from, to));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={s.wrap}>
      <PageHeader title="Partner earnings" description="A Delivery Partner's stops, cash and earnings over up to 31 days." />
      <PartnerSelect people={people} value={agent} onChange={setAgent} />
      <div className={s.actions}>
        <input className={s.input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <input className={s.input} type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      </div>
      <Button disabled={!agent || busy || !from || !to} onClick={() => void look()}>
        {busy ? "Loading…" : "Show earnings"}
      </Button>
      {error && <ErrorState message={error} />}
      {data && <EarningsCard earnings={data} />}
    </div>
  );
}

// ---------- Cash hand-overs ----------

function CashHandovers() {
  const toast = useToast();
  const people = usePeople();
  const key = useRef(idempotencyKey());
  const [agent, setAgent] = useState("");
  const [date, setDate] = useState(istToday);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const paise = Math.round(Number(amount) * 100);
  const negative = paise < 0;
  const valid = agent && date && Number.isFinite(paise) && paise !== 0 && reference.trim() && (!negative || reason.trim());

  const submit = async () => {
    if (busy || !valid) return;
    setBusy(true);
    try {
      const out = await dispatchApi.handover(key.current, { agentUserId: agent, date, amountPaise: paise, reference: reference.trim(), ...(reason.trim() ? { reason: reason.trim() } : {}) });
      toast(out.replayed ? "Already recorded" : `${formatINR(paise)} received from ${who(people, agent)}`);
      key.current = idempotencyKey();
      setAmount("");
      setReference("");
      setReason("");
    } catch (err) {
      if (errorCode(err) !== "NETWORK" && errorCode(err) !== "TIMEOUT") key.current = idempotencyKey();
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.wrap}>
      <PageHeader title="Cash hand-overs" description="Record cash a Delivery Partner hands over. Entries can't be edited: correct with a negative amount and a reason." />
      <form
        className={s.card}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <PartnerSelect people={people} value={agent} onChange={setAgent} />
        <input className={s.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Day of the cash" />
        <input className={s.input} inputMode="decimal" placeholder="Amount in ₹ (negative to correct)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className={s.input} placeholder="Reference (receipt / slip no.)" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} />
        <input className={s.input} placeholder={negative ? "Reason for the correction (required)" : "Note (optional)"} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button type="submit" size="lg" disabled={busy || !valid}>
          {busy ? "Saving…" : "Record hand-over"}
        </Button>
      </form>
      <p className={s.muted}>See what each partner still holds under Reconciliation.</p>
    </div>
  );
}

// ---------- Reconciliation ----------

const FINDINGS: Record<string, string> = {
  delivered_without_otp: "Delivered without OTP",
  cash_not_on_stop: "Cash not matched to stops",
  unhanded_cash: "Cash not handed over",
};

function Reconciliation() {
  const toast = useToast();
  const people = usePeople();
  const [date, setDate] = useState(istToday);
  const [running, setRunning] = useState(false);
  const load = useCallback(() => dispatchApi.latestReconciliation(date).then((run) => ({ run })), [date]);
  const state = useLoad(load);

  const run = async () => {
    if (running) return;
    setRunning(true);
    try {
      const out = await dispatchApi.runReconciliation(date);
      toast(out.findingCount ? `${out.findingCount} finding(s) to look at` : "Everything matches");
      await state.reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={`${s.wrap} ${s.wide}`}>
      <PageHeader
        title="Daily reconciliation"
        description="OTPs and cash per Delivery Partner for one day. A report only: nothing is changed."
        actions={
          <Button disabled={running} onClick={() => void run()}>
            {running ? "Running…" : "Run now"}
          </Button>
        }
      />
      <input className={s.input} type="date" value={date} onChange={(e) => setDate(e.target.value || istToday())} aria-label="Day" />
      <Loaded state={state}>
        {({ run: latest }: { run: ReconRun | null }) =>
          !latest ? (
            <p className={s.muted}>No reconciliation for {date} yet. Run it now.</p>
          ) : (
            <div className={s.card}>
              <div className={s.between}>
                <span className={s.muted}>{latest.ranAt ? `Ran ${formatDateTime(latest.ranAt)}` : ""}</span>
                <span>
                  {latest.findingCount} finding(s) · variance {formatINR(latest.cashVariancePaise)}
                </span>
              </div>
              <div className={s.scroll}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Partner</th>
                      <th>Delivered</th>
                      <th>Collected</th>
                      <th>On stops</th>
                      <th>Handed over</th>
                      <th>Variance</th>
                      <th>Findings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latest.agents.map((row) => (
                      <tr key={row.agentUserId}>
                        <td>{who(people, row.agentUserId)}</td>
                        <td>{row.deliveredStops}</td>
                        <td>{formatINR(row.collectedCashPaise)}</td>
                        <td>{formatINR(row.stopCashPaise)}</td>
                        <td>{formatINR(row.handedOverPaise)}</td>
                        <td>{formatINR(row.cashVariancePaise)}</td>
                        <td>{row.findings.length ? row.findings.map((f) => FINDINGS[f] ?? f).join(", ") : "OK"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        }
      </Loaded>
    </div>
  );
}

// ---------- COD tasks and returns ----------

function usePaged<T>(fetchPage: (status?: string, cursor?: string) => Promise<{ items: T[]; nextCursor: string | null }>, status: string) {
  const [items, setItems] = useState<T[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    async (cursor?: string) => {
      try {
        const page = await fetchPage(status || undefined, cursor);
        setError(null);
        setItems((prev) => (cursor ? [...(prev ?? []), ...page.items] : page.items));
        setNext(page.nextCursor);
      } catch (err) {
        setError(errorMessage(err));
      }
    },
    [fetchPage, status]
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the state is set after the request answers
    void load();
  }, [load]);
  return { items, next, error, load };
}

function PagedList<T>({ title, description, statuses, fetchPage, row }: { title: string; description: string; statuses: readonly string[]; fetchPage: (status?: string, cursor?: string) => Promise<{ items: T[]; nextCursor: string | null }>; row: (item: T) => ReactNode }) {
  const [status, setStatus] = useState("");
  const list = usePaged(fetchPage, status);
  return (
    <div className={s.wrap}>
      <PageHeader title={title} description={description} />
      <select className={s.input} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
        <option value="">All statuses</option>
        {statuses.map((v) => (
          <option key={v} value={v}>
            {v.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      {list.error ? (
        <ErrorState
          message={list.error}
          action={
            <Button variant="secondary" onClick={() => void list.load()}>
              Try again
            </Button>
          }
        />
      ) : !list.items ? (
        <LoadingSkeleton rows={4} />
      ) : list.items.length === 0 ? (
        <p className={s.muted}>Nothing here.</p>
      ) : (
        <>
          {list.items.map(row)}
          {list.next && (
            <Button variant="secondary" onClick={() => void list.load(list.next ?? undefined)}>
              Load more
            </Button>
          )}
        </>
      )}
    </div>
  );
}

const TASK_STATUSES = ["open", "escalated", "investigation", "liability", "recovered", "written_off", "closed"] as const;
const RETURN_STATUSES = ["requested", "approved", "rejected"] as const;

function CodTasks() {
  return (
    <PagedList<CodTask>
      title="COD tasks"
      description="Cash-on-delivery orders still owed money. Recovery itself is worked by Finance."
      statuses={TASK_STATUSES}
      fetchPage={dispatchApi.codTasks}
      row={(task) => (
        <div key={task.id} className={s.card}>
          <div className={s.between}>
            <span className={s.title}>{task.orderNumber}</span>
            <Status value={task.status} />
          </div>
          <span className={s.muted}>
            Escalation {task.escalationLevel} · {task.attempts.length} attempt(s)
            {task.nextActionAt ? ` · next ${formatDateTime(task.nextActionAt)}` : ""}
          </span>
        </div>
      )}
    />
  );
}

function Returns() {
  return (
    <PagedList<ReturnRequest>
      title="Returns"
      description="Return requests in your territories."
      statuses={RETURN_STATUSES}
      fetchPage={dispatchApi.returns}
      row={(r) => (
        <div key={r.id} className={s.card}>
          <div className={s.between}>
            <span className={s.title}>
              {r.quantity} unit(s) · #{r.orderId.slice(-6).toUpperCase()}
            </span>
            <Status value={r.status} />
          </div>
          <span className={s.muted}>
            {r.reason} · {formatDateTime(r.requestedAt)}
          </span>
        </div>
      )}
    />
  );
}
