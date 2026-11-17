"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { AddressApi } from "@femxo/shared/api";
import { userMessage } from "@femxo/shared/api";
import type { Location, Serviceability } from "@femxo/shared/contracts";
import { Badge, cn, TextField } from "@femxo/ui";
import { getAddressApi } from "@/lib/api";
import { locationOptions, pincodeVerdict } from "../location-options";

interface Found {
  /** What was asked: a pincode or a name. */
  key: string;
  locations: Location[];
  serviceability: Serviceability | null;
  error?: string;
}

/**
 * Chooses the village or area an address belongs to. The pincode (once it is six digits) lists the places that carry it, with
 * whether we deliver there; "search by name" finds a place by its name (two letters or more). The chosen id goes to the form.
 */
export function LocationPicker({
  pincode,
  value,
  onChange,
  onPincode,
  error,
  api,
}: {
  pincode: string;
  value: string;
  onChange: (locationId: string) => void;
  /** A place found by name knows its pincode: hand it to the form. */
  onPincode: (pincode: string) => void;
  error?: string;
  api?: AddressApi;
}) {
  const apiRef = useRef(api);
  const [byPincode, setByPincode] = useState<Found | null>(null);
  const [query, setQuery] = useState("");
  const [byName, setByName] = useState<Found | null>(null);
  const groupId = useId();
  const complete = /^\d{6}$/.test(pincode);

  useEffect(() => {
    if (!/^\d{6}$/.test(pincode)) return;
    const controller = new AbortController();
    const client = (apiRef.current ??= getAddressApi());
    Promise.all([client.locations({ pincode }, controller.signal), client.serviceability(pincode, controller.signal)])
      .then(([list, serviceability]) => setByPincode({ key: pincode, locations: list.items, serviceability }))
      .catch(
        (e) => !controller.signal.aborted && setByPincode({ key: pincode, locations: [], serviceability: null, error: userMessage(e, "We couldn't check that pincode. Please try again.") })
      );
    return () => controller.abort();
  }, [pincode]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      (apiRef.current ??= getAddressApi())
        .locations({ q }, controller.signal)
        .then((list) => setByName({ key: q, locations: list.items, serviceability: null }))
        .catch((e) => !controller.signal.aborted && setByName({ key: q, locations: [], serviceability: null, error: userMessage(e, "We couldn't search right now. Please try again.") }));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const pincodeResult = complete && byPincode && byPincode.key === pincode ? byPincode : null;
  const nameResult = byName && byName.key === query.trim() ? byName : null;
  const options = pincodeResult ? locationOptions(pincodeResult.locations, pincodeResult.serviceability) : [];
  const verdict = pincodeResult?.serviceability ? pincodeVerdict(pincodeResult.serviceability) : null;
  const nameOptions = nameResult ? locationOptions(nameResult.locations, null) : [];

  // Only one place carries this pincode and we deliver there: no need to ask.
  const onlyServed = options.length === 1 && options[0]!.serviceable !== false ? options[0]! : null;
  useEffect(() => {
    if (onlyServed && value !== onlyServed.id) onChange(onlyServed.id);
  }, [onlyServed, value, onChange]);

  return (
    <fieldset className="grid gap-2" aria-describedby={error ? `${groupId}-error` : undefined}>
      <legend className="text-sm font-semibold text-ink">Village or area</legend>

      <div role="status" aria-live="polite" className="text-sm">
        {pincodeResult?.error ? <p className="text-danger">{pincodeResult.error}</p> : null}
        {verdict ? <p className={verdict.tone === "ok" ? "text-success" : "text-danger"}>{verdict.text}</p> : null}
        {!complete ? <p className="text-ink-muted">Enter your 6-digit pincode above and the places it covers will show here.</p> : null}
      </div>

      {options.length > 0 ? (
        <ul className="grid gap-2" data-testid="location-options">
          {options.map((option) => (
            <li key={option.id}>
              <label
                className={cn(
                  "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-control border px-3 py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                  value === option.id ? "border-primary bg-primary-soft" : "border-line-input bg-surface",
                  option.serviceable === false && "cursor-not-allowed opacity-70"
                )}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name={`${groupId}-place`}
                    className="size-4 accent-primary"
                    checked={value === option.id}
                    disabled={option.serviceable === false}
                    onChange={() => onChange(option.id)}
                  />
                  <span className="grid text-sm">
                    <span className="font-semibold">{option.name}</span>
                    {option.where ? <span className="text-xs text-ink-muted">{option.where}</span> : null}
                  </span>
                </span>
                {option.serviceable === false ? <Badge tone="danger">Not served yet</Badge> : null}
              </label>
            </li>
          ))}
        </ul>
      ) : null}

      <details className="rounded-control border border-line bg-surface-sunken px-3 py-2" open={complete && pincodeResult !== null && options.length === 0 && !pincodeResult.error}>
        <summary className="cursor-pointer text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-focus">My place isn&apos;t listed: search by name</summary>
        <div className="mt-3 grid gap-2">
          <TextField label="Village, town or area name" leading={<Search size={16} aria-hidden="true" />} value={query} onChange={(e) => setQuery(e.target.value)} hint="Type at least 2 letters." />
          <div role="status" aria-live="polite" className="text-sm">
            {nameResult?.error ? <p className="text-danger">{nameResult.error}</p> : null}
            {nameResult && !nameResult.error && nameOptions.length === 0 ? <p className="text-ink-muted">Nothing found for &ldquo;{nameResult.key}&rdquo;.</p> : null}
          </div>
          {nameOptions.length > 0 ? (
            <ul className="grid gap-2">
              {nameOptions.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.id);
                      if (option.pincode) onPincode(option.pincode);
                    }}
                    aria-pressed={value === option.id}
                    className={cn(
                      "grid min-h-11 w-full cursor-pointer rounded-control border px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                      value === option.id ? "border-primary bg-primary-soft" : "border-line-input bg-surface"
                    )}
                  >
                    <span className="font-semibold">
                      {option.name}
                      {option.pincode ? <span className="ml-2 font-normal text-ink-muted">{option.pincode}</span> : null}
                    </span>
                    {option.where ? <span className="text-xs text-ink-muted">{option.where}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>

      {error ? (
        <p id={`${groupId}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
