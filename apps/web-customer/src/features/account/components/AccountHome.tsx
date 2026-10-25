"use client";

import { useRouter } from "next/navigation";
import { Button, Card } from "@femxo/ui";
import { RequireCustomer } from "@/features/auth/components/Guards";
import { useSession } from "@/features/auth/components/SessionProvider";

/** Placeholder until the account module (orders, addresses, support) arrives; it proves sign-in and sign-out end to end. */
export function AccountHome() {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-8">
      <RequireCustomer>
        <Welcome />
      </RequireCustomer>
    </section>
  );
}

function Welcome() {
  const { user, signOut } = useSession();
  const router = useRouter();
  return (
    <Card className="grid gap-4">
      <h1 className="font-display text-2xl font-bold">{user?.name ? `Hello, ${user.name}` : "Hello"}</h1>
      <p className="text-sm text-ink-muted">+91 {user?.mobile}{user?.isPrime ? " · Prime member" : ""}</p>
      <Button
        variant="secondary"
        className="w-max"
        onClick={async () => {
          // The session must be gone before we leave, or a quick reload could find it alive.
          await signOut();
          router.replace("/");
        }}
      >
        Sign out
      </Button>
    </Card>
  );
}
