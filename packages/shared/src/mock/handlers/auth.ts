import { z } from "zod";
import { failure, MockHttpError } from "../../adapters/mock/errors";
import type { MockContext, MockResult, MockRouter } from "../../adapters/mock/router";
import { IsoDate, MobileNumber } from "../../contracts/common";
import type { Customer, Session } from "../../contracts/people";
import { newId } from "../../lib/ids";
import type { MockState } from "../domain/types";

/*
 * The mock's auth, shaped like femxo-backend's ADR 0005: short access
 * tokens, rotating refresh tokens kept in an httpOnly cookie, a session
 * per sign-in. OTP rules follow the demo plan: code 123456, valid 5 minutes,
 * resend after 30 s (3 resends), 5 wrong tries lock the number for 15 min.
 */

export const DEMO_OTP = "123456";
const OTP_TTL_MS = 5 * 60_000;
const RESEND_AFTER_SECONDS = 30;
const MAX_RESENDS = 3;
const MAX_WRONG_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;
const ACCESS_TTL_SECONDS = 900;

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));
const rateLimited = (message: string, retryAfterSeconds: number) =>
  failure(429, "RATE_LIMITED", message, { retryAfterSeconds }, { "retry-after": String(retryAfterSeconds) });
const unauthenticated = (message = "Please sign in to continue.") => failure(401, "UNAUTHENTICATED", message);

function toCustomer(state: MockState, customer: Customer, now: number): Customer {
  const membership = state.memberships[customer.id];
  return { ...customer, isPrime: Boolean(membership && Date.parse(membership.validTill) > now) };
}

/** The customer behind a valid, unexpired access token; throws 401 otherwise. */
export function authenticate({ state, accessToken, clock }: MockContext<MockState>) {
  const match = /^at\.(ses-[0-9a-z]+)\.(\d+)$/.exec(accessToken ?? "");
  const session = match ? state.sessions[match[1]!] : undefined;
  if (!match || !session || Number(match[2]) <= clock.now()) throw new MockHttpError(401, "UNAUTHENTICATED", "Please sign in to continue.");
  const customer = state.customers.find((entry) => entry.id === session.customerId);
  if (!customer) throw new MockHttpError(401, "UNAUTHENTICATED", "Please sign in to continue.");
  return { customer, sessionId: match[1]! };
}

function openSession(state: MockState, customerId: string, now: number) {
  const sessionId = newId("ses");
  const refreshToken = `${sessionId}.${crypto.randomUUID()}`;
  state.sessions[sessionId] = { customerId, refreshToken, usedRefreshTokens: [] };
  state.refreshCookie = refreshToken;
  return { sessionId, accessToken: accessTokenFor(sessionId, now) };
}

const accessTokenFor = (sessionId: string, now: number) => `at.${sessionId}.${now + ACCESS_TTL_SECONDS * 1000}`;

function sessionBody(state: MockState, customer: Customer, accessToken: string, now: number, isNewUser: boolean): Session {
  return { accessToken, expiresIn: ACCESS_TTL_SECONDS, user: toCustomer(state, customer, now), isNewUser };
}

const OtpRequest = z.object({ mobile: MobileNumber });
const OtpVerify = z.object({ requestId: z.string().min(1), code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") });
const Signup = z.object({ name: z.string().trim().min(2).max(60), email: z.email().nullish() });
const Login = z.object({ email: z.email(), password: z.string().min(1) });
const Profile = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  email: z.email().nullable().optional(),
  birthday: IsoDate.nullable().optional(),
});

