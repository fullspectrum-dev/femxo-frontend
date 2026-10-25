import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Skeleton } from "@femxo/ui";
import { LoginFlow } from "@/features/auth/components/LoginFlow";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function LoginPage() {
  return (
    <section className="mx-auto w-full max-w-md px-4 py-8 md:py-14">
      <Card padded className="md:p-8">
        {/* LoginFlow reads ?next= in the browser, so the page itself stays static. */}
        <Suspense fallback={<Skeleton className="h-72 w-full" />}>
          <LoginFlow />
        </Suspense>
      </Card>
    </section>
  );
}
