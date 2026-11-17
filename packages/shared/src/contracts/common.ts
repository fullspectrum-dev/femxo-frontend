import { z } from "zod";

/*
 * Conventions shared with femxo-backend and the admin panel:
 * money is integer paise, GST rates are basis points (500 = 5%), prices are
 * GST-inclusive, IDs are opaque strings, timestamps are ISO-8601 strings.
 */

export const Paise = z.number().int().nonnegative();
export const IsoDateTime = z.iso.datetime({ offset: true });
export const IsoDate = z.iso.date();
export const Cursor = z.string().nullable();
export const MAX_PAGE_SIZE = 100;
export const Limit = z.number().int().min(1).max(MAX_PAGE_SIZE);

/** A cursor page: `{ items, nextCursor }`, at most 100 items. */
export const page = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item).max(MAX_PAGE_SIZE), nextCursor: Cursor });

/**
 * Error codes the storefront has a message for. The backend's list is open (every module adds its own,
 * e.g. OTP_INVALID or ACCOUNT_BLOCKED), so the wire value is any string: `ApiError.code` is a string, and
 * these are only the ones the UI branches on. Unknown codes still arrive with the backend's own message.
 */
export const KNOWN_ERROR_CODES = [
  // From femxo-backend (libs/http, identity OTP service, customer auth)
  "VALIDATION_ERROR", // 400
  "BAD_REQUEST", // 400, malformed JSON
  "UNAUTHENTICATED", // 401
  "FORBIDDEN", // 403
  "NOT_FOUND", // 404
  "OTP_INVALID", // 400: wrong, expired or used code (the answer never says which)
  "OTP_RESEND_TOO_SOON", // 429 + Retry-After
  "OTP_TOO_MANY_ATTEMPTS", // 429 + Retry-After
  "TOO_MANY_ATTEMPTS", // 429 + Retry-After (per phone / per IP window)
  "OTP_NOT_CONFIGURED", // 503: phone sign-in is not set up on the server
  "ACCOUNT_BLOCKED", // 403
  "SIGNUP_TOKEN_INVALID", // 400: the verified-phone proof is used up or expired
  "PHONE_ALREADY_REGISTERED", // 409
  "TERRITORY_NOT_FOUND", // 422: unknown or retired location
  "INTERNAL_ERROR", // 500
  // Raised by the storefront's own adapters
  "INTERNAL", // anything we couldn't classify: network down, 5xx without an envelope, contract drift
  "NOT_AVAILABLE", // 503: a feature femxo-backend does not offer yet (cart, orders, ...); not an outage
  // Contracts for features that are still design-first (cart, checkout, orders)
  "VALIDATION_FAILED",
  "IDEMPOTENCY_KEY_REQUIRED",
  "IDEMPOTENCY_MISMATCH",
  "OUT_OF_STOCK",
  "PRICE_CHANGED",
  "CART_EXPIRED",
  "COUPON_INVALID",
  "ORDER_STATE",
  "NOT_SERVICEABLE",
  "OTP_EXPIRED",
  "RATE_LIMITED",
  "PAYMENT_FAILED",
  // Cart, checkout, orders and payments (ADR 0020, 0021)
  "CART_CHANGED",
  "CART_EMPTY",
  "VARIANT_UNAVAILABLE",
  "INSUFFICIENT_STOCK",
  "CHECKOUT_IN_PROGRESS",
  "ADDRESS_NOT_SERVICEABLE",
  "COD_NOT_AVAILABLE",
  "COD_NOT_ELIGIBLE",
  "ORDER_TOO_LARGE",
  "ORDER_NOT_CANCELLABLE",
  "ORDER_DISPATCHED",
  "PAYMENT_WINDOW_LAPSED",
  "PAYMENT_PROVIDER_UNAVAILABLE",
  "INVALID_SIGNATURE",
  "NOT_A_BUYER",
  "REVIEW_EXISTS",
] as const;
export type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number];
/** Any code string; the known ones autocomplete. */
export type ApiErrorCode = KnownErrorCode | (string & {});

/** The backend's error envelope: `{ error: { code, message } }` (details are optional and only some routes send them). */
export const ApiErrorBody = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

export const MobileNumber = z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number");
export const Pincode = z.string().regex(/^\d{6}$/, "Enter a 6-digit pincode");
