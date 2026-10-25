"use client";

import { useEffect, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { cn } from "@femxo/ui";

/**
 * The 6-digit code as separate boxes: digits only, moves on as you type,
 * Backspace steps back, and a pasted code fills every box. Remount it (change
 * its `key`) to clear it. Each box is named ("Digit 3 of 6"); the first asks
 * the browser for the code from the SMS.
 */
export function OtpInput({
  length = 6,
  onChange,
  disabled = false,
  className,
}: {
  length?: number;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array<string>(length).fill(""));
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    boxes.current[0]?.focus();
  }, []);

  const update = (next: string[]) => {
    setDigits(next);
    onChange(next.join(""));
  };
  const focus = (index: number) => boxes.current[Math.max(0, Math.min(length - 1, index))]?.focus();

  function onType(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) return; // not a digit: keep what was there
    update(digits.map((existing, position) => (position === index ? digit : existing)));
    focus(index + 1);
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      if (digits[index]) update(digits.map((existing, position) => (position === index ? "" : existing)));
      else focus(index - 1);
      event.preventDefault();
    } else if (event.key === "ArrowLeft") focus(index - 1);
    else if (event.key === "ArrowRight") focus(index + 1);
  }

  function onPaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    // A whole code replaces everything; a partial one fills from the box it landed in.
    const start = pasted.length === length ? 0 : index;
    const next = [...digits];
    [...pasted].slice(0, length - start).forEach((digit, offset) => {
      next[start + offset] = digit;
    });
    update(next);
    focus(start + pasted.length);
  }

  return (
    <div role="group" aria-label={`${length}-digit code`} className={cn("flex gap-2", className)}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            boxes.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1} of ${length}`}
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(event) => onType(index, event.target.value)}
          onKeyDown={(event) => onKeyDown(index, event)}
          onPaste={(event) => onPaste(index, event)}
          onFocus={(event) => event.target.select()}
          className="h-12 w-11 rounded-control border border-line-input bg-surface text-center text-xl font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-60 sm:w-12"
        />
      ))}
    </div>
  );
}
