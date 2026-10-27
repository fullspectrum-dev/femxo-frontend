import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Container } from "@/components/shared/Container";
import { Logo } from "@/components/shared/Logo";
import { CONTACT, CUSTOMER_SIGN_IN_URL, NAV_LINKS } from "@/lib/constants";

// Only the year needs request time; keeping it in its own Suspense boundary
// lets the rest of the footer stay in the prerendered shell.
async function CurrentYear() {
  await connection();
  return new Date().getFullYear();
}

export function Footer() {
  return (
    <footer className="ink border-t border-border bg-ink">
      <Container className="py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Distribution, ERP and AI in one connected system for Bihar&rsquo;s local businesses.
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2.5 sm:grid-cols-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={`/${link.href}`}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <Link href="/careers" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Careers
            </Link>
            {CUSTOMER_SIGN_IN_URL ? (
              <a href={CUSTOMER_SIGN_IN_URL} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                Customer sign in
              </a>
            ) : null}
            <Link href="/login" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Staff sign in
            </Link>
            <a href={CONTACT.phoneHref} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {CONTACT.phone}
            </a>
          </nav>
        </div>

        <div className="mt-10 flex flex-col justify-between gap-3 border-t border-border pt-6 text-[11px] uppercase tracking-[0.14em] text-muted-foreground sm:flex-row">
          <p>
            ©{" "}
            <Suspense fallback={null}>
              <CurrentYear />
            </Suspense>{" "}
            Femxo Consultancy Services Private Limited
          </p>
          <p>Made in India · Startup India</p>
        </div>
      </Container>
    </footer>
  );
}
