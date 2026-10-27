"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { isApiError } from "@femxo/shared/api";
import { AddressInput } from "@femxo/shared/contracts";
import type { Address } from "@femxo/shared/contracts";
import { Button, TextField } from "@femxo/ui";

type Fields = "name" | "mobile" | "line1" | "line2" | "landmark" | "city" | "district" | "pincode";
type Errors = Partial<Record<Fields | "form", string>>;

const blank = { name: "", mobile: "", line1: "", line2: "", landmark: "", city: "", district: "", pincode: "", isDefault: false };

/** The address form for checkout and the address book: checked here first, and again by the server (a pincode we don't serve is refused there). */
export function AddressForm({
  initial,
  onSave,
  onCancel,
  submitLabel = "Save address",
  offerDefault = true,
}: {
  initial?: Address;
  onSave: (input: AddressInput) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  offerDefault?: boolean;
}) {
  const [values, setValues] = useState({ ...blank, ...(initial ? { ...initial, line2: initial.line2 ?? "", landmark: initial.landmark ?? "" } : {}) });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const set = (field: keyof typeof blank) => (value: string) => setValues((current) => ({ ...current, [field]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = AddressInput.safeParse({
      ...values,
      mobile: values.mobile.trim(),
      pincode: values.pincode.trim(),
      line2: values.line2.trim() || undefined,
      landmark: values.landmark.trim() || undefined,
      state: "Bihar",
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[(issue.path[0] as Fields) ?? "form"] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await onSave(parsed.data);
    } catch (error) {
      if (isApiError(error, "NOT_SERVICEABLE")) setErrors({ pincode: error.message });
      else if (isApiError(error, "VALIDATION_FAILED") && error.details?.fields) setErrors(error.details.fields as Errors);
      else setErrors({ form: isApiError(error) ? error.message : "We couldn't save that. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label={initial ? "Edit address" : "Add an address"} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Full name" autoComplete="name" value={values.name} error={errors.name} onChange={(e) => set("name")(e.target.value)} />
        <TextField label="Mobile number" inputMode="numeric" autoComplete="tel-national" maxLength={10} leading="+91" value={values.mobile} error={errors.mobile} onChange={(e) => set("mobile")(e.target.value.replace(/\D/g, ""))} />
      </div>
      <TextField label="House no., building, street" autoComplete="address-line1" value={values.line1} error={errors.line1} onChange={(e) => set("line1")(e.target.value)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Area, locality" optional autoComplete="address-line2" value={values.line2} error={errors.line2} onChange={(e) => set("line2")(e.target.value)} />
        <TextField label="Landmark" optional value={values.landmark} error={errors.landmark} onChange={(e) => set("landmark")(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="City" autoComplete="address-level2" value={values.city} error={errors.city} onChange={(e) => set("city")(e.target.value)} />
        <TextField label="District" value={values.district} error={errors.district} onChange={(e) => set("district")(e.target.value)} />
        <TextField label="Pincode" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={values.pincode} error={errors.pincode} onChange={(e) => set("pincode")(e.target.value.replace(/\D/g, ""))} />
      </div>
      <p className="text-xs text-ink-muted">We deliver within Bihar.</p>
      {offerDefault && !initial?.isDefault ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={values.isDefault} onChange={(e) => setValues((current) => ({ ...current, isDefault: e.target.checked }))} className="size-4 accent-primary" />
          Make this my default address
        </label>
      ) : null}
      {errors.form ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {errors.form}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" busy={busy}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
