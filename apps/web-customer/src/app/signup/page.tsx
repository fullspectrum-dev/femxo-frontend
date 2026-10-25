import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Skeleton } from "@femxo/ui";
import { LoginFlow } from "@/features/auth/components/LoginFlow";

export const metadata: Metadata = { title: "Create your account", robots: { index: false } };

// Same steps as sign in: a new mobile number simply continues to the name step.
export default function SignupPage() {
  return (
    <section className="mx-auto w-full max-w-md px-4 py-8 md:py-14">
      <Card padded className="md:p-8">
        <Suspense fallback={<Skeleton className="h-72 w-full" />}>
          <LoginFlow mode="signup" />
        </Suspense>
      </Card>
    </section>
  );
}
