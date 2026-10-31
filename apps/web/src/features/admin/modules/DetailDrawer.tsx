"use client";

import { Info } from "lucide-react";
import { Badge, Button, Drawer, StatusBadge, Timeline } from "@/components/admin-ui";
import type { RecordRow } from "../data/records";
import { formatCell } from "./cells";
import type { ActionSpec, ViewSpec } from "./types";

/**
 * Detail drawer: the record's fields, its workflow timeline, and only the
 * actions its current state allows (the server enforces the same rules).
 */
export function DetailDrawer({
  view,
  row,
  busy,
  onClose,
  onAction,
  onEdit,
}: {
  view: ViewSpec;
  row: RecordRow | null;
  busy: boolean;
  onClose: () => void;
  onAction: (action: ActionSpec, row: RecordRow) => void;
  /** Opens the edit form; only used when the view has one (live mode). */
  onEdit?: (row: RecordRow) => void;
}) {
  const actions = row ? (view.actions ?? []).filter((action) => action.from.includes(row.status)) : [];
  const note = row ? view.note?.(row) : null;

  return (
    <Drawer
      open={row !== null}
      onClose={onClose}
      title={row ? view.recordName(row) : ""}
      subtitle={row ? view.subtitle?.(row) : undefined}
      badge={row && view.statuses.length ? <StatusBadge status={row.status} /> : undefined}
      footer={
        row ? (
          view.readOnly ? (
            <p className="mr-auto self-center text-[13px] fx-muted">Read-only record. It can&rsquo;t be edited or deleted.</p>
          ) : (
            <>
              {view.edit && onEdit ? (
                <Button variant="secondary" disabled={busy} onClick={() => onEdit(row)}>
                  Edit
                </Button>
              ) : null}
              {actions.map((action) => (
                <Button key={action.key} variant={action.variant} disabled={busy} onClick={() => onAction(action, row)}>
                  {action.label}
                </Button>
              ))}
              {!actions.length && !view.edit ? <p className="mr-auto self-center text-[13px] fx-muted">No actions available in this state.</p> : null}
            </>
          )
        ) : null
      }
    >
      {row ? (
        <div className="grid gap-6">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {view.details.map((detail) => (
              <div key={detail.key} className="min-w-0">
                <dt className="fx-label">{detail.label}</dt>
                <dd className="mt-1 break-words text-[14px] font-medium fx-num">{formatCell(row[detail.key], detail.format)}</dd>
              </div>
            ))}
          </dl>

          {note ? (
            <p className="flex gap-2 rounded-[14px] border border-[var(--fx-note-border)] bg-[var(--fx-lavender-surface)] p-3 text-[13px]">
              <Info size={16} className="mt-0.5 flex-none text-[var(--fx-primary-text)]" aria-hidden="true" />
              {note}
            </p>
          ) : null}

          {view.timeline ? (
            <section aria-label={view.timeline.label}>
              <h3 className="mb-3 text-[15px] font-semibold">{view.timeline.label}</h3>
              <Timeline label={view.timeline.label} steps={view.timeline.steps(row)} />
            </section>
          ) : null}

          {view.readOnly ? (
            <Badge tone="neutral" plain className="w-max">
              Append-only
            </Badge>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
