import { Crown, Heart, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { cn, ThemeToggle } from "@femxo/ui";
import { CartLink } from "@/features/cart/components/CartLink";
import { HeaderSearch } from "@/features/search/components/HeaderSearch";
import { SearchField } from "@/features/search/components/SearchBox";
import { t } from "@/i18n";

const linkClasses =
  "inline-flex h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold text-ink hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus";

/**
 * Site header: logo, search, Prime, account and cart. On phones Prime and
 * account move to the bottom bar and search takes its own row.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:flex-nowrap md:gap-x-5">
        <Link href="/" aria-label={t("shell.header.home")} className="flex flex-none items-center gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-focus">
          {/* Shown 32px tall: ask for a small file, not the 390px original. */}
          <Image src="/images/femxo-mark.png" alt="" width={390} height={570} sizes="24px" priority className="h-8 w-auto" />
          <span aria-hidden="true" className="font-display text-xl font-bold text-primary">
            Femxo
          </span>
        </Link>

        {/* The form is a plain GET: search works before JavaScript loads, and suggestions arrive on top of it. */}
        <div className="order-last w-full md:order-none md:flex-1">
          <Suspense fallback={<SearchField form />}>
            <HeaderSearch />
          </Suspense>
        </div>

        <nav aria-label={t("shell.header.nav")} className="ml-auto flex flex-none items-center gap-1">
          <Link href="/prime" className={cn(linkClasses, "hidden md:inline-flex")}>
            <Crown size={18} className="text-gold-deep" aria-hidden="true" />
            {t("shell.header.prime")}
          </Link>
          <Link href="/account" className={cn(linkClasses, "hidden md:inline-flex")}>
            <UserRound size={18} aria-hidden="true" />
            {t("shell.header.account")}
          </Link>
          <Link href="/wishlist" className={cn(linkClasses, "hidden lg:inline-flex")}>
            <Heart size={18} aria-hidden="true" />
            {t("shell.header.wishlist")}
          </Link>
          <ThemeToggle />
          <CartLink className={linkClasses} />
        </nav>
      </div>
    </header>
  );
}
