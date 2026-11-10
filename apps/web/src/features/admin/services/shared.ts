import type { TimelineStep } from "@/components/admin-ui";
import type { RecordRow } from "../data/records";

/** `2026-11-02T10:20:00.000Z` → `2026-11-02`. */
export const dayOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);

/** `9876543210` → `98•••••210`. The API sends partner numbers whole; the panel shows them masked like the prototype did. */
export const maskPhone = (phone: string) => (phone.length > 5 ? `${phone.slice(0, 2)}${"•".repeat(phone.length - 5)}${phone.slice(-3)}` : phone);

/** Steps before `current` are done, `current` is in progress, the rest upcoming. `failed` marks `current` as the step that went wrong. */
export function stepsOf(labels: readonly string[], current: number, opts: { failed?: boolean; metas?: Record<number, string> } = {}): TimelineStep[] {
  return labels.map((label, index) => ({
    label,
    state: index < current ? "done" : index === current ? (opts.failed ? "failed" : "current") : "upcoming",
    meta: opts.metas?.[index],
  }));
}

/** A page of rows from a `{ items, nextCursor }` style answer, in the panel's shape. */
export const pageOf = (items: RecordRow[], nextCursor: string | null | undefined) => ({ items, nextCursor: nextCursor ?? null, total: null });

