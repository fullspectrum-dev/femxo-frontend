"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { deliveryApi, errorMessage, isNetworkError } from "./delivery.service";
import type { FailReason } from "./delivery.service";

/*
 * Door-step actions survive a dropped connection. Each action gets its idempotency key once, is saved on the
 * phone before it is sent, and is replayed with the same key until the API answers, so a retry can never
 * deliver or collect twice:
 *  - deliver / fail: replayed to /delivery/stops/:id/... with the same Idempotency-Key (the backend says deliver is safe to replay offline);
 *  - collect: replayed through the backend's offline contract, POST /sync/actions type `cod.collect` (the sync key is the collectionKey).
 * An action the API refuses (wrong OTP, stop moved on) stays in the list with its error until the partner retries or drops it.
 */

export type QueuedAction =
  | { kind: "deliver"; key: string; stopId: string; label: string; body: { otp: string; cash?: { amountPaise: number; reference: string } } }
  | { kind: "fail"; key: string; stopId: string; label: string; body: { reason: FailReason; note: string } }
  | { kind: "collect"; key: string; orderId: string; label: string; body: { amountPaise: number; method: "cash" | "upi"; reference: string; evidenceKey?: string } };

export type QueueEntry = QueuedAction & { queuedAt: string; error?: string };

const STORAGE = "fx-delivery-queue";

function read(): QueueEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as QueueEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: QueueEntry[]) {
  try {
    window.localStorage.setItem(STORAGE, JSON.stringify(entries));
  } catch {
    // Storage blocked: the action is still sent now, it just won't survive a reload.
  }
}

async function send(action: QueuedAction): Promise<void> {
  if (action.kind === "deliver") await deliveryApi.deliver(action.stopId, action.key, action.body);
  else if (action.kind === "fail") await deliveryApi.fail(action.stopId, action.key, action.body);
  else {
    const { results } = await deliveryApi.sync([{ key: action.key, type: "cod.collect", payload: { orderId: action.orderId, ...action.body } }]);
    const result = results[0];
    if (result && result.status !== "synced") throw new Error(result.message ?? result.code ?? "Not recorded");
  }
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

export function useOfflineQueue(onSynced?: () => void) {
  const [entries, setEntries] = useState<QueueEntry[]>(() => (typeof window === "undefined" ? [] : read()));
  const [flushing, setFlushing] = useState(false);
  const busy = useRef(false);
  const online = useOnline();

  const update = useCallback((next: QueueEntry[]) => {
    write(next);
    setEntries(next);
  }, []);

  const flush = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setFlushing(true);
    let list = read();
    let synced = false;
    try {
      for (const entry of list.filter((e) => !e.error)) {
        try {
          await send(entry);
          list = list.filter((e) => e.key !== entry.key);
          synced = true;
        } catch (error) {
          if (isNetworkError(error)) break;
          list = list.map((e) => (e.key === entry.key ? { ...e, error: errorMessage(error) } : e));
        }
        update(list);
      }
    } finally {
      busy.current = false;
      setFlushing(false);
      update(list);
      if (synced) onSynced?.();
    }
  }, [onSynced, update]);

  useEffect(() => {
    if (online && read().some((e) => !e.error)) void flush();
  }, [online, flush]);

  /**
   * Saves the action, then sends it. Resolves "done" when the API took it, "queued" when there was no
   * connection (it goes later on its own). A refusal is thrown and nothing stays queued.
   */
  const submit = useCallback(
    async (action: QueuedAction): Promise<"done" | "queued"> => {
      const entry: QueueEntry = { ...action, queuedAt: new Date().toISOString() };
      update([...read().filter((e) => e.key !== action.key), entry]);
      try {
        await send(action);
        update(read().filter((e) => e.key !== action.key));
        return "done";
      } catch (error) {
        if (isNetworkError(error)) return "queued";
        update(read().filter((e) => e.key !== action.key));
        throw error;
      }
    },
    [update]
  );

  const discard = useCallback((key: string) => update(read().filter((e) => e.key !== key)), [update]);
  const retry = useCallback(
    (key: string) => {
      update(read().map((e) => (e.key === key ? { ...e, error: undefined } : e)));
      void flush();
    },
    [flush, update]
  );

  return { entries, online, flushing, flush, submit, discard, retry };
}
