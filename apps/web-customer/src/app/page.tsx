import { cacheLife } from "next/cache";
import Link from "next/link";
import { Crown } from "lucide-react";
import { buttonClasses } from "@femxo/ui";
import { BannerRow } from "@/features/catalog/components/BannerRow";
import { CategoryTiles } from "@/features/catalog/components/CategoryTiles";
import { ProductRail } from "@/features/catalog/components/ProductRail";
import { serverProducts } from "@/lib/server-api";

async function getHome() {
  "use cache";
  cacheLife("hours");
  return serverProducts().home();
}

export default async function HomePage() {
  const home = await getHome();
  return (
    <>
      <h1 className="sr-only">Femxo store</h1>
      <BannerRow banners={home.banners} />
      <CategoryTiles categories={home.featuredCategories} />
      <ProductRail title="Today's deals" products={home.deals} seeAllHref="/search?sort=discount" />
      <PrimeStrip />
      <ProductRail title="Prime picks" products={home.primePicks} seeAllHref="/search?prime=true" />
    </>
  );
}

function PrimeStrip() {
  return (
    <section aria-labelledby="prime-strip" className="mx-auto w-full max-w-7xl px-4 py-4">
      <div className="flex flex-col gap-4 rounded-card bg-primary-deep p-5 text-on-primary md:flex-row md:items-center md:justify-between md:p-6">
        <div className="flex items-start gap-3">
          <Crown size={28} className="mt-0.5 flex-none text-gold" aria-hidden="true" />
          <div>
            <h2 id="prime-strip" className="font-display text-xl font-bold">
              Femxo Prime
            </h2>
            <p className="mt-1 text-sm opacity-90">Member prices on every product, free delivery on all orders, and coupons only for members. From ₹99 a month.</p>
          </div>
        </div>
        <Link href="/prime" className={buttonClasses({ variant: "gold", size: "lg", className: "flex-none" })}>
          See Prime plans
        </Link>
      </div>
    </section>
  );
}
