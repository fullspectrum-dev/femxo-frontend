"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Container } from "@/components/shared/Container";
import { Logo } from "@/components/shared/Logo";
import { CUSTOMER_SIGN_IN_URL, NAV_LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export function Header() {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const sectionHref = (href: string) => (pathname === "/" ? href : `/${href}`);
  const isSolid = isScrolled || isMobileOpen;

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileOpen]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 overflow-x-clip text-foreground transition-[background-color,box-shadow,border-color] duration-300",
        // Over the hero the header sits on the dark band, so it borrows the
        // dark palette; once solid it follows the page theme.
        isSolid
          ? "border-b border-border/60 bg-background/90 shadow-sm backdrop-blur-xl"
          : "ink border-b border-transparent bg-transparent"
      )}
    >
      <Container>
        <div className="flex h-16 items-center justify-between gap-3 lg:h-20">
          <Logo priority />

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex" aria-label="Main">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={sectionHref(link.href)}
                className={cn(
                  "whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition-colors xl:px-3.5",
                  link.highlight
                    ? "mx-1 inline-flex items-center gap-2 rounded-full border border-gold-400/60 bg-gold-400/10 font-semibold text-gold hover:bg-gold-400/20"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                )}
              >
                {link.highlight && <HighlightDot />}
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            {/* The storefront is its own site, so this is a plain link, not a client-side navigation. */}
            <a
              href={CUSTOMER_SIGN_IN_URL}
              className="hidden h-10 items-center rounded-xl px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70 lg:inline-flex"
            >
              Customer sign in
            </a>
            <Link
              href="/login"
              className="hidden h-10 items-center rounded-xl px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground xl:inline-flex"
            >
              Staff sign in
            </Link>
            <Link href={sectionHref("#contact")} className="btn-gold hidden h-10 px-4 lg:inline-flex">
              {/* One flex item, so the button's gap doesn't split the words. */}
              <span>
                Partner<span className="hidden xl:inline"> with us</span>
              </span>
            </Link>
            <button
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              className="flex size-10 items-center justify-center rounded-xl text-inherit transition-colors hover:bg-secondary/70 lg:hidden"
              aria-label={isMobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileOpen}
              aria-controls="mobile-navigation"
            >
              {isMobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </Container>

      <div
        id="mobile-navigation"
        aria-hidden={!isMobileOpen}
        inert={!isMobileOpen}
        className={cn(
          "grid overflow-hidden border-border/60 bg-background shadow-xl transition-[grid-template-rows,opacity] duration-300 ease-out lg:hidden",
          isMobileOpen
            ? "grid-rows-[1fr] border-t opacity-100"
            : "pointer-events-none grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <Container className="py-4">
            <nav className="flex flex-col gap-1" aria-label="Mobile">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={sectionHref(link.href)}
                  onClick={() => setIsMobileOpen(false)}
                  className={cn(
                    "rounded-lg px-4 py-3 text-base font-medium transition-colors",
                    link.highlight
                      ? "flex items-center gap-2.5 border border-gold-400/50 bg-gold-400/10 font-semibold text-gold"
                      : "text-foreground hover:bg-secondary/70"
                  )}
                >
                  {link.highlight && <HighlightDot />}
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/60 pt-4">
              <a href={CUSTOMER_SIGN_IN_URL} onClick={() => setIsMobileOpen(false)} className="btn-outline h-11">
                Customer sign in
              </a>
              <Link
                href="/login"
                onClick={() => setIsMobileOpen(false)}
                className="btn-outline h-11"
              >
                Staff sign in
              </Link>
              <Link
                href={sectionHref("#contact")}
                onClick={() => setIsMobileOpen(false)}
                className="btn-gold col-span-2 h-11"
              >
                Partner with us
              </Link>
            </div>
          </Container>
        </div>
      </div>
    </header>
  );
}

/** A small pulsing gold dot that marks the highlighted nav link. */
function HighlightDot() {
  return (
    <span aria-hidden="true" className="relative flex size-2">
      <span className="animate-ping-soft absolute inset-0 rounded-full bg-gold-400" />
      <span className="relative size-2 rounded-full bg-gold-400" />
    </span>
  );
}
