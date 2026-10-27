"use client";

import { Crown, Heart, LifeBuoy, MapPin, Package, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button, Card } from "@femxo/ui";
import { RequireCustomer } from "@/features/auth/components/Guards";
import { useSession } from "@/features/auth/components/SessionProvider";

const SECTIONS: { href: string; label: string; hint: string; icon: ReactNode }[] = [
  { href: "/orders", label: "Orders", hint: "Track, cancel or return", icon: <Package size={22} aria-hidden="true" /> },
  { href: "/wishlist", label: "Wishlist", hint: "Things you've saved", icon: <Heart size={22} aria-hidden="true" /> },
  { href: "/prime", label: "Prime", hint: "Your plan, card and coupons", icon: <Crown size={22} aria-hidden="true" /> },
  { href: "/account/addresses", label: "Addresses", hint: "Where we deliver", icon: <MapPin size={22} aria-hidden="true" /> },
  { href: "/account/profile", label: "Profile", hint: "Name, email, birthday", icon: <UserRound size={22} aria-hidden="true" /> },
  { href: "/account/support", label: "Help & support", hint: "Ask us anything", icon: <LifeBuoy size={22} aria-hidden="true" /> },
];

/** The account home: who is signed in, and the way to every part of the account. */
export function AccountHome() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8">
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
    <div className="grid gap-5">
      <Card className="grid gap-1">
        <h1 className="font-display text-2xl font-bold">{user?.name ? `Hello, ${user.name}` : "Hello"}</h1>
        <p className="text-sm text-ink-muted">
          +91 {user?.mobile}
          {user?.isPrime ? " · Prime member" : ""}
        </p>
      </Card>

      <nav aria-label="Your account">
        <ul className="grid gap-3 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <Link href={section.href} className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-raised focus-visible:outline-2 focus-visible:outline-focus">
                <span className="grid size-11 flex-none place-items-center rounded-full bg-primary-soft text-primary">{section.icon}</span>
                <span>
                  <span className="block font-semibold">{section.label}</span>
                  <span className="block text-sm text-ink-muted">{section.hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

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
    </div>
  );
}
