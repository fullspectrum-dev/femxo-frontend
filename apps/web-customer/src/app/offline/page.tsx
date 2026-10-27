import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses, EmptyState } from "@femxo/ui";
import { RetryButton } from "@/features/shell/components/RetryButton";
import { t } from "@/i18n";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

/** What to show when a page can't be reached. Reachable by address, so it can be tested and styled like any other page. */
export default function Offline() {
  return (
    <EmptyState
      title={t("offline.title")}
      message={t("offline.message")}
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <RetryButton label={t("offline.retry")} />
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>
            {t("offline.home")}
          </Link>
        </div>
      }
    />
  );
}
