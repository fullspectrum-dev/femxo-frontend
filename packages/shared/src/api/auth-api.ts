import { Customer, OtpChallenge, Session, type ProfileUpdate } from "../contracts/people";
import type { ApiAdapter } from "./adapter";
import { request } from "./request";

export interface SignupInput {
  name: string;
  email?: string | null;
}

/** AuthApi: mobile OTP, email/password, session refresh and the profile (design §4). */
export function createAuthApi(adapter: ApiAdapter) {
  return {
    requestOtp: (mobile: string) => request(adapter, { method: "POST", path: "/auth/otp", body: { mobile } }, OtpChallenge),
    verifyOtp: (requestId: string, code: string) =>
      request(adapter, { method: "POST", path: "/auth/otp/verify", body: { requestId, code } }, Session),
    /** After the first OTP sign-in: the name (and optional email) a new customer must give. */
    completeSignup: (input: SignupInput) => request(adapter, { method: "POST", path: "/auth/signup", body: input }, Session),
    login: (email: string, password: string) => request(adapter, { method: "POST", path: "/auth/login", body: { email, password } }, Session),
    /** New access token from the httpOnly refresh cookie. Callers must not run two at once (ADR 0005). */
    refresh: () => request(adapter, { method: "POST", path: "/auth/refresh", body: {} }, Session),
    logout: () => request(adapter, { method: "POST", path: "/auth/logout", body: {} }),
    me: () => request(adapter, { method: "GET", path: "/me" }, Customer),
    updateMe: (update: ProfileUpdate) => request(adapter, { method: "PATCH", path: "/me", body: update }, Customer),
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
