"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, ErrorState, LoadingSkeleton, PageHeader, StatusBadge, isStatusKey, useToast } from "@/components/admin-ui";
import { idempotencyKey } from "@/lib/api";
import { formatINR } from "@/features/admin/format";
import { deliveryApi, errorCode, errorMessage, istToday } from "./delivery.service";
import type { DeliveryRoute, DeliveryStop, Earnings, FailReason } from "./delivery.service";
import { useOfflineQueue } from "./offline-queue";
import type { QueueEntry } from "./offline-queue";
import s from "./delivery.module.css";

/* The Delivery Partner panel: today's routes and stops, OTP delivery, cash at the door, and the day's earnings. */

export type DeliveryScreen = "dashboard" | "delivery-earnings";

export function DeliveryPanel({ screen }: { screen: DeliveryScreen }) {
  return screen === "delivery-earnings" ? <MyEarnings /> : <MyRoutes />;
}

export function Status({ value }: { value: string }) {
  return isStatusKey(value) ? <StatusBadge status={value} /> : <Badge tone="neutral">{value}</Badge>;
}

const rupeesToPaise = (value: string) => Math.round(Number(value) * 100);
const validAmount = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0;

function OfflineBar({ queue }: { queue: ReturnType<typeof useOfflineQueue> }) {
  const waiting = queue.entries.filter((e) => !e.error);
  const failed = queue.entries.filter((e) => e.error);
  return (
    <>
      {!queue.online && (
        <div className={`${s.banner} ${s.warn}`} role="status">
          You are offline. Deliveries and payments are saved on this phone and sent when you are back online.
        </div>
      )}
      {waiting.length > 0 && (
        <div className={`${s.banner} ${s.info}`} role="status">
          <span>{waiting.length} action{waiting.length > 1 ? "s" : ""} waiting to send</span>
          <Button size="sm" variant="secondary" disabled={!queue.online || queue.flushing} onClick={() => void queue.flush()}>
            {queue.flushing ? "Sending…" : "Send now"}
          </Button>
        </div>
      )}
      {failed.map((entry: QueueEntry) => (
        <div key={entry.key} className={`${s.banner} ${s.bad}`} role="alert">
          <span>
            {entry.label}: {entry.error}
          </span>
          <span className={s.row}>
            <Button size="sm" variant="secondary" onClick={() => queue.retry(entry.key)}>
              Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={() => queue.discard(entry.key)}>
              Drop
            </Button>
          </span>
        </div>
      ))}
    </>
  );
}

function MyRoutes() {
  const [date, setDate] = useState(istToday);
  const [routes, setRoutes] = useState<DeliveryRoute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const items = await deliveryApi.myRoutes(date);
      setError(null);
      setRoutes(items);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [date]);

  const queue = useOfflineQueue(load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the state is set after the request answers
    void load();
  }, [load]);

  const open = routes?.find((r) => r.id === openId) ?? null;

  return (
    <div className={s.wrap}>
      <OfflineBar queue={queue} />
      {open ? (
        <RouteDetail route={open} queue={queue} onBack={() => setOpenId(null)} onChanged={load} />
      ) : (
        <>
          <PageHeader title="My routes" description="Your stops for the day, in order." />
          <input className={s.input} type="date" value={date} onChange={(e) => setDate(e.target.value || istToday())} aria-label="Day" />
          {error ? (
            <ErrorState title="Couldn't load your routes" message={error} action={<Button variant="secondary" onClick={() => void load()}>Try again</Button>} />
          ) : !routes ? (
            <LoadingSkeleton rows={3} />
          ) : routes.length === 0 ? (
            <div className={s.card}>
              <p className={s.title}>No routes for this day</p>
              <p className={s.muted}>Your dispatcher plans routes. Pull to refresh or check again later.</p>
              <Button variant="secondary" onClick={() => void load()}>
                Refresh
              </Button>
            </div>
          ) : (
            routes.map((route) => {
              const done = route.stops.filter((st) => st.status !== "pending").length;
              return (
                <button key={route.id} type="button" className={`${s.card} ${s.tap}`} onClick={() => setOpenId(route.id)}>
                  <span className={s.between}>
                    <span className={s.title}>{route.name}</span>
                    <Status value={route.status} />
                  </span>
                  <span className={s.muted}>
                    {done} of {route.stops.length} stops done
                  </span>
                </button>
              );
            })
          )}
        </>
      )}
    </div>
  );
}

