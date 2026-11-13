"use client";

import { Crown, House, LayoutGrid, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { cn, Sheet } from "@femxo/ui";
import type { NavCategory } from "../categories";
import { t } from "@/i18n";

const itemClasses =
  "group flex h-14 w-full cursor-pointer touch-manipulation flex-col items-center justify-center gap-0.5 rounded-control font-display text-[11px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

/** The icon sits in a pill that fills in for the current page (Material-style active indicator). */
function Pill({ active, children }: { active: boolean; children: ReactNode }) {
  return <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors duration-150", active ? "bg-primary-soft" : "group-hover:bg-surface-sunken")}>{children}</span>;
}

function BarLink({ href, icon, label, active }: { href: string; icon: ReactNode; label: string; active: boolean }) {
  return (
    // The bar sits in the prerendered shell, which doesn't know the visit's path; the first client render does. Only these two attributes can differ.
    <Link href={href} aria-current={active ? "page" : undefined} suppressHydrationWarning className={cn(itemClasses, active ? "text-primary" : "text-ink-muted")}>
      <Pill active={active}>{icon}</Pill>
      {label}
    </Link>
  );
}

/** Phone navigation: Home, Categories (a sheet, not a page), Prime, Account. */
export function BottomBar({ categories }: { categories: readonly NavCategory[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav aria-label={t("shell.nav.main")} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-4 px-2">
        <li>
          <BarLink href="/" label={t("shell.nav.home")} active={isActive("/")} icon={<House size={20} aria-hidden="true" />} />
        </li>
        <li>
          <button type="button" className={cn(itemClasses, "text-ink-muted")} aria-haspopup="dialog" onClick={() => setOpen(true)}>
            <Pill active={false}>
              <LayoutGrid size={20} aria-hidden="true" />
            </Pill>
            {t("shell.nav.categoriesButton")}
          </button>
        </li>
        <li>
          <BarLink href="/prime" label={t("shell.header.prime")} active={isActive("/prime")} icon={<Crown size={20} aria-hidden="true" />} />
        </li>
        <li>
          <BarLink href="/account" label={t("shell.header.account")} active={isActive("/account")} icon={<UserRound size={20} aria-hidden="true" />} />
        </li>
      </ul>

      <Sheet open={open} onClose={() => setOpen(false)} title={t("shell.nav.allCategories")}>
        <ul className="grid gap-1">
          {categories.map((category) => (
            <li key={category.slug}>
              <Link
                href={`/c/${category.slug}`}
                onClick={() => setOpen(false)}
                className="flex h-12 items-center rounded-control px-3 text-[15px] font-medium text-ink hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus"
              >
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </nav>
  );
}
