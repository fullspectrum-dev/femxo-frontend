"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AuthApiError } from "@/features/auth/services/auth-client";
import { usePanel } from "@/features/admin/shell/PanelContext";

/*
 * Small building blocks shared by the Finance and Field Staff screens: loading state, money in paise,
 * permission checks and a plain responsive table. Amounts are always integer paise, as the API wants.
 */

export const errorText = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong");
export const errorCodeOf = (error: unknown) => (error instanceof AuthApiError ? String(error.code) : "");
export const statusOf = (error: unknown) => (error instanceof AuthApiError ? error.status : undefined);
export const isNetworkError = (error: unknown) =>
  error instanceof AuthApiError ? error.code === "NETWORK" || error.code === "TIMEOUT" : error instanceof TypeError;

/** 123456 → "₹1,234.56" (exact, never rounded: finance figures must add up). */
export function money(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "—";
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100).toLocaleString("en-IN");
  return `${sign}₹${rupees}.${String(abs % 100).padStart(2, "0")}`;
}

/** "1,234.5" → 123450; null when it is not a positive amount with at most two decimals. */
export function toPaise(input: string): number | null {
  const clean = input.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
export const monthStart = () => `${today().slice(0, 8)}01`;
export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/** Whether the signed-in user holds any of these permissions (the Super Admin holds all). The API still decides. */
export function useCan() {
  const { access } = usePanel();
  return useCallback(
    (...names: string[]) => access?.isSuperAdmin === true || names.some((name) => access?.permissions.includes(name)),
    [access]
  );
}

/**
 * Runs `load` whenever `deps` change (compared by value) or `reload()` is called. Data from other deps is never
 * shown: while the new answer is on its way, `data` is null and `loading` true.
 */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const depsKey = JSON.stringify(deps);
  const [tick, setTick] = useState(0);
  const key = `${depsKey}#${tick}`;
  const [state, setState] = useState<{ key: string | null; depsKey: string | null; data: T | null; error: unknown }>({ key: null, depsKey: null, data: null, error: null });
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  useEffect(() => {
    let live = true;
    loader.current().then(
      (data) => live && setState({ key, depsKey, data, error: null }),
      (error: unknown) => live && setState({ key, depsKey, data: null, error })
    );
    return () => {
      live = false;
    };
  }, [key, depsKey]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const same = state.depsKey === depsKey;
  return { data: same ? state.data : null, error: state.key === key ? state.error : null, loading: state.key !== key, reload };
}

export interface Col<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "right";
  hideOnMobile?: boolean;
}

/** A plain table that scrolls sideways inside its card on a phone. */
export function SimpleTable<T>({ rows, cols, rowKey, onRow, empty = "Nothing here yet." }: { rows: readonly T[]; cols: readonly Col<T>[]; rowKey: (row: T) => string; onRow?: (row: T) => void; empty?: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-[14px] fx-muted">{empty}</p>;
  return (
    <div className="fx-table-wrap overflow-x-auto">
      <table className="fx-table w-full text-[14px]">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.header} className={`${c.align === "right" ? "text-right" : "text-left"} ${c.hideOnMobile ? "hidden sm:table-cell" : ""} px-3 py-2`} scope="col">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRow ? "cursor-pointer" : undefined}
              onClick={onRow ? () => onRow(row) : undefined}
              onKeyDown={onRow ? (e) => (e.key === "Enter" ? onRow(row) : undefined) : undefined}
              tabIndex={onRow ? 0 : undefined}
            >
              {cols.map((c) => (
                <td key={c.header} className={`${c.align === "right" ? "text-right tabular-nums" : ""} ${c.hideOnMobile ? "hidden sm:table-cell" : ""} px-3 py-2 align-top`}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Load more" for `{ items, nextCursor }` lists; the first page reloads whenever `deps` change (by value). */
export function usePaged<T>(load: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>, deps: readonly unknown[]) {
  const depsKey = JSON.stringify(deps);
  const [tick, setTick] = useState(0);
  const key = `${depsKey}#${tick}`;
  const [state, setState] = useState<{ key: string | null; items: T[]; cursor: string | null; error: unknown }>({ key: null, items: [], cursor: null, error: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  useEffect(() => {
    let live = true;
    loader.current(null).then(
      (page) => live && setState({ key, items: page.items, cursor: page.nextCursor, error: null }),
      (error: unknown) => live && setState({ key, items: [], cursor: null, error })
    );
    return () => {
      live = false;
    };
  }, [key]);
  const current = state.key === key;
  const cursor = current ? state.cursor : null;
  const more = useCallback(async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await loader.current(cursor);
      setState((s) => (s.key === key ? { ...s, items: [...s.items, ...page.items], cursor: page.nextCursor } : s));
    } catch (error) {
      setState((s) => (s.key === key ? { ...s, error } : s));
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, key]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { items: current ? state.items : [], hasMore: cursor !== null, loading: !current || loadingMore, error: current ? state.error : null, more, reload };
}
