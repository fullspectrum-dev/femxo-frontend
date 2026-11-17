"use client";

import { useCallback, useRef, useState } from "react";
import { failureText, runCheckout, settlePayment } from "@femxo/shared";
import type { RazorpayOptions } from "@femxo/shared";
import type { Payment, RazorpaySuccess, VerifyResult } from "@femxo/shared/contracts";
import { loadRazorpay } from "@/lib/razorpay";

export type PaymentPhase = "idle" | "loading" | "open" | "confirming";

/** How a payment attempt ended, in terms the screen can act on. `paid` only ever comes from our server's answer. */
export type PayResult =
  | { kind: "paid"; payment: Payment | null }
  /** Razorpay (or the bank) failed the payment, or the server says it failed or expired. Nothing to wait for: offer a retry. */
  | { kind: "failed"; message: string }
  /** The customer closed the window without paying. */
  | { kind: "dismissed" }
  /** The signature was refused: we don't treat anything as paid. */
  | { kind: "rejected" }
  /** The server hasn't decided within a minute; the webhook will settle it. */
  | { kind: "unconfirmed" }
  /** The Razorpay script didn't load. */
  | { kind: "load-error" };

export interface PayArgs {
  keyId: string;
  providerOrderId: string;
  amountPaise: number;
  description: string;
  prefill?: RazorpayOptions["prefill"];
  /** `POST /payments/verify`. */
  verify: (success: RazorpaySuccess) => Promise<VerifyResult>;
  /** Asks the server how it stands (the payment, or what it is for). */
  check: (paymentId: string | null) => Promise<"paid" | "failed" | "pending">;
}

/**
 * Opens Razorpay Checkout for a payment the server created, then settles it with the server (verify, then poll).
 * One payment at a time: a second call while one is running returns the same kind of result as a dismissed one without opening twice.
 */
export function useOnlinePayment() {
  const [phase, setPhase] = useState<PaymentPhase>("idle");
  const running = useRef(false);

  const pay = useCallback(async (args: PayArgs): Promise<PayResult> => {
    if (running.current) return { kind: "dismissed" };
    running.current = true;
    try {
      setPhase("loading");
      let Razorpay;
      try {
        Razorpay = await loadRazorpay();
      } catch {
        return { kind: "load-error" };
      }
      setPhase("open");
      const outcome = await runCheckout(Razorpay, {
        key: args.keyId,
        order_id: args.providerOrderId,
        amount: args.amountPaise,
        currency: "INR",
        name: "Femxo",
        description: args.description,
        prefill: args.prefill,
      });
      if (outcome.kind === "dismissed") return outcome.lastFailure ? { kind: "failed", message: failureText(outcome.lastFailure) } : { kind: "dismissed" };

      // The browser says it worked. Only the server can say so.
      setPhase("confirming");
      const settled = await settlePayment({ verify: () => args.verify(outcome.response), check: args.check });
      if (settled.outcome === "paid") return { kind: "paid", payment: settled.payment };
      if (settled.outcome === "failed") return { kind: "failed", message: "The payment didn't go through. No money was taken, or it will be returned to you." };
      if (settled.outcome === "rejected") return { kind: "rejected" };
      return { kind: "unconfirmed" };
    } finally {
      running.current = false;
      setPhase("idle");
    }
  }, []);

  return { phase, pay };
}

export const PHASE_TEXT: Record<Exclude<PaymentPhase, "idle">, string> = {
  loading: "Opening secure payment…",
  open: "Complete your payment in the Razorpay window.",
  confirming: "Confirming your payment with the bank. Please don't close this page.",
};
