"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { idempotencyKey } from "@femxo/shared";
import { isApiError, userMessage } from "@femxo/shared/api";
import type { AddressApi } from "@femxo/shared/api";
import { AddressInput } from "@femxo/shared/contracts";
import type { Address } from "@femxo/shared/contracts";
import { Button, TextField } from "@femxo/ui";
import { LocationPicker } from "./LocationPicker";

type Fields = "label" | "name" | "phone" | "line1" | "line2" | "landmark" | "pincode" | "locationId";
type Errors = Partial<Record<Fields | "form", string>>;

const blank = { label: "", name: "", phone: "", line1: "", line2: "", landmark: "", pincode: "", locationId: "", isDefault: false };

/** Which field a server refusal belongs to. */
export function fieldOfError(error: unknown): Errors {
  if (!isApiError(error)) return { form: "We couldn't save that. Please try again." };
  switch (error.code) {
    case "ADDRESS_NOT_SERVICEABLE":
    case "PINCODE_UNKNOWN":
      return { pincode: userMessage(error) };
    case "PINCODE_LOCATION_MISMATCH":
    case "TERRITORY_NOT_FOUND":
      return { locationId: userMessage(error) };
    default:
      return { form: userMessage(error, "We couldn't save that. Please try again.") };
  }
}

/**
 * The address form for checkout and the address book. Checked here first, and again by the server: the pincode must exist, belong to
 * the chosen place, and be somewhere we deliver. One Idempotency-Key per submission, reused if the same form is sent again.
 */
export function AddressForm({
  initial,
  onSave,
  onCancel,
  submitLabel = "Save address",
  offerDefault = true,
  api,
}: {
  initial?: Address;
  onSave: (input: AddressInput, idempotencyKey: string) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  offerDefault?: boolean;
  api?: AddressApi;
}) {
  const [values, setValues] = useState({
    ...blank,
    ...(initial ? { ...initial, label: initial.label ?? "", line2: initial.line2 ?? "", landmark: initial.landmark ?? "" } : {}),
  });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const attempt = useRef<string | null>(null);

  const set = (field: keyof typeof blank, value: string | boolean) => setValues((current) => ({ ...current, [field]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = AddressInput.safeParse({
      label: values.label.trim() || null,
      name: values.name,
      phone: values.phone.trim(),
      line1: values.line1,
      line2: values.line2.trim() || null,
      landmark: values.landmark.trim() || null,
      pincode: values.pincode.trim(),
      locationId: values.locationId,
      isDefault: values.isDefault,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[(issue.path[0] as Fields) ?? "form"] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    // A failed or repeated send of this same form carries the same key; a saved one starts fresh.
    attempt.current ??= idempotencyKey();
    try {
      await onSave(parsed.data, attempt.current);
      attempt.current = null;
    } catch (error) {
      if (isApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429) attempt.current = null;
      setErrors(fieldOfError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label={initial ? "Edit address" : "Add an address"} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Full name" autoComplete="name" value={values.name} error={errors.name} onChange={(e) => set("name", e.target.value)} />
        <TextField label="Mobile number" inputMode="numeric" autoComplete="tel-national" maxLength={10} leading="+91" value={values.phone} error={errors.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} />
      </div>
      <TextField label="House no., building, street" autoComplete="address-line1" value={values.line1} error={errors.line1} onChange={(e) => set("line1", e.target.value)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Area, locality" optional autoComplete="address-line2" value={values.line2} error={errors.line2} onChange={(e) => set("line2", e.target.value)} />
        <TextField label="Landmark" optional value={values.landmark} error={errors.landmark} onChange={(e) => set("landmark", e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Pincode"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          value={values.pincode}
          error={errors.pincode}
          onChange={(e) => {
            const pincode = e.target.value.replace(/\D/g, "");
            setValues((current) => ({ ...current, pincode, locationId: pincode === current.pincode ? current.locationId : "" }));
          }}
        />
        <TextField label="Save as" optional hint="Home, Work…" value={values.label} error={errors.label} onChange={(e) => set("label", e.target.value)} />
      </div>
      <LocationPicker api={api} pincode={values.pincode} value={values.locationId} error={errors.locationId} onChange={(id) => set("locationId", id)} onPincode={(pin) => set("pincode", pin)} />
      <p className="text-xs text-ink-muted">We deliver within Bihar, wherever our dealers cover.</p>
      {offerDefault && !initial?.isDefault ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={values.isDefault} onChange={(e) => set("isDefault", e.target.checked)} className="size-4 accent-primary" />
          Make this my default address
        </label>
      ) : null}
      <div role="alert">{errors.form ? <p className="text-sm font-medium text-danger">{errors.form}</p> : null}</div>
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
