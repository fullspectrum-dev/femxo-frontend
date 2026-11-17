import { ApiError } from "./errors";

const wait = (seconds?: number) => {
  if (!seconds || seconds < 1) return "a moment";
  if (seconds < 60) return `${Math.ceil(seconds)} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
};

const GENERIC = "Something went wrong. Please try again.";

/**
 * The sentence a customer reads for a failed call. Known backend codes get our own wording (the backend's
 * text is for developers); a 4xx we have no wording for keeps the backend's message, since it is written
 * to be shown; anything else (5xx, network, contract drift) is the generic line, never an internal message.
 */
export function userMessage(error: unknown, fallback = GENERIC): string {
  if (!(error instanceof ApiError)) return fallback;
  switch (error.code) {
    case "OTP_INVALID":
      return "That code isn't right, or it has expired. Check it, or get a new code.";
    case "OTP_EXPIRED":
      return "That code has expired. Get a new one.";
    case "OTP_RESEND_TOO_SOON":
      return `A code was just sent. You can ask for another in ${wait(error.retryAfterSeconds)}.`;
    case "OTP_TOO_MANY_ATTEMPTS":
      return `Too many wrong codes. Get a new code in ${wait(error.retryAfterSeconds)}.`;
    case "TOO_MANY_ATTEMPTS":
    case "RATE_LIMITED":
      return `Too many attempts. Try again in ${wait(error.retryAfterSeconds)}.`;
    case "OTP_NOT_CONFIGURED":
      return "Mobile sign-in isn't switched on yet. Please try again later.";
    case "ACCOUNT_BLOCKED":
      return "This account is blocked. Please contact Femxo support.";
    case "SIGNUP_TOKEN_INVALID":
      return "Your verification ran out. Please enter your mobile number and get a new code.";
    case "PHONE_ALREADY_REGISTERED":
      return "This mobile number already has an account. Sign in instead.";
    case "TERRITORY_NOT_FOUND":
      return "We don't deliver to that location yet. Please choose another.";
    case "CART_CHANGED":
      return "Your cart changed in the meantime. We've refreshed it, so please review it.";
    case "CART_EMPTY":
      return "Your cart is empty. Add something to order.";
    case "PRICE_CHANGED":
      return "A price changed since you last looked. Review your cart and the new total, then try again.";
    case "VARIANT_UNAVAILABLE":
    case "VARIANT_NOT_FOUND":
      return "One of the items in your cart isn't on sale any more. Remove it to continue.";
    case "PRICE_NOT_SET_FOR_TIER":
      return "One of the items doesn't have a price for you yet. Remove it to continue.";
    case "INSUFFICIENT_STOCK":
    case "OUT_OF_STOCK":
      return "Some items don't have enough stock for your area. Reduce the quantity or remove them.";
    case "CART_DUPLICATE_VARIANT":
      return "The same item was added twice. Please refresh your cart.";
    case "CART_QUANTITY_LIMIT":
      return "That's more of one item than we allow in an order.";
    case "CART_LINE_LIMIT":
      return "Your cart has the most different items we allow. Remove one to add another.";
    case "CHECKOUT_IN_PROGRESS":
      return "Your order is still being placed. Wait a moment and check My orders before trying again.";
    case "CHECKOUT_NOT_CONFIGURED":
      return "Ordering isn't switched on for your area yet. Please try again later.";
    case "ADDRESS_NOT_SERVICEABLE":
    case "NOT_SERVICEABLE":
      return "We don't deliver to that address yet. Choose another address.";
    case "ADDRESS_NOT_FOUND":
      return "We couldn't find that address. Pick one from your address book.";
    case "ADDRESS_LIMIT_REACHED":
      return "Your address book is full. Delete one to add another.";
    case "PINCODE_UNKNOWN":
      return "We don't know that pincode. Check it and try again.";
    case "PINCODE_LOCATION_MISMATCH":
      return "That pincode doesn't belong to the village or area you chose. Check both.";
    case "COD_NOT_AVAILABLE":
      return "Cash on delivery isn't available for this order. Pay online instead.";
    case "COD_NOT_ELIGIBLE":
      return "You already have open cash-on-delivery orders. Pay online, or wait until they are delivered.";
    case "ORDER_TOO_LARGE":
      return "This order is larger than we can take in one go. Split it into two orders.";
    case "ONLINE_PAYMENT_NOT_AVAILABLE":
    case "ONLINE_PAYMENT_NOT_CONFIGURED":
    case "PAYMENTS_NOT_CONFIGURED":
      return "Online payment isn't available right now. Try cash on delivery, or come back later.";
    case "PAYMENT_PROVIDER_UNAVAILABLE":
      return "The payment service isn't answering. Your order is held for a short while: try paying again from My orders.";
    case "IDEMPOTENCY_KEY_REUSED":
    case "IDEMPOTENCY_MISMATCH":
      return "That request was already used for something different. Please start again.";
    case "IDEMPOTENCY_KEY_REQUIRED":
      return "Something went wrong on our side. Please refresh and try again.";
    case "ORDER_NOT_FOUND":
      return "We couldn't find that order.";
    case "ORDER_NOT_CANCELLABLE":
      return "This order can't be cancelled any more.";
    case "ORDER_DISPATCHED":
      return "This order is already out for delivery, so it can't be cancelled here.";
    case "ORDER_CHANGED":
      return "The order changed while you were looking at it. We've refreshed it; try again.";
    case "NOT_AN_ONLINE_ORDER":
      return "This order is paid on delivery, so there's nothing to pay online.";
    case "ORDER_NOT_AWAITING_PAYMENT":
      return "This order isn't waiting for payment any more.";
    case "PAYMENT_WINDOW_LAPSED":
      return "The time to pay for this order has run out. Please place a new order.";
    case "INVALID_SIGNATURE":
    case "ORDER_MISMATCH":
      return "We couldn't confirm that payment. If money was taken it will be refunded or the order confirmed shortly.";
    case "PAYMENT_NOT_FOUND":
    case "PAYMENT_NOT_FOUND_AT_PROVIDER":
      return "We couldn't find that payment yet. If money was taken, check My orders in a minute.";
    case "PLAN_NOT_FOUND":
      return "We couldn't find that plan.";
    case "PLAN_ARCHIVED":
      return "That plan isn't sold any more. Pick another one.";
    case "REFERENCE_CONFLICT":
      return "This purchase was already started with different details. Please try again.";
    case "CUSTOMER_BLOCKED":
      return "This account is blocked. Please contact Femxo support.";
    case "WISHLIST_FULL":
      return "Your wishlist is full. Remove something to save another.";
    case "PRODUCT_NOT_FOUND":
      return "That product isn't on sale any more.";
    case "NOT_A_BUYER":
      return "Only customers who received this product can review it.";
    case "REVIEW_EXISTS":
      return "You've already reviewed this product.";
    case "INVALID_CURSOR":
      return "That page of results isn't available any more. Please refresh.";
    case "UNAUTHENTICATED":
      return "Your session has ended. Please sign in again.";
    case "NOT_AVAILABLE":
      return "This isn't available yet. It's coming soon.";
    case "NOT_FOUND":
      return "We couldn't find that.";
    case "VALIDATION_ERROR":
    case "VALIDATION_FAILED":
    case "BAD_REQUEST":
      return "Please check what you entered and try again.";
    default:
      if (error.status === 0) return error.message; // already a plain "check your connection" sentence
      if (error.status >= 400 && error.status < 500 && error.code !== "INTERNAL") return error.message || fallback;
      return fallback;
  }
}
