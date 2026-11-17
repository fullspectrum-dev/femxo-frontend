import { isApiError } from "../api/errors";
import type { Payment, PaymentStatus, RazorpaySuccess, VerifyResult } from "../contracts/commerce";

/*
 * How an online payment is settled. Razorpay's success callback runs in the customer's browser, so it proves nothing
 * by itself (ADR 0021): the screen says "paid" only after OUR server says so, either by `POST /payments/verify`
 * (which checks the signature and asks Razorpay) or by what a later read of the payment, the order or the membership
 * shows (the webhook is the source of truth). Everything here is pure, with injectable timing, so it is unit-tested.
 */

const PAID: readonly PaymentStatus[] = ["captured", "partially_refunded", "refunded"];
const FAILED: readonly PaymentStatus[] = ["failed", "expired"];

/** What a server-side status means for the customer. `authorized` and `created` are not decided yet. */
export function paymentVerdict(status: PaymentStatus): "paid" | "failed" | "pending" {
  if (PAID.includes(status)) return "paid";
  if (FAILED.includes(status)) return "failed";
  return "pending";
}

export type Settlement =
  /** The server confirmed the money. */
  | { outcome: "paid"; payment: Payment | null }
  /** The server says the payment failed or expired. */
  | { outcome: "failed"; payment: Payment | null }
  /** The signature did not check out: nothing was confirmed, whatever the browser said. */
  | { outcome: "rejected" }
  /** Still undecided when we stopped asking; the webhook will settle it, so the customer is pointed at My orders. */
  | { outcome: "unconfirmed"; payment: Payment | null };

export interface SettleOptions {
  /** `POST /payments/verify` with the callback's data. */
  verify: () => Promise<VerifyResult>;
  /**
   * Asks the server how it stands. With a payment id, read that payment; without one (verify never got an answer), read what the
   * payment is for (the order, the membership). Must not throw for a transient failure it wants retried: throw and it is retried.
   */
  check: (paymentId: string | null) => Promise<"paid" | "failed" | "pending">;
  intervalMs?: number;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function settlePayment(options: SettleOptions): Promise<Settlement> {
  const { verify, check, intervalMs = 2000, timeoutMs = 60_000, now = Date.now, sleep = defaultSleep, signal } = options;
  let payment: Payment | null = null;

  try {
    const answer = await verify();
    payment = answer.payment;
    const verdict = paymentVerdict(answer.payment.status);
    if (verdict !== "pending") return { outcome: verdict, payment };
  } catch (error) {
    // A wrong signature or a payment that is not ours: nothing to wait for.
    if (isApiError(error) && (error.code === "INVALID_SIGNATURE" || error.code === "ORDER_MISMATCH")) return { outcome: "rejected" };
    // Anything else (offline, a slow provider, 5xx): the payment may well have gone through, so keep asking.
  }

  const deadline = now() + timeoutMs;
  while (now() < deadline && !signal?.aborted) {
    await sleep(intervalMs);
    if (signal?.aborted) break;
    try {
      const verdict = await check(payment?.id ?? null);
      if (verdict !== "pending") return { outcome: verdict, payment };
    } catch {
      // Try again until the deadline.
    }
  }
  return { outcome: "unconfirmed", payment };
}

/** The reading of `GET /payments/:id` as a check result. */
export const verdictOfPayment = (payment: Payment) => paymentVerdict(payment.status);

/** An order's status as a payment verdict (used when there is no payment id to poll). */
export function verdictOfOrderStatus(status: string): "paid" | "failed" | "pending" {
  if (status === "placed" || status === "completed") return "paid";
  if (status === "payment_failed" || status === "cancelled") return "failed";
  return "pending";
}

// ---------- Razorpay Checkout ----------

export interface RazorpayFailure {
  code?: string;
  description?: string;
  reason?: string;
}

export interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: "INR";
  name: string;
  description?: string;
  prefill?: { name?: string; contact?: string; email?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void; confirm_close?: boolean; escape?: boolean };
  handler?: (response: RazorpaySuccess) => void;
}

export interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", callback: (response: { error?: RazorpayFailure }) => void): void;
}
export type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

export type CheckoutOutcome =
  | { kind: "success"; response: RazorpaySuccess }
  /** The customer closed the window. `lastFailure` is set if a payment attempt had failed before that. */
  | { kind: "dismissed"; lastFailure?: RazorpayFailure };

/**
 * Opens Razorpay Checkout and resolves once, with whatever ended it: the success callback, or the window being closed.
 * (A `payment.failed` event does not end it: the customer may retry inside the window, so it is only remembered.)
 */
export function runCheckout(Razorpay: RazorpayConstructor, options: Omit<RazorpayOptions, "handler" | "modal">): Promise<CheckoutOutcome> {
  return new Promise((resolve) => {
    let lastFailure: RazorpayFailure | undefined;
    let done = false;
    const finish = (outcome: CheckoutOutcome) => {
      if (done) return;
      done = true;
      resolve(outcome);
    };
    const instance = new Razorpay({
      ...options,
      modal: { ondismiss: () => finish({ kind: "dismissed", lastFailure }), confirm_close: true, escape: true },
      handler: (response) => finish({ kind: "success", response }),
    });
    instance.on("payment.failed", (response) => {
      lastFailure = response.error;
    });
    instance.open();
  });
}

/** The words for a failed attempt Razorpay reported, or a calm default. */
export function failureText(failure: RazorpayFailure | undefined): string {
  return failure?.description?.trim() || "The payment didn't go through. No money was taken, or it will be returned to you.";
}
