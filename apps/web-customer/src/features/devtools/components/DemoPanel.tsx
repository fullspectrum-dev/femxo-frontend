"use client";

import { FlaskConical } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import type { ApiMode } from "@femxo/shared";
import type { PaymentOutcome } from "@femxo/shared/contracts";
import type { DemoControls } from "@femxo/shared/demo";
import { Button, Sheet } from "@femxo/ui";

const DAY_MS = 86_400_000;

/**
 * Levers for the demo: random failures, one-shot errors, how the next
 * payment ends, the clock and a reset. Only in mock mode; with the real API
 * connected it renders nothing.
 */
export function DemoPanel({ controls, mode }: { controls: DemoControls; mode: ApiMode }) {
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const state = useSyncExternalStore(controls.subscribe, controls.snapshot, controls.snapshot);
  if (mode !== "mock") return null;

  const aheadDays = Math.round(state.clockOffsetMs / DAY_MS);

  return (
    <>
      <button
        type="button"
        aria-label="Demo controls"
        title="Demo controls"
        onClick={() => setOpen(true)}
        className="fixed bottom-[4.5rem] left-3 z-40 grid h-11 w-11 place-items-center rounded-full border border-line-input bg-surface text-primary shadow-card hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-focus md:bottom-16"
      >
        <FlaskConical size={20} aria-hidden="true" />
      </button>

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setConfirmReset(false);
        }}
        title="Demo controls"
        description="Everything in this store is demo data. Use these to try the error and edge cases."
      >
        <div className="grid gap-6">
          <div className="flex items-start gap-3 text-sm">
            <input
              id="chaos"
              type="checkbox"
              checked={state.chaos}
              onChange={(event) => controls.setChaos(event.target.checked)}
              aria-describedby="chaos-help"
              className="mt-0.5 h-5 w-5 accent-primary"
            />
            <div>
              <label htmlFor="chaos" className="block font-semibold">
                Random server errors
              </label>
              <p id="chaos-help" className="text-ink-muted">
                About one request in five fails, so error screens show up.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <p className="text-sm font-semibold">Next request</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => controls.forceNext("server-error")}>
                Fail the next request
              </Button>
              <Button variant="secondary" size="sm" onClick={() => controls.forceNext("offline")}>
                Go offline for the next request
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void controls.shortStockInCarts()}>
                Make cart items run short
              </Button>
            </div>
          </div>

          <div className="grid gap-1.5 text-sm">
            <label htmlFor="next-payment" className="font-semibold">
              Next payment
            </label>
            <select
              id="next-payment"
              value={state.nextPayment ?? ""}
              onChange={(event) => controls.setNextPayment((event.target.value || null) as PaymentOutcome | null)}
              className="h-11 rounded-control border border-line-input bg-surface px-3"
            >
              <option value="">Succeeds</option>
              <option value="failure">Fails</option>
              <option value="pending">Stays pending</option>
            </select>
          </div>

          <div className="grid gap-2">
            <p className="text-sm font-semibold">Clock</p>
            <p className="text-sm text-ink-muted">{aheadDays > 0 ? `+${aheadDays} ${aheadDays === 1 ? "day" : "days"} ahead` : "Real time"}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => controls.advanceClock(DAY_MS)}>
                Fast-forward 1 day
              </Button>
              <Button variant="secondary" size="sm" onClick={() => controls.advanceClock(7 * DAY_MS)}>
                Fast-forward 7 days
              </Button>
              <Button variant="ghost" size="sm" onClick={() => controls.resetClock()}>
                Back to now
              </Button>
            </div>
          </div>

          <div className="grid gap-2 border-t border-line pt-4">
            {confirmReset ? (
              <>
                <p className="text-sm">This clears carts, orders and sign-in made in this browser and restores the original demo data.</p>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={async () => {
                      await controls.reset();
                      setConfirmReset(false);
                    }}
                  >
                    Yes, reset
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <Button variant="secondary" size="sm" className="w-max" onClick={() => setConfirmReset(true)}>
                Reset demo data
              </Button>
            )}
          </div>
        </div>
      </Sheet>
    </>
  );
}
