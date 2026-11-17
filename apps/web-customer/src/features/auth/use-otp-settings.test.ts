import { describe, expect, it } from "vitest";
import { DEFAULT_OTP, otpSettingsFrom } from "./use-otp-settings";

describe("otpSettingsFrom", () => {
  it("takes the length and cooldown from the backend", () => {
    expect(otpSettingsFrom({ otp: { enabled: true, length: 4, resendCooldownSeconds: 45, validitySeconds: 300, maxAttempts: 5 } })).toEqual({
      length: 4,
      resendSeconds: 45,
      enabled: true,
      loaded: true,
    });
  });
  it("keeps usable defaults while OTP isn't configured and says it is off", () => {
    expect(otpSettingsFrom({ otp: { enabled: false, length: null, resendCooldownSeconds: null, validitySeconds: null, maxAttempts: null } })).toEqual({
      length: DEFAULT_OTP.length,
      resendSeconds: DEFAULT_OTP.resendSeconds,
      enabled: false,
      loaded: true,
    });
  });
});