function RouteDetail({ route, queue, onBack, onChanged }: { route: DeliveryRoute; queue: ReturnType<typeof useOfflineQueue>; onBack: () => void; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const queuedStops = new Set(queue.entries.flatMap((e) => (e.kind === "collect" ? [] : [e.stopId])));

  const act = async (what: "start" | "close") => {
    if (busy) return;
    if (what === "close" && !window.confirm("Close the route? Stops not attempted become failed.")) return;
    setBusy(true);
    try {
      await (what === "start" ? deliveryApi.startRoute(route.id) : deliveryApi.closeRoute(route.id));
      toast(what === "start" ? "Route started. OTPs sent to customers." : "Route closed");
      await onChanged();
    } catch (err) {
      toast(errorCode(err) === "DELIVERY_OTP_NOT_CONFIGURED" ? "Delivery OTP is not set up yet. Tell your dispatcher." : errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={s.between}>
        <Button variant="ghost" onClick={onBack}>
          ← All routes
        </Button>
        <Status value={route.status} />
      </div>
      <h1 className={s.big}>{route.name}</h1>
      <p className={s.muted}>{route.date}</p>
      {route.status === "planned" && (
        <Button size="lg" block disabled={busy || !queue.online} onClick={() => void act("start")}>
          {busy ? "Starting…" : "Start route"}
        </Button>
      )}
      {route.stops.map((stop) => (
        <StopCard key={stop.id} stop={stop} routeOut={route.status === "out"} queued={queuedStops.has(stop.id)} queue={queue} onChanged={onChanged} />
      ))}
      {route.status === "out" && (
        <Button size="lg" variant="secondary" block disabled={busy || !queue.online} onClick={() => void act("close")}>
          {busy ? "Closing…" : "Close route"}
        </Button>
      )}
    </>
  );
}

type Panel = null | "deliver" | "fail" | "collect";

function StopCard({ stop, routeOut, queued, queue, onChanged }: { stop: DeliveryStop; routeOut: boolean; queued: boolean; queue: ReturnType<typeof useOfflineQueue>; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  // One key per attempt: kept across network retries, renewed after the API refuses (e.g. a wrong OTP).
  const key = useRef(idempotencyKey());
  const [otp, setOtp] = useState("");
  const [cash, setCash] = useState("");
  const [cashRef, setCashRef] = useState("");
  const [reason, setReason] = useState<FailReason>("not_home");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<"cash" | "upi">("upi");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  const pending = stop.status === "pending" && !queued;

  const run = async (label: string, work: () => Promise<"done" | "queued">) => {
    if (busy) return;
    setBusy(true);
    try {
      const out = await work();
      toast(out === "queued" ? `${label}: saved offline, will send when online` : label);
      key.current = idempotencyKey();
      setPanel(null);
      if (out === "done") await onChanged();
    } catch (err) {
      key.current = idempotencyKey();
      const code = errorCode(err);
      const friendly: Record<string, string> = {
        OTP_INVALID: "Wrong OTP. Ask the customer to read it again.",
        OTP_EXPIRED: "The OTP expired. Send a new one.",
        OTP_LOCKED: "Too many wrong OTPs. Wait, then send a new one.",
        EXCEEDS_OUTSTANDING: "That is more than the order owes.",
        OTP_RESEND_TOO_SOON: "Wait a minute before sending another OTP.",
        OTP_SEND_LIMIT: "No more OTPs can be sent for this stop.",
      };
      toast(friendly[code] ?? errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const deliver = () =>
    run(`Stop ${stop.seq} delivered`, () =>
      queue.submit({
        kind: "deliver",
        key: key.current,
        stopId: stop.id,
        label: `Deliver stop ${stop.seq}`,
        body: { otp, ...(validAmount(cash) && cashRef.trim() ? { cash: { amountPaise: rupeesToPaise(cash), reference: cashRef.trim() } } : {}) },
      })
    );
  const fail = () => run(`Stop ${stop.seq} marked failed`, () => queue.submit({ kind: "fail", key: key.current, stopId: stop.id, label: `Fail stop ${stop.seq}`, body: { reason, note: note.trim() } }));
  const collect = () =>
    run("Payment recorded", async () => {
      // A photo needs the network; without one the collection can still be queued offline.
      const evidenceKey = photo ? await deliveryApi.uploadEvidence(stop.orderId, photo) : undefined;
      return queue.submit({
        kind: "collect",
        key: key.current,
        orderId: stop.orderId,
        label: `Payment for stop ${stop.seq}`,
        body: { amountPaise: rupeesToPaise(amount), method, reference: reference.trim(), ...(evidenceKey ? { evidenceKey } : {}) },
      });
    });
  const resend = () =>
    run("New OTP sent", async () => {
      await deliveryApi.resendOtp(stop.id);
      return "done";
    });

  return (
    <div className={s.card}>
      <div className={s.between}>
        <span className={s.row}>
          <span className={s.seq}>{stop.seq}</span>
          <span>
            <span className={s.title}>{stop.recipientName}</span>
            <br />
            <span className={s.muted}>{stop.recipientPhone}</span>
          </span>
        </span>
        {queued ? <Badge tone="warning">Waiting to send</Badge> : <Status value={stop.status} />}
      </div>
      {stop.failedReason && <p className={s.muted}>Reason: {stop.failedReason}</p>}
      {stop.cashPaise > 0 && <p className={s.muted}>Cash taken: {formatINR(stop.cashPaise)}</p>}

      {pending && routeOut && panel === null && (
        <div className={s.actions}>
          <Button size="lg" className={s.full} onClick={() => setPanel("deliver")}>
            Deliver with OTP
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setPanel("collect")}>
            Collect payment
          </Button>
          <Button size="lg" variant="secondary" disabled={busy || !queue.online} onClick={() => void resend()}>
            Resend OTP
          </Button>
          <Button size="lg" variant="danger" className={s.full} onClick={() => setPanel("fail")}>
            Can&apos;t deliver
          </Button>
        </div>
      )}
      {pending && !routeOut && <p className={s.muted}>Start the route to work this stop.</p>}

      {panel === "deliver" && (
        <form
          className={s.stack}
          onSubmit={(e) => {
            e.preventDefault();
            void deliver();
          }}
        >
          <label className={s.muted} htmlFor={`otp-${stop.id}`}>
            Customer&apos;s OTP {stop.otpSent ? "" : "(not sent yet: tap Resend OTP)"}
          </label>
          <input id={`otp-${stop.id}`} className={`${s.input} ${s.otp}`} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4,8}" maxLength={8} required value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
          <span className={s.muted}>Cash taken at the door (optional)</span>
          <input className={s.input} inputMode="decimal" placeholder="Amount in ₹" value={cash} onChange={(e) => setCash(e.target.value)} />
          {cash !== "" && <input className={s.input} placeholder="Receipt / reference" required value={cashRef} onChange={(e) => setCashRef(e.target.value)} />}
          <div className={s.actions}>
            <Button type="button" size="lg" variant="ghost" onClick={() => setPanel(null)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={busy || otp.length < 4 || (cash !== "" && !validAmount(cash))}>
              {busy ? "Sending…" : "Confirm"}
            </Button>
          </div>
        </form>
      )}

      {panel === "fail" && (
        <form
          className={s.stack}
          onSubmit={(e) => {
            e.preventDefault();
            void fail();
          }}
        >
          <select className={s.input} value={reason} onChange={(e) => setReason(e.target.value as FailReason)} aria-label="Reason">
            <option value="not_home">Customer not home</option>
            <option value="refused">Customer refused</option>
            <option value="address_wrong">Wrong address</option>
            <option value="other">Other</option>
          </select>
          <textarea className={s.input} required maxLength={300} placeholder="What happened?" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className={s.actions}>
            <Button type="button" size="lg" variant="ghost" onClick={() => setPanel(null)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" variant="danger" disabled={busy || !note.trim()}>
              {busy ? "Saving…" : "Mark failed"}
            </Button>
          </div>
        </form>
      )}

      {panel === "collect" && (
        <form
          className={s.stack}
          onSubmit={(e) => {
            e.preventDefault();
            void collect();
          }}
        >
          <div className={s.actions}>
            <Button type="button" size="lg" variant={method === "upi" ? "primary" : "secondary"} onClick={() => setMethod("upi")}>
              UPI
            </Button>
            <Button type="button" size="lg" variant={method === "cash" ? "primary" : "secondary"} onClick={() => setMethod("cash")}>
              Cash
            </Button>
          </div>
          <input className={s.input} inputMode="decimal" required placeholder="Amount in ₹" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className={s.input} required maxLength={100} placeholder={method === "upi" ? "UPI transaction ID" : "Receipt number"} value={reference} onChange={(e) => setReference(e.target.value)} />
          <label className={s.muted}>
            Photo of receipt (optional{queue.online ? "" : ", needs a connection"})
            <input className={s.input} type="file" accept="image/jpeg,image/png,application/pdf" capture="environment" disabled={!queue.online} onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
          <div className={s.actions}>
            <Button type="button" size="lg" variant="ghost" onClick={() => setPanel(null)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={busy || !validAmount(amount) || !reference.trim()}>
              {busy ? "Saving…" : "Record"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function EarningsCard({ earnings }: { earnings: Earnings }) {
  return (
    <div className={s.stats}>
      <div className={s.stat}>
        <div className={s.muted}>Delivered</div>
        <div className={s.big}>{earnings.deliveredStops}</div>
      </div>
      <div className={s.stat}>
        <div className={s.muted}>Failed</div>
        <div className={s.big}>{earnings.failedStops}</div>
      </div>
      <div className={s.stat}>
        <div className={s.muted}>Cash collected</div>
        <div className={s.big}>{formatINR(earnings.cashCollectedPaise)}</div>
      </div>
      <div className={s.stat}>
        <div className={s.muted}>Handed over</div>
        <div className={s.big}>{formatINR(earnings.cashHandedOverPaise)}</div>
      </div>
      <div className={`${s.stat} ${s.full}`}>
        <div className={s.muted}>Earnings</div>
        <div className={s.big}>{earnings.earningsPaise === null ? "—" : formatINR(earnings.earningsPaise)}</div>
        {earnings.reason === "FEE_NOT_CONFIGURED" && <div className={s.muted}>The per-stop fee is not set up yet.</div>}
        <div className={s.muted}>Cash still with you: {formatINR(earnings.cashCollectedPaise - earnings.cashHandedOverPaise)}</div>
      </div>
    </div>
  );
}

function MyEarnings() {
  const [date, setDate] = useState(istToday);
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const out = await deliveryApi.myEarnings(date);
      setError(null);
      setData(out);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [date]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the state is set after the request answers
    void load();
  }, [load]);
  return (
    <div className={s.wrap}>
      <PageHeader title="My earnings" description="Stops, cash and earnings for one day." />
      <input className={s.input} type="date" value={date} onChange={(e) => setDate(e.target.value || istToday())} aria-label="Day" />
      {error ? <ErrorState title="Couldn't load earnings" message={error} action={<Button variant="secondary" onClick={() => void load()}>Try again</Button>} /> : data ? <EarningsCard earnings={data} /> : <LoadingSkeleton rows={2} />}
    </div>
  );
}
