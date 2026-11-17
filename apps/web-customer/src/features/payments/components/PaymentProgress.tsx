import { Loader2 } from "lucide-react";
import { PHASE_TEXT } from "../useOnlinePayment";
import type { PaymentPhase } from "../useOnlinePayment";

/** What is happening while a payment runs, announced politely. Renders nothing when idle. */
export function PaymentProgress({ phase }: { phase: PaymentPhase }) {
  return (
    <div role="status" aria-live="polite" data-testid="payment-progress">
      {phase !== "idle" ? (
        <p className="flex items-center gap-2 rounded-control bg-info-soft px-3 py-2.5 text-sm font-medium text-info">
          <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {PHASE_TEXT[phase]}
        </p>
      ) : null}
    </div>
  );
}
