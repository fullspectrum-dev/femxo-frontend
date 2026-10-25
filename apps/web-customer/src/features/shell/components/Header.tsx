import { Crown, ShoppingCart, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { cn } from "@femxo/ui";
import { HeaderSearch } from "@/features/search/components/HeaderSearch";
import { SearchField } from "@/features/search/components/SearchBox";

const linkClasses =
  "inline-flex h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold text-ink hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus";

/**
 * Site header: logo, search, Prime, account and cart. On phones Prime and
 * account move to the bottom bar and search takes its own row.
 */
export function Header({ cartCount }: { cartCount: number }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:flex-nowrap md:gap-x-5">
        <Link href="/" aria-label="Femxo home" className="flex flex-none items-center gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-focus">
          <Image src="/images/femxo-mark.png" alt="" width={390} height={570} priority className="h-8 w-auto" />
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

        <nav aria-label="Account and cart" className="ml-auto flex flex-none items-center gap-1">
          <Link href="/prime" className={cn(linkClasses, "hidden md:inline-flex")}>
            <Crown size={18} className="text-gold-deep" aria-hidden="true" />
            Prime
          </Link>
          <Link href="/account" className={cn(linkClasses, "hidden md:inline-flex")}>
            <UserRound size={18} aria-hidden="true" />
            Account
          </Link>
          {/* The real count arrives with CartApi (G6). */}
          <Link href="/cart" aria-label={`Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`} className={cn(linkClasses, "relative")}>
            <ShoppingCart size={20} aria-hidden="true" />
            <span aria-hidden="true" className="hidden lg:inline">
              Cart
            </span>
            {cartCount > 0 ? (
              <span aria-hidden="true" className="absolute right-0.5 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-on-primary">
                {cartCount}
              </span>
            ) : null}
          </Link>
        </nav>
      </div>
    </header>
  );
}
