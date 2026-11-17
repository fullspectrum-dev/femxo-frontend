"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { errorText, isNetworkError } from "@/features/finance/kit";
import { fieldApi } from "./field.api";
import type { PlaceOrder } from "./field.api";

/*
 * Orders placed with no signal are kept on the phone and sent later through the backend's offline contract,
 * POST /sync/actions with type `order.place`. The sync key is the order's own idempotency key (the backend uses it
 * as such), so an order sent twice, online and then from the queue, is still placed once.
 * `failed` and `conflict` answers stay in the list with their message until the user drops them.
 */

export interface QueuedOrder {
  key: string;
  label: string;
  payload: PlaceOrder;
  queuedAt: string;
  error?: string;
}

const STORAGE = "fx-field-order-queue";
const listeners = new Set<() => void>();
let cache: QueuedOrder[] | null = null;

function read(): QueuedOrder[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE);
    cache = raw ? (JSON.parse(raw) as QueuedOrder[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}
function write(next: QueuedOrder[]) {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE, JSON.stringify(next));
  } catch {
    // Storage blocked: the queue lives until the tab closes.
  }
  listeners.forEach((l) => l());
}
const EMPTY: QueuedOrder[] = [];
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function queueOrder(entry: Omit<QueuedOrder, "queuedAt">) {
  write([...read().filter((q) => q.key !== entry.key), { ...entry, queuedAt: new Date().toISOString() }]);
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

export function useOrderQueue() {
  const entries = useSyncExternalStore(subscribe, read, () => EMPTY);
  const online = useOnline();
  const [flushing, setFlushing] = useState(false);

  const flush = useCallback(async () => {
    const pending = read().slice(0, 50); // The backend's batch limit; the rest go on the next flush.
    if (pending.length === 0) return;
    setFlushing(true);
    try {
      const results = await fieldApi.sync(pending.map((q) => ({ key: q.key, type: "order.place", payload: q.payload })));
      const byKey = new Map(results.map((r) => [r.key, r]));
      write(
        read()
          .map((q) => {
            const r = byKey.get(q.key);
            if (!r) return q;
            if (r.status === "synced") return null;
            return { ...q, error: `${r.status === "conflict" ? "Needs a look" : "Not placed"}: ${r.message ?? r.code ?? ""}` };
          })
          .filter((q): q is QueuedOrder => q !== null)
      );
    } catch (e) {
      if (!isNetworkError(e)) write(read().map((q) => ({ ...q, error: errorText(e) })));
    } finally {
      setFlushing(false);
    }
  }, []);

  useEffect(() => {
    if (online && read().some((q) => !q.error)) void flush();
  }, [online, flush]);

  const drop = useCallback((key: string) => write(read().filter((q) => q.key !== key)), []);
  return { entries, online, flushing, flush, drop };
}
