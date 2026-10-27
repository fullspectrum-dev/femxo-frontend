"use client";

import { useEffect } from "react";
import { ErrorState } from "@femxo/ui";
import { t } from "@/i18n";

/**
 * What a visitor sees when a page breaks while it runs. The header and the
 * rest of the shell stay; only the page is replaced, with a way to retry.
 */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Nothing personal is logged: Next's reference for the server log, or the message.
    console.error("Page error", error.digest ?? error.message);
  }, [error]);

  return <ErrorState title={t("error.title")} message={t("error.message")} onRetry={reset} retryLabel={t("error.retry")} className="py-16" />;
}
