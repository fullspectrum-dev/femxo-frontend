"use client";

import { Truck } from "lucide-react";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { userMessage } from "@femxo/shared/api";
import type { AddressApi } from "@femxo/shared/api";
import type { Serviceability } from "@femxo/shared/contracts";
import { Pincode } from "@femxo/shared/contracts";
import { Button, TextField } from "@femxo/ui";
import { pincodeVerdict } from "@/features/addresses/location-options";
import { getAddressApi } from "@/lib/api";

type Outcome = { kind: "result"; value: Serviceability } | { kind: "error"; message: string };

/** "Can you deliver to me?": a pincode in, a plain answer out. An unserved or unknown pincode is an answer, not an error. */
export function PincodeCheck({ api }: { api?: AddressApi }) {
  const apiRef = useRef(api);
  const [value, setValue] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function check(event: FormEvent) {
    event.preventDefault();
    const parsed = Pincode.safeParse(value.trim());
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]!.message);
      setOutcome(null);
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    try {
      setOutcome({ kind: "result", value: await (apiRef.current ??= getAddressApi()).serviceability(parsed.data) });
    } catch (error) {
      setOutcome({ kind: "error", message: userMessage(error, "We couldn't check that right now. Please try again.") });
    } finally {
      setBusy(false);
    }
  }

  const result = outcome?.kind === "result" ? outcome.value : null;
  const verdict = result ? pincodeVerdict(result) : null;
  const served = result?.locations.filter((l) => l.serviceable).map((l) => l.name) ?? [];

  return (
    <section aria-labelledby="pincode-heading" className="grid gap-3 rounded-card border border-line bg-surface p-4">
      <h2 id="pincode-heading" className="flex items-center gap-2 text-base font-semibold">
        <Truck size={18} aria-hidden="true" />
        Check delivery
      </h2>
      <form onSubmit={check} noValidate className="flex items-start gap-2">
        <TextField
          label="Pincode"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          value={value}
          error={fieldError}
          onChange={(event) => setValue(event.target.value.replace(/\D/g, ""))}
          className="flex-1"
        />
        <Button type="submit" variant="secondary" busy={busy} className="mt-[26px]">
          Check
        </Button>
      </form>
      <div role="status" aria-live="polite" className="text-sm" data-testid="pincode-result">
        {verdict ? (
          <p className={verdict.tone === "ok" ? "text-success" : "text-danger"}>
            {verdict.text}
            {verdict.tone === "ok" && served.length ? <span className="text-ink-muted"> Covers {served.join(", ")}.</span> : null}
          </p>
        ) : null}
        {outcome?.kind === "error" ? <p className="text-danger">{outcome.message}</p> : null}
      </div>
    </section>
  );
}
