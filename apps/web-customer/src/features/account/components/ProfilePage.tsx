"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { isApiError } from "@femxo/shared/api";
import type { AuthApi } from "@femxo/shared/api";
import { ProfileUpdate } from "@femxo/shared/contracts";
import { Button, TextField, useToast } from "@femxo/ui";
import { RequireCustomer } from "@/features/auth/components/Guards";
import { useSession } from "@/features/auth/components/SessionProvider";
import { getAuthApi } from "@/lib/api";

type Errors = Partial<Record<"name" | "email" | "birthday" | "form", string>>;

function ProfileForm({ auth }: { auth?: AuthApi }) {
  const { user, setUser } = useSession();
  const toast = useToast();
  const apiRef = useRef(auth);
  const [values, setValues] = useState({ name: user?.name ?? "", email: user?.email ?? "", birthday: user?.birthday ?? "" });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = ProfileUpdate.safeParse({ name: values.name, email: values.email.trim() || null, birthday: values.birthday || null });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[(issue.path[0] as keyof Errors) ?? "form"] ??= issue.path[0] === "email" ? "Enter a valid email address" : issue.path[0] === "name" ? "Enter your name (at least 2 letters)" : issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      setUser(await (apiRef.current ??= getAuthApi()).updateMe(parsed.data));
      toast("Profile saved");
    } catch (error) {
      if (isApiError(error, "VALIDATION_FAILED") && error.details?.fields) setErrors(error.details.fields as Errors);
      else setErrors({ form: isApiError(error) ? error.message : "We couldn't save that. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Profile" className="grid gap-4 rounded-card border border-line bg-surface p-4 shadow-card md:p-5">
      <TextField label="Full name" autoComplete="name" value={values.name} error={errors.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
      <TextField label="Mobile number" value={`+91 ${user?.mobile ?? ""}`} readOnly hint="Your mobile number is how you sign in, so it can't be changed here." />
      <TextField label="Email" optional type="email" autoComplete="email" value={values.email} error={errors.email} onChange={(e) => setValues({ ...values, email: e.target.value })} />
      <TextField label="Birthday" optional type="date" max="2026-12-31" value={values.birthday} error={errors.birthday} onChange={(e) => setValues({ ...values, birthday: e.target.value })} hint="Prime members get a treat on their birthday." />
      {errors.form ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {errors.form}
        </p>
      ) : null}
      <Button type="submit" busy={busy} className="w-max">
        Save changes
      </Button>
    </form>
  );
}

/** Name, email and birthday. The mobile number is the sign-in, so it is shown but not edited. */
export function ProfilePage({ auth }: { auth?: AuthApi }) {
  return (
    <section className="mx-auto w-full max-w-xl px-4 py-6">
      <p className="mb-2 text-sm">
        <Link href="/account" className="font-semibold text-primary hover:underline">
          ← Account
        </Link>
      </p>
      <h1 className="mb-4 font-display text-2xl font-bold">Your profile</h1>
      <RequireCustomer>
        <ProfileForm auth={auth} />
      </RequireCustomer>
    </section>
  );
}
