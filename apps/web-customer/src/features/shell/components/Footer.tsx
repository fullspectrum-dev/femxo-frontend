import { Crown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { t } from "@/i18n";

const linkClasses = "rounded-sm text-sm text-ink-muted transition-colors duration-150 hover:text-primary focus-visible:outline-2 focus-visible:outline-focus";

const GROUPS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Shop",
    links: [
      { href: "/search?sort=discount", label: "Today's deals" },
      { href: "/search?prime=true", label: "Prime picks" },
      { href: "/search", label: "All products" },
      { href: "/wishlist", label: "Wishlist" },
    ],
  },
  {
    title: "Your account",
    links: [
      { href: "/account", label: "Account" },
      { href: "/orders", label: "Orders" },
      { href: "/account/addresses", label: "Addresses" },
      { href: "/account/support", label: t("shell.footer.help") },
    ],
  },
];

/** Site footer: brand, shop and account links, and the Prime offer. Static, so it never waits on the catalog. */
export function Footer() {
  return (
    <footer className="mt-10 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 gap-y-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr_1.4fr] md:gap-8">
        <div className="col-span-2 grid content-start gap-3 md:col-span-1">
          <Link href="/" className="flex w-max items-center gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-focus">
            <Image src="/images/femxo-mark.png" alt="" width={390} height={570} sizes="20px" className="h-7 w-auto" />
            <span className="font-display text-lg font-bold text-primary">Femxo</span>
          </Link>
          <p className="max-w-xs text-sm text-ink-muted">Staples and daily needs, delivered across Bihar. Pay by UPI, card, net banking or cash on delivery.</p>
        </div>

        {GROUPS.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">{group.title}</h2>
            <ul className="grid gap-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClasses}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <Link
          href="/prime"
          className="group col-span-2 grid content-start gap-2 rounded-card bg-primary-deep p-5 md:col-span-1 text-white transition-colors duration-150 hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <span className="flex items-center gap-2 font-display text-base font-semibold">
            <Crown size={18} className="text-gold" aria-hidden="true" />
            {t("shell.footer.prime")}
          </span>
          <span className="text-sm text-white/85">Member prices, free delivery and members-only coupons.</span>
          <span className="mt-1 font-display text-sm font-semibold text-gold">See plans →</span>
        </Link>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-ink-muted">
          <p>{t("shell.footer.copyright")}</p>
          <a href="https://femxo.in" className={linkClasses}>
            {t("shell.footer.about")}
          </a>
        </div>
      </div>
    </footer>
  );
}
