import { cacheLife } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Crown, MapPin, ShieldCheck } from "lucide-react";
import { ErrorState, buttonClasses } from "@femxo/ui";
import { BannerRow } from "@/features/catalog/components/BannerRow";
import { CategoryTiles } from "@/features/catalog/components/CategoryTiles";
import { ProductRail } from "@/features/catalog/components/ProductRail";
import type { Category, ProductSummary } from "@femxo/shared/contracts";
import { STORE_BANNERS } from "@femxo/shared/api";
import { serverProducts, serverSearch } from "@/lib/server-api";
import { t } from "@/i18n";

/** The home content, or null when the catalog can't be reached (kept only briefly, so the next visit retries). */
async function getHome() {
  "use cache";
  try {
    const [home, categories] = await Promise.all([serverProducts().home(), serverProducts().categories()]);
    // Each department with aisles becomes a section: its aisles as tiles, then a row of its products.
    const departments = await Promise.all(
      categories
        .filter((c) => c.parentId === null)
        .map(async (department) => ({
          department,
          aisles: categories.filter((c) => c.parentId === department.id),
          products: (await serverSearch().search({ category: department.slug, sort: "discount" }).catch(() => null))?.items.slice(0, 12) ?? [],
        })),
    );
    cacheLife("minutes");
    return { ...home, departments: departments.filter((d) => d.aisles.length > 0 || d.products.length > 0) };
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
      <>
        <h1 className="sr-only">{t("home.title")}</h1>
        {/* The offers are static artwork, so they still show while the catalog is down. */}
        <BannerRow banners={STORE_BANNERS} />
        <div className="mx-auto w-full max-w-7xl px-4 py-10">
          <ErrorState title={t("home.unavailable.title")} message={t("home.unavailable.message")} />
        </div>
      </>
    );
  }
  return (
    <>
      <h1 className="sr-only">{t("home.title")}</h1>
      <HomeHero />
      <ValueStrip />
      <CategoryTiles categories={home.featuredCategories} />
      <ProductRail title={t("home.deals")} products={home.deals} seeAllHref="/search?sort=discount" />
      {home.departments.slice(0, 2).map((d) => (
        <DepartmentSection key={d.department.id} {...d} />
      ))}
      <BannerRow banners={home.banners} />
      {home.departments.slice(2).map((d) => (
        <DepartmentSection key={d.department.id} {...d} />
      ))}
      <ProductRail title={t("home.primePicks")} products={home.primePicks} seeAllHref="/search?prime=true" />
    </>
  );
}

/** The opening of the home page: two flat colour blocks, one job each (shop, or join Prime). */
function HomeHero() {
  return (
    <section aria-labelledby="hero-title" className="mx-auto grid w-full max-w-7xl gap-3 px-4 pt-4 md:grid-cols-[1.6fr_1fr]">
      <div className="flex flex-col justify-between gap-4 rounded-card bg-brand p-5 text-white md:gap-6 md:p-8">
        <div className="grid gap-2">
          <p className="hidden font-display text-sm font-medium text-white/80 md:block">Femxo store</p>
          <h2 id="hero-title" className="max-w-md font-display text-2xl font-bold leading-[1.1] tracking-tight md:text-5xl">
            Daily needs, delivered across Bihar.
          </h2>
          <p className="hidden max-w-md text-base text-white/85 md:block">Staples, spices, snacks and home care at honest prices.</p>
        </div>
        <Link href="/search?sort=discount" className={buttonClasses({ variant: "gold", size: "md", className: "w-max md:h-13 md:px-6 md:text-base" })}>
          Shop today&apos;s deals
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
      <Link
        href="/prime"
        className="group flex items-center gap-3 rounded-card bg-gold px-4 py-3 text-on-gold transition-[filter] duration-150 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:flex-col md:items-start md:justify-between md:gap-4 md:p-8"
      >
        <Crown size={28} aria-hidden="true" className="flex-none md:size-8" />
        <span className="grid flex-1 gap-1">
          <span className="font-display text-base font-bold leading-tight md:text-2xl">Prime prices on everything</span>
          <span className="text-xs md:text-sm">Member prices on your orders.</span>
        </span>
        <span className="flex flex-none items-center gap-1 font-display text-sm font-semibold">
          <span className="hidden md:inline">See plans</span>
          <ArrowRight size={16} aria-hidden="true" className="transition-transform duration-150 group-hover:translate-x-0.5" />
        </span>
      </Link>
    </section>
  );
}

const VALUES = [
  { icon: MapPin, title: "Across Bihar", text: "Set your pincode once" },
  { icon: ShieldCheck, title: "GST included", text: "The price you see is the price you pay" },
] as const;

/** Three plain facts about shopping here, each one true of the store today. */
function ValueStrip() {
  return (
    <ul className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-2 px-4 pt-3 md:gap-3">
      {VALUES.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex items-center gap-2 rounded-control border border-line bg-surface p-2 md:gap-3 md:rounded-card md:p-4">
          <span className="grid size-7 flex-none place-items-center rounded-lg bg-primary-soft text-primary md:size-9 md:rounded-control">
            <Icon size={16} aria-hidden="true" />
          </span>
          <span className="grid leading-tight">
            <span className="font-display text-[11px] font-semibold leading-tight md:text-sm">{title}</span>
            <span className="hidden text-xs text-ink-muted md:block">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One department on the home page, the way quick-commerce shoppers browse: its
 * aisles as a dense tile grid (four across on a phone), then a row of its best
 * deals with the add control on every card.
 */
function DepartmentSection({ department, aisles, products }: { department: Category; aisles: Category[]; products: ProductSummary[] }) {
  const headingId = `dept-${department.slug}`;
  return (
    <section aria-labelledby={headingId} className="mx-auto w-full max-w-7xl px-4 pt-6">
      <div className="mb-3 flex items-end justify-between gap-4">
        <h2 id={headingId} className="font-display text-xl font-bold tracking-tight md:text-2xl">
          {department.name}
        </h2>
        <Link
          href={`/c/${department.slug}`}
          className="inline-flex h-9 items-center whitespace-nowrap rounded-full bg-primary-soft px-4 font-display text-sm font-semibold text-primary transition-colors duration-150 hover:bg-primary hover:text-on-primary focus-visible:outline-2 focus-visible:outline-focus"
        >
          See all
        </Link>
      </div>
      {aisles.length > 0 ? (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 md:gap-3">
          {aisles.map((aisle) => (
            <li key={aisle.id}>
              <Link href={`/c/${aisle.slug}`} className="group grid gap-1.5 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                <span className="relative aspect-square overflow-hidden rounded-[14px] bg-surface-sunken ring-1 ring-line transition-transform duration-150 group-active:scale-95 motion-reduce:transition-none">
                  <Image src={aisle.image} alt="" fill sizes="(min-width: 1024px) 12vw, 22vw" className="object-cover" />
                </span>
                <span className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-ink md:text-xs">{aisle.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {products.length > 0 ? <ProductRail title={`Best of ${department.name}`} products={products} seeAllHref={`/c/${department.slug}?sort=discount`} compact /> : null}
    </section>
  );
}
