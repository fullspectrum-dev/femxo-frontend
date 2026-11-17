import { AuthApiError } from "@/features/auth/services/auth-client";

/*
 * Plain-language wording for femxo-backend's error codes. A code listed here always reads the same
 * wherever it comes up; any other 4xx shows the API's own sentence; 5xx and network errors stay generic.
 */
export const ERROR_MESSAGES: Record<string, string> = {
  PRICE_CHANGED: "The price changed since you opened this. Reload the prices and try again.",
  DISCOUNT_NEEDS_APPROVAL: "This discount is above the limit and needs approval before it can be applied.",
  CATALOG_MISMATCH: "An item no longer matches the catalog. Reload and try again.",
  VARIANT_UNAVAILABLE: "That pack size is not available right now.",
  PAYOUT_ACCOUNT_ON_HOLD: "The new bank account is still in its safety hold. Payouts to it start after the hold ends.",
  PAYOUT_ACCOUNT_MISSING: "This partner has no approved bank account yet.",
  PAYOUT_ACCOUNT_CHANGE_PENDING: "A bank account change is already waiting for approval.",
  PAYOUT_ACCOUNT_CHANGE_NOT_PENDING: "This bank account change was already decided.",
  PAYOUT_NOT_PENDING: "This payout was already decided.",
  BANK_ACCOUNT_REFUSED: "The bank could not verify that account. Check the number and IFSC.",
  PAYOUT_VENDOR_NOT_CONFIGURED: "Payouts are not set up on the server yet.",
  PAYOUT_VENDOR_UNAVAILABLE: "The payout provider is not answering. Try again shortly.",
  MAKER_CHECKER: "A different person must decide this. You raised it, so you can't approve or reject it.",
  SELF_APPROVAL: "You can't decide a request you raised.",
  ASSIGNEE_IS_CREATOR: "The approver must be someone other than you.",
  APPROVER_REQUIRED: "Choose who will approve this application.",
  SUPER_ADMIN_REQUIRED: "Only a Super Admin can do this.",
  DEALER_CHANGED: "This dealer was changed by someone else. Reopen it and try again.",
  DEALER_NOT_EDITABLE: "Only draft or rejected applications can be edited.",
  INVALID_TRANSITION: "This record is not in a state that allows that action. It may have changed meanwhile.",
  IDEMPOTENCY_KEY_REQUIRED: "The request was missing its safety key. Reload the page and try again.",
  IDEMPOTENCY_KEY_REUSED: "That action was already submitted with different details. Reload and try again.",
  OTP_LOCKED: "Too many wrong codes. This is locked for now, try again later.",
  OTP_INVALID: "That code is not correct.",
  OTP_EXPIRED: "That code has expired. Ask for a new one.",
  OTP_TOO_MANY_ATTEMPTS: "Too many wrong codes. Ask for a new one later.",
  OTP_RESEND_TOO_SOON: "Please wait a little before asking for another code.",
  OTP_SEND_LIMIT: "Too many codes were requested. Try again later.",
  OTP_NOT_CONFIGURED: "Code sending is not set up on the server yet.",
  DELIVERY_OTP_NOT_CONFIGURED: "Delivery codes are not set up on the server yet.",
  ORDER_PRICING_NOT_CONFIGURED: "Order pricing is not set up on the server yet.",
  ORDER_CANCELLED: "This order is already cancelled.",
  ORDER_HAS_DELIVERIES: "Part of this order is already delivered. Cancel the undelivered items one by one instead.",
  INSUFFICIENT_FUNDS: "The wallet does not have enough money for this.",
  INSUFFICIENT_STOCK: "There is not enough stock for this.",
  APPROVAL_REQUIRED: "This needs an approved request first.",
  ALREADY_DECIDED: "This request was already decided.",
  RETURN_ALREADY_DECIDED: "This return was already decided.",
  VERSION_CHANGED: "This was changed by someone else. Reload and try again.",
  REASON_REQUIRED: "Write a reason first.",
  SEARCH_TOO_SHORT: "Type at least 3 letters of the name, or a full ID or mobile number.",
  VALIDATION_ERROR: "Some details need attention. Check them and try again.",
  REFUND_EXCEEDS_PAYMENT: "That is more than what is left to refund on this payment. Check the amount.",
  NOT_REFUNDABLE: "Only a captured payment can be refunded.",
  REFUND_REFUSED: "The payment provider refused this refund. Nothing was refunded.",
  REFUND_NOT_FOUND: "This refund was not found.",
  REFUND_CLOSED: "This refund is already finished or closed.",
  APPROVAL_PENDING: "The approver has not decided yet. Execute the refund once it is approved.",
  PAYMENT_NOT_FOUND: "This payment was not found, or it is outside your territories.",
  PAYMENTS_NOT_CONFIGURED: "Online payments are not set up on the server yet.",
  PAYMENT_PROVIDER_UNAVAILABLE: "The payment provider is not answering. If a refund was sent, it is kept as processing: press Execute refund again shortly.",
  PAYMENT_PROVIDER_REFUSED: "The payment provider refused this request.",
  APPROVER_NOT_ELIGIBLE: "That person can't approve this. Choose someone else.",
  REVIEW_NOT_FOUND: "This review was not found.",
  REVIEW_CHANGED: "Someone else moderated this review a moment ago. Reload to see its state.",
  ORDER_NOT_CONFIRMED: "This order is not confirmed yet, so it can't be delivered, cancelled item by item or returned.",
  CUSTOMER_CHANGED: "This customer was changed by someone else. Reload and try again.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Please wait before trying again.",
};

/** The sentence to show a person for any failed call. */
export function describeError(error: unknown, fallback = "Something went wrong. Nothing was changed."): string {
  if (error instanceof AuthApiError) {
    const mapped = ERROR_MESSAGES[error.code];
    if (mapped) return error.retryAfterSeconds && error.status === 429 ? `${mapped} (try again in ${error.retryAfterSeconds}s)` : mapped;
    if (error.apiMessage) return error.apiMessage;
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
