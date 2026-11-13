import { Crown, Heart, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { cn, ThemeToggle } from "@femxo/ui";
import { CartLink } from "@/features/cart/components/CartLink";
import { HeaderSearch } from "@/features/search/components/HeaderSearch";
import { SearchField } from "@/features/search/components/SearchBox";
import { DeliveryChip } from "./DeliveryChip";
import { t } from "@/i18n";

// On the brand band: white text, a translucent hover, and a gold focus ring that reads on purple.
const linkClasses =
  "inline-flex h-11 cursor-pointer items-center gap-2 rounded-control px-3 font-display text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-gold";

/**
 * Site header on the brand band: logo, delivery area, search, Prime, account
 * and cart. On phones Prime and account move to the bottom bar and search
 * takes its own full-width row, the first thing under the thumb.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-30 bg-primary-deep text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:flex-nowrap md:gap-x-5">
        <Link href="/" aria-label={t("shell.header.home")} className="flex h-11 flex-none items-center gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-gold">
          {/* Shown 32px tall: ask for a small file, not the 390px original. */}
          <Image src="/images/femxo-mark-white.png" alt="" width={390} height={570} sizes="24px" priority className="h-8 w-auto" />
          <span aria-hidden="true" className="font-display text-xl font-bold tracking-tight text-white">
            Femxo
          </span>
        </Link>

        <DeliveryChip onBrand className="order-2 max-w-[9.5rem] md:order-none md:max-w-[12rem]" />

        {/* The form is a plain GET: search works before JavaScript loads, and suggestions arrive on top of it. */}
        <div className="order-last w-full md:order-none md:flex-1">
          <Suspense fallback={<SearchField form />}>
            <HeaderSearch />
          </Suspense>
        </div>

        <nav aria-label={t("shell.header.nav")} className="order-3 ml-auto flex flex-none items-center gap-1 md:order-none">
          <Link href="/prime" className={cn(linkClasses, "hidden md:inline-flex")}>
            <Crown size={18} className="text-gold" aria-hidden="true" />
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
          <ThemeToggle className={cn(linkClasses, "size-11 justify-center px-0")} />
          <CartLink className={linkClasses} />
        </nav>
      </div>
    </header>
  );
}
