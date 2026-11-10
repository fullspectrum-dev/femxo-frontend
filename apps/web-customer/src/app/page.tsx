import { cacheLife } from "next/cache";
import Link from "next/link";
import { Crown } from "lucide-react";
import { ErrorState, buttonClasses } from "@femxo/ui";
import { BannerRow } from "@/features/catalog/components/BannerRow";
import { CategoryTiles } from "@/features/catalog/components/CategoryTiles";
import { ProductRail } from "@/features/catalog/components/ProductRail";
import { serverProducts } from "@/lib/server-api";
import { t } from "@/i18n";

/** The home content, or null when the catalog can't be reached (kept only briefly, so the next visit retries). */
async function getHome() {
  "use cache";
  try {
    const home = await serverProducts().home();
    cacheLife("minutes");
    return home;
  } catch {
    cacheLife("seconds");
    return null;
  }
}

// Blocking on purpose: when the catalog can't be reached the answer is short-lived, so it is read per visit instead of at build time.
export const instant = false;

export default async function HomePage() {
  const home = await getHome();
  if (!home) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-10">
        <h1 className="sr-only">{t("home.title")}</h1>
        <ErrorState title={t("home.unavailable.title")} message={t("home.unavailable.message")} />
      </div>
    );
  }
  return (
    <>
      <h1 className="sr-only">{t("home.title")}</h1>
      <BannerRow banners={home.banners} />
      <CategoryTiles categories={home.featuredCategories} />
      <ProductRail title={t("home.deals")} products={home.deals} seeAllHref="/search?sort=discount" />
      <PrimeStrip />
      <ProductRail title={t("home.primePicks")} products={home.primePicks} seeAllHref="/search?prime=true" />
    </>
  );
}

function PrimeStrip() {
  return (
    <section aria-labelledby="prime-strip" className="mx-auto w-full max-w-7xl px-4 py-4">
      <div className="flex flex-col gap-4 rounded-card bg-primary-deep p-5 text-white md:flex-row md:items-center md:justify-between md:p-6">
        <div className="flex items-start gap-3">
          <Crown size={28} className="mt-0.5 flex-none text-gold" aria-hidden="true" />
          <div>
            <h2 id="prime-strip" className="font-display text-xl font-bold">
              {t("home.primeStrip.title")}
            </h2>
            <p className="mt-1 text-sm opacity-90">{t("home.primeStrip.text")}</p>
          </div>
        </div>
        <Link href="/prime" className={buttonClasses({ variant: "gold", size: "lg", className: "flex-none" })}>
          {t("home.primeStrip.cta")}
        </Link>
      </div>
    </section>
  );
}
