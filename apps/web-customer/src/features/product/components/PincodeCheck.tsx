"use client";

import { Truck } from "lucide-react";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { ProductsApi } from "@femxo/shared/api";
import { isApiError } from "@femxo/shared/api";
import type { Serviceability } from "@femxo/shared/contracts";
import { Pincode } from "@femxo/shared/contracts";
import { Button, TextField } from "@femxo/ui";
import { getProductsApi } from "@/lib/api";

type Outcome = { kind: "result"; value: Serviceability } | { kind: "error"; message: string };

const days = ({ min, max }: { min: number; max: number }) => (min === max ? `${min} day${min === 1 ? "" : "s"}` : `${min}–${max} days`);

/** "Can you deliver to me?": a pincode in, a plain answer out. An unserved pincode is an answer, not an error. */
export function PincodeCheck({ products }: { products?: ProductsApi }) {
  const apiRef = useRef(products);
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
      const api = (apiRef.current ??= getProductsApi());
      setOutcome({ kind: "result", value: await api.serviceability(parsed.data) });
    } catch (error) {
      setOutcome({ kind: "error", message: isApiError(error) ? error.message : "We couldn't check that right now. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const result = outcome?.kind === "result" ? outcome.value : null;

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
      <div role="status" aria-live="polite" className="text-sm">
        {result?.serviceable ? (
          <p className="text-success">
            Delivers to {result.pincode}
            {result.district ? `, ${result.district}` : ""} in {days(result.etaDays!)}.{" "}
            <span className="text-ink-muted">{result.codAvailable ? "Cash on delivery available." : "Cash on delivery isn't available here."}</span>
          </p>
        ) : null}
        {result && !result.serviceable ? <p className="text-danger">Sorry, we don&apos;t deliver to {result.pincode} yet.</p> : null}
        {outcome?.kind === "error" ? <p className="text-danger">{outcome.message}</p> : null}
      </div>
    </section>
  );
}
