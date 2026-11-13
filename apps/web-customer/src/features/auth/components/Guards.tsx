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

  // The backend doesn't offer customer accounts yet: say so plainly, and send the shopper back to shopping.
  if (status === "coming-soon") {
    return (
      <EmptyState
        title="Accounts are coming soon"
        message="Sign-in, orders and your wishlist open shortly. You can browse the full catalogue right now."
        action={
          <Link href="/" className={buttonClasses()}>
            Keep shopping
          </Link>
        }
      />
    );
  }

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
