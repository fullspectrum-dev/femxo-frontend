"use client";

import { MapPin } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { Pincode } from "@femxo/shared/contracts";
import { Button, cn, Sheet, TextField } from "@femxo/ui";

const KEY = "femxo.pincode";

const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return memory;
  }
}

/** Fallback when storage is blocked: the choice lasts for this visit. */
let memory = "";

function write(value: string) {
  memory = value;
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* private mode: kept in memory only */
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  const onStorage = (event: StorageEvent) => event.key === KEY && notify();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * "Deliver to 800001": the shopper's delivery area, always one tap away. Kept on
 * this device only; per-pincode availability and delivery estimates appear once the
 * backend exposes them, never invented here.
 */
export function DeliveryChip({ className, onBrand = false }: { className?: string; /** On the purple header band. */ onBrand?: boolean }) {
  // Empty on the server and the first paint, then the stored value: no hydration mismatch.
  const pincode = useSyncExternalStore(subscribe, read, () => "");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();

  function save(event: FormEvent) {
    event.preventDefault();
    const parsed = Pincode.safeParse(draft.trim());
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    write(parsed.data);
    setError(undefined);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(pincode);
          setError(undefined);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className={cn("flex h-11 min-w-0 cursor-pointer touch-manipulation items-center gap-2 rounded-control px-2 text-left transition-colors duration-150 focus-visible:outline-2", onBrand ? "hover:bg-white/10 focus-visible:outline-gold" : "hover:bg-surface-sunken focus-visible:outline-focus", className)}
      >
        <MapPin size={20} className={cn("flex-none", onBrand ? "text-gold" : "text-primary")} aria-hidden="true" />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className={cn("text-[11px] font-semibold", onBrand ? "text-white/80" : "text-ink-muted")}>Deliver to</span>
          <span className={cn("truncate font-display text-sm font-bold", onBrand ? "text-white" : "text-ink")}>{pincode || "Set pincode"}</span>
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Choose delivery area" description="We deliver within Bihar. Enter your pincode.">
        <form onSubmit={save} noValidate className="flex items-start gap-2">
          <TextField label="Pincode" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={draft} error={error} onChange={(e) => setDraft(e.target.value)} className="flex-1" />
          <Button type="submit" size="lg" className="mt-6">
            Save
          </Button>
        </form>
      </Sheet>
    </>
  );
}
