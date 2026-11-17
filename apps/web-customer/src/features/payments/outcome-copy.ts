import type { OrderPayResult } from "./useOrderPayment";

/** The sentence for how a payment attempt ended (the screen decides what buttons go with it). */
export function outcomeMessage(result: OrderPayResult): string {
  switch (result.kind) {
    case "paid":
      return "Payment received. Thank you!";
    case "failed":
      return result.message;
    case "dismissed":
      return "You closed the payment window, so nothing was paid. Your order is held for a short while: pay now, or cancel it.";
    case "rejected":
      return "We couldn't confirm that payment. If money was taken it will be returned, or your order confirmed, shortly. Check My orders in a few minutes.";
    case "unconfirmed":
      return "We're still waiting for the bank to confirm your payment. Your order will update by itself, and you don't need to pay again.";
    case "load-error":
      return "We couldn't open the payment window. Check your connection and try again.";
    case "error":
      return result.message;
  }
}
