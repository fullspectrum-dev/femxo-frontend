"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@femxo/ui";
import type { NavCategory } from "../categories";
import { t } from "@/i18n";

/** Category strip under the header; scrolls sideways inside itself on small screens. */
export function CategoryNav({ categories }: { categories: readonly NavCategory[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={t("shell.nav.categories")} className="border-b border-line bg-surface">
      <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 [scrollbar-width:none]">
        {categories.map((category) => {
          const href = `/c/${category.slug}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={category.slug} className="flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                  active ? "border-primary font-semibold text-primary" : "border-transparent text-ink hover:text-primary"
                )}
              >
                {category.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
