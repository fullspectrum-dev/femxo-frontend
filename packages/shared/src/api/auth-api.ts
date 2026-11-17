import { AuthConfig } from "../contracts/commerce";
import {
  Customer,
  CustomerEnvelope,
  OtpRequested,
  SignupResponse,
  TokenGrant,
  VerifyResponse,
  type LocationInput,
  type ProfileUpdate,
  type Session,
  type VerifyOutcome,
} from "../contracts/people";
import type { ApiAdapter } from "./adapter";
import { request } from "./request";

/** Where femxo-backend serves customer sign-in and the profile. */
export const STORE_BASE = "/store/v1";

export interface SignupInput {
  /** From verifyOtp's `signup_required` answer. One use. */
  signupToken: string;
  name: string;
  email?: string | null;
}

/**
 * AuthApi: phone OTP sign-in, signup, session refresh and the profile (femxo-backend /store/v1/auth/*, /me).
 * There is no password: a customer proves the phone with a one-time code. The refresh token lives in an
 * httpOnly cookie the browser sends by itself; only the short-lived access token is ever in script.
 */
export function createAuthApi(adapter: ApiAdapter) {
  const bearer = (accessToken?: string) => (accessToken ? { accessToken } : {});
  return {
    /** Public: OTP length and timings, so the sign-in form never guesses them. */
    config: (signal?: AbortSignal) => request(adapter, { method: "GET", path: `${STORE_BASE}/auth/config`, signal }, AuthConfig),

    requestOtp: (mobile: string) => request(adapter, { method: "POST", path: `${STORE_BASE}/auth/otp/request`, body: { phone: mobile } }, OtpRequested),

    /** A known customer is signed in; an unknown number gets a `signupToken` to finish with `signup`. */
    async verifyOtp(mobile: string, code: string): Promise<VerifyOutcome> {
      const answer = await request(adapter, { method: "POST", path: `${STORE_BASE}/auth/otp/verify`, body: { phone: mobile, code } }, VerifyResponse);
      if (answer.status === "signup_required") return { status: "signup_required", signupToken: answer.signupToken, expiresIn: answer.expiresIn };
      return { status: "signed_in", session: { accessToken: answer.accessToken, expiresIn: answer.expiresIn, user: answer.customer } };
    },

    /** Creates the account for the verified phone and signs the customer in. */
    async signup({ signupToken, name, email }: SignupInput): Promise<Session> {
      const answer = await request(
        adapter,
        { method: "POST", path: `${STORE_BASE}/auth/signup`, body: { signupToken, name, ...(email ? { email } : {}) } },
        SignupResponse
      );
      return { accessToken: answer.accessToken, expiresIn: answer.expiresIn, user: answer.customer };
    },

    /** New access token from the httpOnly refresh cookie. Callers must not run two at once (the refresh token rotates). */
    refresh: () => request(adapter, { method: "POST", path: `${STORE_BASE}/auth/refresh`, body: {} }, TokenGrant),

    /** Ends the session and clears the cookie (204). */
    logout: () => request(adapter, { method: "POST", path: `${STORE_BASE}/auth/logout`, body: {} }),

    /** Pass `accessToken` right after a refresh, before the session provider has stored it. */
    async me(accessToken?: string): Promise<Customer> {
      return (await request(adapter, { method: "GET", path: `${STORE_BASE}/me`, ...bearer(accessToken) }, CustomerEnvelope)).customer;
    },

    async updateMe(update: ProfileUpdate): Promise<Customer> {
      return (await request(adapter, { method: "PATCH", path: `${STORE_BASE}/me`, body: update }, CustomerEnvelope)).customer;
    },

    /** Sets where the customer is served from (their territory). 422 TERRITORY_NOT_FOUND for an unknown location. */
    async setLocation(input: LocationInput): Promise<Customer> {
      return (await request(adapter, { method: "PUT", path: `${STORE_BASE}/me/location`, body: input }, CustomerEnvelope)).customer;
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
