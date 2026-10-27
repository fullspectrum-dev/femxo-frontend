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

export const ApiErrorCode = z.enum([
  "VALIDATION_FAILED", // 422
  "IDEMPOTENCY_KEY_REQUIRED", // 400
  "IDEMPOTENCY_MISMATCH", // 422: same key, different body
  "UNAUTHENTICATED", // 401
  "FORBIDDEN", // 403
  "NOT_FOUND", // 404
  "OUT_OF_STOCK", // 409, details: { variantId, available }
  "PRICE_CHANGED", // 409, details: { lines }
  "CART_EXPIRED", // 410
  "COUPON_INVALID", // 422, details: { reason }
  "ORDER_STATE", // 409: the order is not in a state that allows this (cancel after packing, retry of a paid order)
  "NOT_SERVICEABLE", // 422
  "OTP_INVALID", // 422, details: { attemptsLeft }
  "OTP_EXPIRED", // 422
  "RATE_LIMITED", // 429 + Retry-After (OTP lockout, resend)
  "PAYMENT_FAILED", // 402
  "INTERNAL", // 500
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

/** The backend's error envelope (same as femxo-backend /auth). */
export const ApiErrorBody = z.object({
  error: z.object({
    code: ApiErrorCode,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

export const MobileNumber = z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number");
export const Pincode = z.string().regex(/^\d{6}$/, "Enter a 6-digit pincode");
