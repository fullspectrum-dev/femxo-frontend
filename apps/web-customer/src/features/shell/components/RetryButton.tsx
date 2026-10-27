"use client";

import { Button } from "@femxo/ui";

/** Loads the current page again. */
export function RetryButton({ label }: { label: string }) {
  return <Button onClick={() => window.location.reload()}>{label}</Button>;
}
