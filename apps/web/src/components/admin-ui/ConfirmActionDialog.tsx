"use client";

import { useState } from "react";
import { Button } from "./Button";
import { Checkbox, FormField, TextArea } from "./FormField";
import { Dialog } from "./Overlay";

export type ConfirmKind = "financial" | "destructive";

/**
 * Foundations "Confirm financial action": names the amount and the record,
 * and the confirm button stays disabled until the user ticks
 * "I understand this cannot be undone".
 */
export function ConfirmActionDialog({
  open,
  onClose,
  onConfirm,
  kind,
  title,
  description,
  amount,
  amountLabel = "Amount affected",
  record,
  confirmLabel,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  /** Gets the written reason when `reason` was asked for. */
  onConfirm: (reason?: string) => void;
  kind: ConfirmKind;
  title: string;
  description: string;
  amount?: string;
  amountLabel?: string;
  record: string;
  confirmLabel: string;
  /** Asks for a written reason of at least `min` characters (kept in the audit log). */
  reason?: { label: string; min: number };
}) {
  const [understood, setUnderstood] = useState(false);
  const [text, setText] = useState("");
  const reasonOk = !reason || text.trim().length >= reason.min;

  const close = () => {
    setUnderstood(false);
    setText("");
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant={kind === "financial" ? "gold" : "danger"}
            disabled={!understood || !reasonOk}
            onClick={() => {
              const given = text.trim();
              setUnderstood(false);
              setText("");
              onConfirm(reason ? given : undefined);
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {amount ? (
          <div className="fx-confirm-amount">
            <span className="text-[13px] fx-muted">{amountLabel}</span>
            <span className="text-[26px] font-semibold tracking-[-0.025em]">{amount}</span>
          </div>
        ) : null}
        <p className="text-[13px]">
          <span className="font-semibold">Affected record:</span> {record}
        </p>
        {reason ? (
          <FormField label={reason.label} required helper={`At least ${reason.min} characters. Kept in the audit log.`}>
            {({ inputId, describedBy }) => (
              <TextArea id={inputId} aria-describedby={describedBy} value={text} onChange={(event) => setText(event.target.value)} rows={3} />
            )}
          </FormField>
        ) : null}
        <Checkbox checked={understood} onChange={setUnderstood}>
          I understand this cannot be undone.
        </Checkbox>
      </div>
    </Dialog>
  );
}
