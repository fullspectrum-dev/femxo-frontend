"use client";

import { useEffect, useRef, useState } from "react";
import type { AuthApi } from "@femxo/shared/api";
import type { AuthConfig } from "@femxo/shared/contracts";
import { getAuthApi } from "@/lib/api";

export interface OtpSettings {
  /** Digits in a code. */
  length: number;
  resendSeconds: number;
  /** False while the backend has no SMS provider set up (sign-in then answers 503 OTP_NOT_CONFIGURED). */
  enabled: boolean;
  /** The backend has answered; before that (or if it can't be reached) the usual values are used. */
  loaded: boolean;
}

/** Shown until GET /auth/config answers, or when it can't: the backend's usual values. The real ones always win. */
export const DEFAULT_OTP: OtpSettings = { length: 6, resendSeconds: 30, enabled: true, loaded: false };

/** The settings the sign-in form uses, from the backend's answer. Null numbers (OTP not configured) keep the defaults. */
export function otpSettingsFrom(config: AuthConfig): OtpSettings {
  const { otp } = config;
  return {
    length: otp.length && otp.length > 0 ? otp.length : DEFAULT_OTP.length,
    resendSeconds: otp.resendCooldownSeconds && otp.resendCooldownSeconds > 0 ? otp.resendCooldownSeconds : DEFAULT_OTP.resendSeconds,
    enabled: otp.enabled,
    loaded: true,
  };
}

let cached: Promise<OtpSettings> | undefined;

/** OTP length and timings from GET /store/v1/auth/config (public, cacheable), read once per page load. */
export function useOtpSettings(auth?: AuthApi): OtpSettings {
  const [settings, setSettings] = useState<OtpSettings>(DEFAULT_OTP);
  const apiRef = useRef(auth);

  useEffect(() => {
    let cancelled = false;
    // An injected client (tests) is never cached across components.
    const load = auth ? (auth.config().then(otpSettingsFrom)) : (cached ??= (apiRef.current ??= getAuthApi()).config().then(otpSettingsFrom));
    load.then((next) => !cancelled && setSettings(next)).catch(() => {
      if (!auth) cached = undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [auth]);

  return settings;
}
