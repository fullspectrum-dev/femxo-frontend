import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@femxo/ui";
import { SupportThreadPage } from "@/features/account/components/SupportThreadPage";

export const metadata: Metadata = { title: "Support request", robots: { index: false } };

// The request id is read in the browser (requests are per customer), so the page itself is a static shell.
export default function Request() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-6 h-64 w-full max-w-2xl" />}>
      <SupportThreadPage />
    </Suspense>
  );
}