export function registerAuthRoutes(router: MockRouter<MockState>) {
  router.post("/auth/otp", ({ state, body, clock }): MockResult => {
    const { mobile } = OtpRequest.parse(body);
    const now = clock.now();
    const record = (state.otp.byMobile[mobile] ??= { sends: 0, lastSentAt: 0, lockedUntil: null });

    if (record.lockedUntil !== null) {
      if (record.lockedUntil > now) return rateLimited("Too many attempts. Try again later.", seconds(record.lockedUntil - now));
      record.lockedUntil = null;
      record.sends = 0;
    }
    if (record.sends > 0) {
      const wait = record.lastSentAt + RESEND_AFTER_SECONDS * 1000 - now;
      if (wait > 0) return rateLimited(`Wait ${seconds(wait)} seconds before asking for another code.`, seconds(wait));
      if (record.sends >= 1 + MAX_RESENDS) {
        record.lockedUntil = now + LOCK_MS;
        return rateLimited("Too many codes requested. Try again later.", seconds(LOCK_MS));
      }
    }

    // A new code retires the previous one for this number.
    for (const [id, challenge] of Object.entries(state.otp.challenges)) if (challenge.mobile === mobile) delete state.otp.challenges[id];
    const requestId = newId("otp");
    state.otp.challenges[requestId] = { mobile, createdAt: now, wrongAttempts: 0 };
    record.sends += 1;
    record.lastSentAt = now;
    return { status: 200, body: { requestId, resendAfterSeconds: RESEND_AFTER_SECONDS, expiresInSeconds: OTP_TTL_MS / 1000 } };
  });

  router.post("/auth/otp/verify", ({ state, body, clock }): MockResult => {
    const { requestId, code } = OtpVerify.parse(body);
    const now = clock.now();
    const challenge = state.otp.challenges[requestId];
    if (!challenge) return failure(422, "OTP_EXPIRED", "This code has expired. Request a new one.");
    const record = state.otp.byMobile[challenge.mobile]!;

    if (record.lockedUntil !== null && record.lockedUntil > now) return rateLimited("Too many attempts. Try again later.", seconds(record.lockedUntil - now));
    if (now - challenge.createdAt > OTP_TTL_MS) {
      delete state.otp.challenges[requestId];
      return failure(422, "OTP_EXPIRED", "This code has expired. Request a new one.");
    }
    if (code !== DEMO_OTP) {
      challenge.wrongAttempts += 1;
      if (challenge.wrongAttempts >= MAX_WRONG_ATTEMPTS) {
        record.lockedUntil = now + LOCK_MS;
        delete state.otp.challenges[requestId];
        return rateLimited("Too many wrong codes. Try again in 15 minutes.", seconds(LOCK_MS));
      }
      return failure(422, "OTP_INVALID", "That code isn't right.", { attemptsLeft: MAX_WRONG_ATTEMPTS - challenge.wrongAttempts });
    }

    let customer = state.customers.find((entry) => entry.mobile === challenge.mobile);
    const isNewUser = !customer;
    if (!customer) {
      customer = { id: newId("cus"), name: "", mobile: challenge.mobile, email: null, birthday: null, isPrime: false };
      state.customers.push(customer);
    }
    delete state.otp.challenges[requestId];
    state.otp.byMobile[challenge.mobile] = { sends: 0, lastSentAt: 0, lockedUntil: null };
    const { accessToken } = openSession(state, customer.id, now);
    return { status: 200, body: sessionBody(state, customer, accessToken, now, isNewUser) };
  });

  router.post("/auth/signup", (context): MockResult => {
    const { customer, sessionId } = authenticate(context);
    const { name, email } = Signup.parse(context.body);
    customer.name = name;
    if (email !== undefined) customer.email = email;
    const now = context.clock.now();
    return { status: 200, body: sessionBody(context.state, customer, accessTokenFor(sessionId, now), now, false) };
  });

  router.post("/auth/login", ({ state, body, clock }): MockResult => {
    const { email, password } = Login.parse(body);
    const entry = Object.entries(state.credentials).find(([, credential]) => credential.email === email.toLowerCase());
    const customer = entry && entry[1].password === password ? state.customers.find((candidate) => candidate.id === entry[0]) : undefined;
    // One message for an unknown email and a wrong password, as the real API gives.
    if (!customer) return unauthenticated("Incorrect email or password.");
    const now = clock.now();
    const { accessToken } = openSession(state, customer.id, now);
    return { status: 200, body: sessionBody(state, customer, accessToken, now, false) };
  });

  router.post("/auth/refresh", ({ state, clock }): MockResult => {
    const cookie = state.refreshCookie;
    const sessionId = cookie?.split(".")[0] ?? "";
    const session = state.sessions[sessionId];
    if (!cookie || !session) {
      state.refreshCookie = null;
      return unauthenticated("Your session has ended. Please sign in again.");
    }
    if (cookie !== session.refreshToken) {
      // An already-rotated token again: it was copied, so the whole session ends.
      if (session.usedRefreshTokens.includes(cookie)) delete state.sessions[sessionId];
      state.refreshCookie = null;
      return unauthenticated("Your session has ended. Please sign in again.");
    }
    const customer = state.customers.find((entry) => entry.id === session.customerId)!;
    session.usedRefreshTokens.push(cookie);
    session.refreshToken = `${sessionId}.${crypto.randomUUID()}`;
    state.refreshCookie = session.refreshToken;
    const now = clock.now();
    return { status: 200, body: sessionBody(state, customer, accessTokenFor(sessionId, now), now, false) };
  });

  router.post("/auth/logout", ({ state }): MockResult => {
    const sessionId = state.refreshCookie?.split(".")[0];
    if (sessionId) delete state.sessions[sessionId];
    state.refreshCookie = null;
    return { status: 204 };
  });

  router.get("/me", (context): MockResult => {
    const { customer } = authenticate(context);
    return { status: 200, body: toCustomer(context.state, customer, context.clock.now()) };
  });

  router.patch("/me", (context): MockResult => {
    const { customer } = authenticate(context);
    const update = Profile.parse(context.body);
    if (update.name !== undefined) customer.name = update.name;
    if (update.email !== undefined) customer.email = update.email;
    if (update.birthday !== undefined) customer.birthday = update.birthday;
    return { status: 200, body: toCustomer(context.state, customer, context.clock.now()) };
  });
}
