import { describe, expect, it, vi } from "vitest";
import { isPrimeMember } from "../contracts/people";
import type { ApiAdapter, ApiRequest, ApiResponse } from "./adapter";
import { createAuthApi } from "./auth-api";
import { userMessage } from "./error-messages";
import { ApiError } from "./errors";

const customer = {
  id: "c1",
  phone: "9876543210",
  name: "Asha",
  email: null,
  addressLine: null,
  pincode: null,
  locationId: null,
  prime: { status: "none", until: null },
  createdAt: "2026-11-01T10:00:00.000Z",
};

const reply = (res: ApiResponse) => {
  const send = vi.fn<(req: ApiRequest) => Promise<ApiResponse>>(async () => res);
  return { api: createAuthApi({ send } satisfies ApiAdapter), send };
};

describe("AuthApi against femxo-backend's /store/v1 shapes", () => {
  it("requests an OTP with `phone`", async () => {
    const { api, send } = reply({ status: 200, body: { expiresIn: 300 } });
    await expect(api.requestOtp("9876543210")).resolves.toEqual({ expiresIn: 300 });
    expect(send.mock.calls[0]![0]).toMatchObject({ method: "POST", path: "/store/v1/auth/otp/request", body: { phone: "9876543210" } });
  });

  it("verify: a known customer comes back as a session", async () => {
    const { api, send } = reply({ status: 200, body: { status: "signed_in", accessToken: "a", expiresIn: 900, customer } });
    const out = await api.verifyOtp("9876543210", "123456");
    expect(out).toEqual({ status: "signed_in", session: { accessToken: "a", expiresIn: 900, user: customer } });
    expect(send.mock.calls[0]![0].body).toEqual({ phone: "9876543210", code: "123456" });
  });

  it("verify: an unknown number gets a signup token", async () => {
    const { api } = reply({ status: 200, body: { status: "signup_required", signupToken: "tok", expiresIn: 300 } });
    await expect(api.verifyOtp("9876543210", "123456")).resolves.toEqual({ status: "signup_required", signupToken: "tok", expiresIn: 300 });
  });

  it("signup sends the token and name, omits an empty email, and signs in (201)", async () => {
    const { api, send } = reply({ status: 201, body: { accessToken: "a", expiresIn: 900, customer } });
    const session = await api.signup({ signupToken: "tok", name: "Asha", email: null });
    expect(session.user.name).toBe("Asha");
    expect(send.mock.calls[0]![0]).toMatchObject({ path: "/store/v1/auth/signup", body: { signupToken: "tok", name: "Asha" } });
    expect(send.mock.calls[0]![0].body).not.toHaveProperty("email");
  });

  it("refresh returns the token only; me() unwraps { customer } and can carry an explicit token", async () => {
    const r = reply({ status: 200, body: { accessToken: "b", expiresIn: 900 } });
    await expect(r.api.refresh()).resolves.toEqual({ accessToken: "b", expiresIn: 900 });
    const m = reply({ status: 200, body: { customer } });
    await expect(m.api.me("fresh")).resolves.toEqual(customer);
    expect(m.send.mock.calls[0]![0]).toMatchObject({ method: "GET", path: "/store/v1/me", accessToken: "fresh" });
  });

  it("logout accepts 204; setLocation PUTs /me/location", async () => {
    await expect(reply({ status: 204, body: null }).api.logout()).resolves.toBeUndefined();
    const { api, send } = reply({ status: 200, body: { customer } });
    await api.setLocation({ locationId: "village:abc123", pincode: "800001" });
    expect(send.mock.calls[0]![0]).toMatchObject({ method: "PUT", path: "/store/v1/me/location", body: { locationId: "village:abc123", pincode: "800001" } });
  });

  it("a backend error keeps its own code", async () => {
    const { api } = reply({ status: 400, body: { error: { code: "OTP_INVALID", message: "The code is wrong or has expired" } } });
    await expect(api.verifyOtp("9876543210", "000000")).rejects.toMatchObject({ code: "OTP_INVALID", status: 400 });
  });
});

describe("isPrimeMember", () => {
  it("is true only while active and not past `until`", () => {
    const now = new Date("2026-11-17T00:00:00Z");
    expect(isPrimeMember({ prime: { status: "active", until: "2026-12-01T00:00:00.000Z" } }, now)).toBe(true);
    expect(isPrimeMember({ prime: { status: "active", until: null } }, now)).toBe(true);
    expect(isPrimeMember({ prime: { status: "active", until: "2026-11-01T00:00:00.000Z" } }, now)).toBe(false);
    expect(isPrimeMember({ prime: { status: "expired", until: null } }, now)).toBe(false);
    expect(isPrimeMember(null)).toBe(false);
  });
});

describe("userMessage", () => {
  it("words known codes and uses Retry-After", () => {
    expect(userMessage(new ApiError(429, "OTP_RESEND_TOO_SOON", "x", {}, 20))).toContain("20 seconds");
    expect(userMessage(new ApiError(429, "TOO_MANY_ATTEMPTS", "x", {}, 600))).toContain("10 minutes");
    expect(userMessage(new ApiError(400, "OTP_INVALID", "x"))).toMatch(/isn't right/);
    expect(userMessage(new ApiError(403, "ACCOUNT_BLOCKED", "x"))).toMatch(/blocked/);
  });
  it("never shows a server or unknown-error message", () => {
    expect(userMessage(new ApiError(500, "INTERNAL_ERROR", "stack trace"))).toBe("Something went wrong. Please try again.");
    expect(userMessage(new Error("boom"))).toBe("Something went wrong. Please try again.");
    expect(userMessage(new ApiError(0, "INTERNAL", "Couldn't reach Femxo."))).toBe("Couldn't reach Femxo.");
  });
  it("keeps a 4xx message we have no wording for", () => {
    expect(userMessage(new ApiError(409, "SOMETHING_NEW", "Already done"))).toBe("Already done");
  });
});
