"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { apiMode } from "@femxo/shared";
import { isApiError } from "@femxo/shared/api";
import type { AuthApi } from "@femxo/shared/api";
import { MobileNumber } from "@femxo/shared/contracts";
import type { OtpChallenge, Session } from "@femxo/shared/contracts";
import { Button, Tabs, TextField } from "@femxo/ui";
import { getAuthApi } from "@/lib/api";
import { t } from "@/i18n";
import { setAccessToken } from "@/lib/token";
import { safeNextPath } from "../next-path";
import { OtpInput } from "./OtpInput";
import { useSession } from "./SessionProvider";

type Tab = "otp" | "email";
type Step = "mobile" | "code" | "name";
type Busy = "request" | "verify" | "signup" | "login" | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function waitText(seconds: number) {
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/** Turns an API failure into the sentence the customer reads. */
function describe(error: unknown) {
  if (isApiError(error, "RATE_LIMITED")) return `Too many attempts. Try again in ${waitText(error.retryAfterSeconds ?? 60)}.`;
  if (isApiError(error, "OTP_INVALID")) {
    const left = Number(error.details.attemptsLeft);
    return Number.isFinite(left) ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code isn't right.";
  }
  if (isApiError(error, "OTP_EXPIRED")) return "That code has expired. Get a new one.";
  if (isApiError(error, "UNAUTHENTICATED") || isApiError(error, "VALIDATION_FAILED")) return error.message;
  return "Something went wrong. Please try again.";
}

/**
 * Sign in or sign up: mobile OTP (the default) or email and password.
 * A first-time number continues to a name step, which creates the account;
 * the customer then signs in with it (back on the sign-in screen, number filled in).
 * After signing in the customer goes to `?next=` (a path on this site only).
 */
export function LoginFlow({ auth, mode = "login" }: { auth?: AuthApi; mode?: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  // Sent here right after making an account: say so, and save them typing the number again.
  const justCreated = params.get("created") === "1";
  const createdMobile = justCreated && /^\d{10}$/.test(params.get("mobile") ?? "") ? params.get("mobile")! : "";
  const nextSuffix = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
  const { status, signIn } = useSession();
  const apiRef = useRef(auth);
  const api = () => (apiRef.current ??= getAuthApi());

  const [tab, setTab] = useState<Tab>("otp");
  const [step, setStep] = useState<Step>("mobile");
  const [busy, setBusy] = useState<Busy>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // What the customer typed wins; until they type, the number from the address (the page can stay mounted while the address changes).
  const [typedMobile, setMobile] = useState<string | null>(null);
  const mobile = typedMobile ?? createdMobile;
  const [mobileError, setMobileError] = useState<string | undefined>();
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState("");
  const [codeKey, setCodeKey] = useState(0);
  const [locked, setLocked] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  // A new customer's session waits here until they've given a name.
  const [pending, setPending] = useState<Session | null>(null);
  const [name, setName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [signupEmailError, setSignupEmailError] = useState<string | undefined>();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();

  // Already signed in, or just signed in here: on to where they were going.
  useEffect(() => {
    if (status === "signed-in" && !pending) router.replace(next);
  }, [status, pending, next, router]);

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

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    const parsed = MobileNumber.safeParse(mobile);
    if (!parsed.success) {
      setMobileError(parsed.error.issues[0]!.message);
      return;
    }
    setMobileError(undefined);
    setFormError(null);
    setBusy("request");
    try {
      const sent = await api().requestOtp(mobile);
      setChallenge(sent);
      setStep("code");
      setCode("");
      setCodeKey((key) => key + 1);
      setLocked(false);
      setSecondsLeft(sent.resendAfterSeconds);
      setResendAt(Date.now() + sent.resendAfterSeconds * 1000);
    } catch (error) {
      setFormError(describe(error));
    } finally {
      setBusy(null);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6) {
      setFormError("Enter the 6-digit code.");
      return;
    }
    setFormError(null);
    setBusy("verify");
    try {
      const session = await api().verifyOtp(challenge!.requestId, code);
      if (session.isNewUser) {
        // The name call needs this token, but the customer isn't signed in until it's done.
        setAccessToken(session.accessToken);
        setPending(session);
        setStep("name");
      } else signIn(session);
    } catch (error) {
      if (isApiError(error, "RATE_LIMITED")) setLocked(true);
      setFormError(describe(error));
      setCode("");
      setCodeKey((key) => key + 1);
    } finally {
      setBusy(null);
    }
  }

  async function finishSignup(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    const nameProblem = trimmed.length < 2 ? "Please enter your name." : undefined;
    const emailProblem = signupEmail.trim() && !EMAIL.test(signupEmail.trim()) ? "Enter a valid email address." : undefined;
    setNameError(nameProblem);
    setSignupEmailError(emailProblem);
    if (nameProblem || emailProblem) return;
    setFormError(null);
    setBusy("signup");
    try {
      await api().completeSignup({ name: trimmed, email: signupEmail.trim() || null });
      // The account exists now. The customer signs in with it next, so this half-finished session ends here.
      try {
        await api().logout();
      } catch {
        // Nothing to end if it already lapsed.
      }
      setAccessToken(undefined);
      setPending(null);
      const created = new URLSearchParams({ created: "1", mobile });
      if (next !== "/") created.set("next", next);
      router.replace(`/login?${created.toString()}`);
    } catch (error) {
      setFormError(describe(error));
    } finally {
      setBusy(null);
    }
  }

  async function loginWithPassword(event: FormEvent) {
    event.preventDefault();
    const emailProblem = EMAIL.test(email.trim()) ? undefined : "Enter a valid email address.";
    const passwordProblem = password ? undefined : "Enter your password.";
    setEmailError(emailProblem);
    setPasswordError(passwordProblem);
    if (emailProblem || passwordProblem) return;
    setFormError(null);
    setBusy("login");
    try {
      signIn(await api().login(email.trim(), password));
    } catch (error) {
      setFormError(describe(error));
    } finally {
      setBusy(null);
    }
  }

  const errorBanner = formError ? (
    <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
      {formError}
    </p>
  ) : null;

  const otpPanel =
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
            We sent a 6-digit code to +91 {mobile}.{" "}
            <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => setStep("mobile")}>
              Change mobile number
            </button>
          </p>
        </div>
        <OtpInput key={codeKey} onChange={setCode} disabled={locked} />
        {apiMode === "mock" ? <p className="text-xs text-ink-muted">Demo: use code 123456</p> : null}
        {errorBanner}
        <Button type="submit" size="lg" block busy={busy === "verify"} disabled={locked}>
          Verify and continue
        </Button>
        <p className="text-center text-sm text-ink-muted">
          {secondsLeft > 0 ? (
            `Resend code in ${secondsLeft}s`
          ) : (
            <button type="button" disabled={locked || busy === "request"} className="font-semibold text-primary hover:underline" onClick={() => void requestCode()}>
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

  const emailPanel = (
    <form onSubmit={loginWithPassword} noValidate className="grid gap-4">
      <TextField label="Email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} error={emailError} />
      <div className="grid gap-1.5">
        <TextField
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={passwordError}
        />
        <button
          type="button"
          aria-pressed={showPassword}
          className="w-max text-xs font-semibold text-primary hover:underline"
          onClick={() => setShowPassword((shown) => !shown)}
        >
          {showPassword ? "Hide password" : "Show password"}
        </button>
      </div>
      {errorBanner}
      <Button type="submit" size="lg" block busy={busy === "login"}>
        Sign in
      </Button>
    </form>
  );

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="font-display text-2xl font-bold">{mode === "signup" ? "Create your Femxo account" : "Sign in to Femxo"}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {mode === "signup" ? "Shop staples and daily needs, with Prime prices when you join." : "Welcome back. Pick up where you left off."}
        </p>
      </header>
      {justCreated ? (
        <p role="status" className="rounded-control bg-success-soft px-3 py-2 text-sm font-medium text-success">
          {t("auth.accountReady")}
        </p>
      ) : null}
      <Tabs
        label="How to sign in"
        value={tab}
        onChange={(key) => {
          setTab(key);
          setFormError(null);
        }}
        items={[
          { key: "otp", label: "Mobile OTP", content: otpPanel },
          { key: "email", label: "Email", content: emailPanel },
        ]}
      />
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
