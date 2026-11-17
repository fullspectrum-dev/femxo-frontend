"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Checkbox, FormField, SelectInput, TextArea } from "./FormField";
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
  pick,
}: {
  open: boolean;
  onClose: () => void;
  /** Gets the written reason when `reason` was asked for. */
  onConfirm: (reason?: string, picked?: string) => void;
  kind: ConfirmKind;
  title: string;
  description: string;
  amount?: string;
  amountLabel?: string;
  record: string;
  confirmLabel: string;
  /** Asks for a written reason of at least `min` characters (kept in the audit log). */
  reason?: { label: string; min: number };
  /** Asks to choose one option first (e.g. the approver). Options load when the dialog opens. */
  pick?: { label: string; options: () => Promise<readonly { value: string; label: string }[]> };
}) {
  const [understood, setUnderstood] = useState(false);
  const [text, setText] = useState("");
  const reasonOk = !reason || text.trim().length >= reason.min;
  const [choices, setChoices] = useState<{ state: "loading" | "ready" | "failed"; items: readonly { value: string; label: string }[] }>({ state: pick ? "loading" : "ready", items: [] });
  const [picked, setPicked] = useState("");
  const pickOk = !pick || picked !== "";

  useEffect(() => {
    if (!pick || !open) return;
    let live = true;
    pick
      .options()
      .then((items) => live && setChoices({ state: "ready", items }))
      .catch(() => live && setChoices({ state: "failed", items: [] }));
    return () => {
      live = false;
    };
    // The loader is stable per action spec.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setUnderstood(false);
    setText("");
    setPicked("");
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
            disabled={!understood || !reasonOk || !pickOk}
            onClick={() => {
              const given = text.trim();
              setUnderstood(false);
              setText("");
              setPicked("");
              onConfirm(reason ? given : undefined, pick ? picked : undefined);
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
        {pick ? (
          <FormField
            label={pick.label}
            required
            helper={choices.state === "loading" ? "Loading…" : choices.state === "failed" ? "Couldn't load the list. Close and try again." : undefined}
          >
            {({ inputId, describedBy }) => (
              <SelectInput id={inputId} aria-describedby={describedBy} value={picked} onChange={(event) => setPicked(event.target.value)} disabled={choices.state !== "ready"}>
                <option value="">Choose…</option>
                {choices.items.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </SelectInput>
            )}
          </FormField>
        ) : null}
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
