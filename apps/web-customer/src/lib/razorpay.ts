import type { RazorpayConstructor } from "@femxo/shared";

/** The one place the storefront loads a third-party script, and only when someone is about to pay (never on a plain page view). */
export const RAZORPAY_SRC = "https://checkout.razorpay.com/v1/checkout.js";

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loading: Promise<RazorpayConstructor> | undefined;

/**
 * Loads Razorpay's Checkout script once and resolves with its constructor. A failure (offline, blocked) is not kept:
 * the next call tries again, so "try again" on the payment screen really does.
 */
export function loadRazorpay(doc: Document = document): Promise<RazorpayConstructor> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loading) return loading;
  const attempt = new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = doc.createElement("script");
    script.src = RAZORPAY_SRC;
    script.async = true;
    script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Razorpay did not start.")));
    script.onerror = () => {
      script.remove();
      reject(new Error("Razorpay could not be loaded."));
    };
    doc.head.appendChild(script);
  });
  loading = attempt;
  attempt.catch(() => {
    if (loading === attempt) loading = undefined;
  });
  return attempt;
}
