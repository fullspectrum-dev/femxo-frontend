import type { ApiErrorCode } from "../../contracts/common";
import type { MockResult } from "./router";

/** Thrown by mock handlers; the adapter turns it into the backend's error envelope. */
export class MockHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly headers?: Record<string, string>
  ) {
    super(message);
    this.name = "MockHttpError";
  }
}

export const errorBody = (code: ApiErrorCode, message: string, details?: Record<string, unknown>) => ({
  error: details ? { code, message, details } : { code, message },
});

/**
 * An error answer that still commits the handler's changes. Throwing a
 * MockHttpError rolls everything back; use this where the real backend
 * would persist the attempt (a wrong OTP counts, a lockout sticks).
 */
export function failure(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
  headers?: Record<string, string>
): MockResult {
  return { status, body: errorBody(code, message, details), headers };
}
