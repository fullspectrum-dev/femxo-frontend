import type { SortState, StatusKey } from "@/components/admin-ui";
import { SEED, type Cell, type DatasetKey, type RecordRow } from "./records";

/*
 * In-browser stand-in for femxo-backend's admin list/create/transition
 * routes. Same contract as the real API (cursor pages, `{ items, nextCursor }`),
 * so swapping this file for an HTTP client is the only change needed when the
 * backend is connected. Changes live in memory until the page reloads.
 */

const store: Record<DatasetKey, RecordRow[]> = Object.fromEntries(
  Object.entries(SEED).map(([key, list]) => [key, list.map((row) => ({ ...row }))])
) as Record<DatasetKey, RecordRow[]>;

const LATENCY_MS = 350;
const wait = (ms = LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lets a reviewer see every Foundations state on any list:
 * ?state=loading | empty | error | denied.
 */
export type PreviewState = "loading" | "empty" | "error" | "denied" | null;

export function readPreviewState(params: Pick<URLSearchParams, "get">): PreviewState {
  const value = params.get("state");
  return value === "loading" || value === "empty" || value === "error" || value === "denied" ? value : null;
}

export class MockApiError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "INTERNAL_ERROR" | "INVALID_TRANSITION" | "NOT_FOUND",
    message: string
  ) {
    super(message);
    this.name = "MockApiError";
  }
}

export interface ListQuery {
  q?: string;
  searchKeys: readonly string[];
  status?: string;
  sort?: SortState;
  cursor?: string | null;
  limit: number;
}

export interface Page {
  items: RecordRow[];
  nextCursor: string | null;
  /** Null when the API pages by cursor and doesn't count. */
  total: number | null;
}

// Opaque to callers, like the API's base64url cursors.
const encodeCursor = (offset: number) => btoa(String(offset));
const decodeCursor = (cursor: string | null | undefined) => {
  if (!cursor) return 0;
  const offset = Number(atob(cursor));
  return Number.isInteger(offset) && offset >= 0 ? offset : 0;
};

function compare(a: Cell, b: Cell) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en-IN", { numeric: true });
}

export async function listRecords(dataset: DatasetKey, query: ListQuery, preview: PreviewState): Promise<Page> {
  if (preview === "loading") return new Promise<Page>(() => undefined);
  await wait();
  if (preview === "error") throw new MockApiError("INTERNAL_ERROR", "Request failed");
  if (preview === "denied") throw new MockApiError("FORBIDDEN", "Missing permission");
  if (preview === "empty") return { items: [], nextCursor: null, total: 0 };

  const needle = query.q?.trim().toLowerCase() ?? "";
  let rows = store[dataset].filter(
    (row) =>
      (!query.status || row.status === query.status) &&
      (!needle || query.searchKeys.some((key) => String(row[key] ?? "").toLowerCase().includes(needle)))
  );
  if (query.sort) {
    const { key, direction } = query.sort;
    rows = [...rows].sort((a, b) => compare(a[key] ?? null, b[key] ?? null) * (direction === "asc" ? 1 : -1));
  }

  const offset = decodeCursor(query.cursor);
  const items = rows.slice(offset, offset + query.limit);
  const next = offset + query.limit;
  return { items, nextCursor: next < rows.length ? encodeCursor(next) : null, total: rows.length };
}

export async function createRecord(dataset: DatasetKey, values: Record<string, Cell>, status: StatusKey): Promise<RecordRow> {
  await wait();
  const row: RecordRow = { ...values, id: `${dataset}-${Date.now()}`, status };
  store[dataset] = [row, ...store[dataset]];
  return row;
}

export async function transitionRecord(
  dataset: DatasetKey,
  id: string,
  from: readonly StatusKey[],
  to: StatusKey,
  patch: Record<string, Cell> = {}
): Promise<RecordRow> {
  await wait(250);
  const current = store[dataset].find((row) => row.id === id);
  if (!current) throw new MockApiError("NOT_FOUND", "Record not found");
  // Same rule as the server's state machine: the record must still be in an
  // allowed state, so a stale screen can't apply a transition twice.
  if (!from.includes(current.status)) throw new MockApiError("INVALID_TRANSITION", "Record changed meanwhile");
  const updated: RecordRow = { ...current, ...patch, status: to };
  store[dataset] = store[dataset].map((row) => (row.id === id ? updated : row));
  return updated;
}
