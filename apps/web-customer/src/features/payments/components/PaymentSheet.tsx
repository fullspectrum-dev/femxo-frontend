"use client";

import { useEffect, useRef, useState } from "react";
import { formatINR } from "@femxo/shared";
import { isApiError } from "@femxo/shared/api";
import type { PaymentApi } from "@femxo/shared/api";
import type { PaymentIntent, PaymentOutcome } from "@femxo/shared/contracts";
import { Button, Dialog } from "@femxo/ui";
import { getPaymentApi } from "@/lib/api";

const OUTCOMES: { value: PaymentOutcome; label: string; hint: string }[] = [
  { value: "success", label: "Success", hint: "The bank accepts the payment." },
  { value: "failure", label: "Failure", hint: "The bank declines it." },
  { value: "pending", label: "Pending", hint: "The bank is slow to answer." },
];

type Phase = { kind: "idle" } | { kind: "paying" } | { kind: "waiting" } | { kind: "failed" } | { kind: "error"; message: string };

/**
 * The stand-in for a payment gateway's sheet. Nothing real is charged: the
 * customer picks how the "bank" answers, so success, failure and a slow
 * pending payment can all be seen. A failed payment is retried on the same
 * order; a pending one is asked about until it settles.
 */
export function PaymentSheet({
  open,
  orderId,
  intent: first,
  amount,
  onPaid,
  onClose,
  payments,
  pollMs = 1500,
}: {
  open: boolean;
  orderId: string;
  intent: PaymentIntent;
  amount: number;
  onPaid: () => void;
  onClose: () => void;
  payments?: PaymentApi;
  pollMs?: number;
}) {
  const apiRef = useRef(payments);
  const api = () => (apiRef.current ??= getPaymentApi());
  const [intent, setIntent] = useState(first);
  const [outcome, setOutcome] = useState<PaymentOutcome>("success");
  const [phase, setPhase] = useState<Phase>({ kind: first.status === "pending" ? "waiting" : "idle" });
  const busy = useRef(false);
  const paid = useRef(onPaid);
  useEffect(() => {
    paid.current = onPaid;
  });

  function settle(next: PaymentIntent) {
    setIntent(next);
    if (next.status === "succeeded") paid.current();
    else if (next.status === "failed") setPhase({ kind: "failed" });
    else setPhase({ kind: "waiting" });
  }

  async function guarded(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    try {
      await action();
    } catch (error) {
      setPhase({ kind: "error", message: isApiError(error) ? error.message : "We couldn't reach the bank. Please try again." });
    } finally {
      busy.current = false;
    }
  }

  const pay = () =>
    guarded(async () => {
      setPhase({ kind: "paying" });
      settle(await api().confirm(intent.id, outcome));
    });

  const retry = () =>
    guarded(async () => {
      setIntent(await api().retry(orderId));
      setOutcome("success");
      setPhase({ kind: "idle" });
    });

  // A pending payment: ask again until the bank has answered.
  const waiting = phase.kind === "waiting";
  useEffect(() => {
    if (!open || !waiting) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api().get(intent.id);
        if (cancelled) return;
        if (next.status === "pending") timer = setTimeout(poll, pollMs);
        else settle(next);
      } catch {
        if (!cancelled) timer = setTimeout(poll, pollMs);
      }
    };
    timer = setTimeout(poll, pollMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
     
  }, [open, waiting, intent.id, pollMs]);

  const price = formatINR(amount);

  return (
    <Dialog open={open} onClose={onClose} title="Pay for your order" description={`Attempt ${intent.attempt}. This is a demo: no real money moves.`} closeLabel="Close">
      {phase.kind === "waiting" ? (
        <div role="status" className="grid gap-2 py-4 text-center">
          <p className="font-semibold">Waiting for your bank to confirm…</p>
          <p className="text-sm text-ink-muted">You can close this. We&apos;ll keep checking, and your order is saved either way.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          <p className="text-center font-display text-3xl font-bold">{price}</p>
          {phase.kind === "failed" ? (
            <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
              Payment failed. Your order is saved, so you can try again whenever you like.
            </p>
          ) : null}
          {phase.kind === "error" ? (
            <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
              {phase.message}
            </p>
          ) : null}
          {phase.kind === "failed" ? (
            <Button onClick={() => void retry()}>Try again</Button>
          ) : (
            <>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-semibold">How should the bank respond?</legend>
                {OUTCOMES.map((entry) => (
                  <div key={entry.value} className="rounded-control border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
                    <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
                      <input
                        type="radio"
                        name="outcome"
                        value={entry.value}
                        checked={outcome === entry.value}
                        onChange={() => setOutcome(entry.value)}
                        aria-describedby={`outcome-${entry.value}`}
                        className="accent-primary"
                      />
                      {entry.label}
                    </label>
                    <p id={`outcome-${entry.value}`} className="pl-7 text-xs text-ink-muted">
                      {entry.hint}
                    </p>
                  </div>
                ))}
              </fieldset>
              <Button size="lg" busy={phase.kind === "paying"} onClick={() => void pay()}>
                Pay {price}
              </Button>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
