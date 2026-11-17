"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { isApiError, userMessage } from "@femxo/shared/api";
import type { AuthApi } from "@femxo/shared/api";
import { MobileNumber } from "@femxo/shared/contracts";
import { Button, TextField } from "@femxo/ui";
import { getAuthApi } from "@/lib/api";
import { t } from "@/i18n";
import { safeNextPath } from "../next-path";
import { useOtpSettings } from "../use-otp-settings";
import { OtpInput } from "./OtpInput";
import { useSession } from "./SessionProvider";

type Step = "mobile" | "code" | "name";
type Busy = "request" | "verify" | "signup" | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign in or sign up with a mobile OTP (there is no password). A first-time number continues to a name
 * step, which creates the account and signs in. Afterwards the customer goes to `?next=` (a path on this
 * site only).
 */
export function LoginFlow({ auth, mode = "login" }: { auth?: AuthApi; mode?: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const nextSuffix = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
  const { status, signIn } = useSession();
  const apiRef = useRef(auth);
  const api = () => (apiRef.current ??= getAuthApi());
  // The code length and the resend wait are the backend's (GET /auth/config), never a guess of ours.
  const otp = useOtpSettings(auth);
  const OTP_LENGTH = otp.length;
  const RESEND_SECONDS = otp.resendSeconds;

  const [step, setStep] = useState<Step>("mobile");
  const [busy, setBusy] = useState<Busy>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [mobile, setMobile] = useState("");
  const [mobileError, setMobileError] = useState<string | undefined>();
  const [code, setCode] = useState("");
  const [codeKey, setCodeKey] = useState(0);
  const [locked, setLocked] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  // Proof the phone was verified, held until the new customer has given a name.
  const [signupToken, setSignupToken] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [signupEmailError, setSignupEmailError] = useState<string | undefined>();

  // Already signed in, or just signed in here: on to where they were going.
  useEffect(() => {
    if (status === "signed-in") router.replace(next);
  }, [status, next, router]);

  // The resend countdown.
  useEffect(() => {
    if (step !== "code" || resendAt === 0) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) clearInterval(timer);
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [step, resendAt]);

  function startCountdown(seconds: number) {
    setSecondsLeft(seconds);
    setResendAt(Date.now() + seconds * 1000);
  }

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    const parsed = MobileNumber.safeParse(mobile);
    if (!parsed.success) {
      setMobileError(parsed.error.issues[0]!.message);
      return;
    }
    setMobileError(undefined);
    setFormError(null);
    if (otp.loaded && !otp.enabled) {
      setFormError("Mobile sign-in isn't switched on yet. Please try again later.");
      return;
    }
    setBusy("request");
    try {
      await api().requestOtp(mobile);
      setStep("code");
      setCode("");
      setCodeKey((key) => key + 1);
      setLocked(false);
      startCountdown(RESEND_SECONDS);
    } catch (error) {
      // Asked again inside the cooldown: the code already sent is still good, so carry on to entering it.
      if (isApiError(error, "OTP_RESEND_TOO_SOON")) {
        setStep("code");
        startCountdown(error.retryAfterSeconds ?? RESEND_SECONDS);
      }
      setFormError(userMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (code.length !== OTP_LENGTH) {
      setFormError(`Enter the ${OTP_LENGTH}-digit code.`);
      return;
    }
    setFormError(null);
    setBusy("verify");
    try {
      const outcome = await api().verifyOtp(mobile, code);
      if (outcome.status === "signup_required") {
        setSignupToken(outcome.signupToken);
        setStep("name");
      } else signIn(outcome.session);
    } catch (error) {
      if (isApiError(error, "OTP_TOO_MANY_ATTEMPTS") || isApiError(error, "TOO_MANY_ATTEMPTS")) setLocked(true);
      setFormError(userMessage(error));
      setCode("");
      setCodeKey((key) => key + 1);
    } finally {
      setBusy(null);
    }
  }

  function backToMobileStep() {
    setSignupToken(null);
    setStep("mobile");
    setCode("");
    setName("");
    setSignupEmail("");
    setNameError(undefined);
    setSignupEmailError(undefined);
  }

  async function finishSignup(event: FormEvent) {
    event.preventDefault();
    if (!signupToken) {
      backToMobileStep();
      return;
    }
    const trimmed = name.trim();
    const nameProblem = trimmed.length < 2 ? "Please enter your name." : undefined;
    const emailProblem = signupEmail.trim() && !EMAIL.test(signupEmail.trim()) ? "Enter a valid email address." : undefined;
    setNameError(nameProblem);
    setSignupEmailError(emailProblem);
    if (nameProblem || emailProblem) return;
    setFormError(null);
    setBusy("signup");
    try {
      signIn(await api().signup({ signupToken, name: trimmed, email: signupEmail.trim() || null }));
    } catch (error) {
      // The proof is one-use: after these two the only way on is a fresh code (or signing in).
      if (isApiError(error, "SIGNUP_TOKEN_INVALID") || isApiError(error, "PHONE_ALREADY_REGISTERED")) backToMobileStep();
      setFormError(userMessage(error));
    } finally {
      setBusy(null);
    }
  }

  const errorBanner = formError ? (
    <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
      {formError}
    </p>
  ) : null;

  const panel =
    step === "name" ? (
      <form onSubmit={finishSignup} noValidate className="grid gap-4">
        <h2 className="font-display text-lg font-semibold">What should we call you?</h2>
        <TextField label="Your name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} error={nameError} />
        <TextField
          label="Email"
          optional
          type="email"
          autoComplete="email"
          hint="For order receipts. You can add it later."
          value={signupEmail}
          onChange={(event) => setSignupEmail(event.target.value)}
          error={signupEmailError}
        />
        {errorBanner}
        <Button type="submit" size="lg" block busy={busy === "signup"}>
          Create account
        </Button>
      </form>
    ) : step === "code" ? (
      <form onSubmit={verify} noValidate className="grid gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Enter the code</h2>
          <p className="mt-1 text-sm text-ink-muted">
            We sent a {OTP_LENGTH}-digit code to +91 {mobile}.{" "}
            <button
              type="button"
              className="font-semibold text-primary underline-offset-2 hover:underline"
              onClick={() => {
                setStep("mobile");
                setFormError(null);
              }}
            >
              Change mobile number
            </button>
          </p>
        </div>
        <OtpInput key={codeKey} length={OTP_LENGTH} onChange={setCode} disabled={locked} />
        {errorBanner}
        <Button type="submit" size="lg" block busy={busy === "verify"} disabled={locked}>
          Verify and continue
        </Button>
        <p className="text-center text-sm text-ink-muted" aria-live="polite">
          {secondsLeft > 0 ? (
            `Resend code in ${secondsLeft}s`
          ) : (
            <button type="button" disabled={busy === "request"} className="font-semibold text-primary hover:underline" onClick={() => void requestCode()}>
              Resend code
            </button>
          )}
        </p>
      </form>
    ) : (
      <form onSubmit={requestCode} noValidate className="grid gap-4">
        <TextField
          label="Mobile number"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={10}
          leading="+91"
          placeholder="10-digit mobile number"
          value={mobile}
          onChange={(event) => setMobile(event.target.value.replace(/\D/g, ""))}
          error={mobileError}
        />
        {errorBanner}
        <Button type="submit" size="lg" block busy={busy === "request"}>
          Get OTP
        </Button>
        <p className="text-center text-xs text-ink-muted">We&rsquo;ll text you a one-time code. No password needed.</p>
      </form>
    );

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="font-display text-2xl font-bold">{mode === "signup" ? "Create your Femxo account" : "Sign in to Femxo"}</h1>
        <p className="mt-1 text-sm text-ink-muted">{mode === "signup" ? "Shop staples and daily needs across Bihar." : "Welcome back. Pick up where you left off."}</p>
      </header>
      {panel}
      <p className="text-center text-sm text-ink-muted">
        {mode === "signup" ? (
          <>
            {t("auth.haveAccount")}{" "}
            <Link href={`/login${nextSuffix}`} className="font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus">
              {t("auth.signInLink")}
            </Link>
          </>
        ) : (
          <>
            {t("auth.newHere")}{" "}
            <Link href={`/signup${nextSuffix}`} className="font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus">
              {t("auth.createAccountLink")}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
