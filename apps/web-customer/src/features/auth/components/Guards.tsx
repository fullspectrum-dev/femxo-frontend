"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { buttonClasses, EmptyState, ErrorState, Skeleton } from "@femxo/ui";
import { useSession } from "./SessionProvider";

/**
 * Shows `children` to a signed-in customer. A signed-out visitor is sent to
 * sign in and returns here afterwards. Failing to check the session isn't
 * treated as signed out: the customer keeps their place and can retry.
 */
export function RequireCustomer({ children }: { children: ReactNode }) {
  const { status, user, leftOnPurpose, retry } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const loginHref = `/login?next=${encodeURIComponent(pathname)}`;

  useEffect(() => {
    // A customer who chose to sign out is on their way somewhere else; only sessions that ended on their own go to sign in.
    if (status === "signed-out" && !leftOnPurpose) router.replace(loginHref);
  }, [status, leftOnPurpose, loginHref, router]);

  if (status === "signed-in" && user) return <>{children}</>;

  if (status === "unavailable") {
    return <ErrorState title="We couldn't check your sign-in" message="Check your connection and try again." onRetry={retry} />;
  }

  if (status === "signed-out" && !leftOnPurpose) {
    return (
      <EmptyState
        title="Sign in to continue"
        message="Taking you to sign in…"
        action={
          <Link href={loginHref} className={buttonClasses()}>
            Sign in
          </Link>
        }
      />
    );
  }

  return (
    <div role="status" className="mx-auto grid max-w-xl gap-3 px-4 py-12">
      <span className="sr-only">Checking your sign-in…</span>
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/** Prime pages: members see them, everyone else is invited to join. */
export function RequirePrime({ children }: { children: ReactNode }) {
  return (
    <RequireCustomer>
      <PrimeOnly>{children}</PrimeOnly>
    </RequireCustomer>
  );
}

function PrimeOnly({ children }: { children: ReactNode }) {
  const { user } = useSession();
  if (user?.isPrime) return <>{children}</>;
  return (
    <EmptyState
      title="This is for Prime members"
      message="Join Prime for member prices, free delivery and coupons."
      action={
        <Link href="/prime" className={buttonClasses({ variant: "gold" })}>
          See Prime plans
        </Link>
      }
    />
  );
}
