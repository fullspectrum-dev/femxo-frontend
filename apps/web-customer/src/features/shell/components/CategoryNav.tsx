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
      <ul className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((category) => {
          const href = `/c/${category.slug}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={category.slug} className="flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center whitespace-nowrap rounded-full px-4 font-display text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  active ? "bg-primary text-on-primary" : "bg-surface-sunken text-ink hover:bg-primary-soft hover:text-primary"
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
