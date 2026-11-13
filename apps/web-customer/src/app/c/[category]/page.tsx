import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import type { Category, SearchResult } from "@femxo/shared/contracts";
import { cn } from "@femxo/ui";
import { ProductCard } from "@/features/catalog/components/ProductCard";
import { GRID_BESIDE_RAIL, ProductListing } from "@/features/catalog/components/ProductListing";
import { serverProducts, serverSearch } from "@/lib/server-api";
import { t } from "@/i18n";

/**
 * What the listing looks like before it hydrates: the first page, as plain HTML. The listing reads the address
 * bar, so the static page can only carry this fallback; with a skeleton here the product pictures (the largest
 * thing on screen) would not exist until the scripts had run.
 */
function FirstPage({ initial }: { initial: SearchResult }) {
  return (
    <ul className={GRID_BESIDE_RAIL}>
      {initial.items.map((product, index) => (
        <li key={product.id}>
          <ProductCard product={product} priority={index < 2} />
        </li>
      ))}
    </ul>
  );
}

/** Everything the page needs for one category: its place in the tree, and the first page of products. */
async function getCategoryPage(slug: string) {
  "use cache";
  cacheLife("hours");
  const categories = await serverProducts().categories().catch(() => []);
  const category = categories.find((entry) => entry.slug === slug);
  if (!category) return null;
  const parent = categories.find((entry) => entry.id === category.parentId) ?? null;
  // The department is the top-level category this page belongs to; its children fill the rail.
  const department = parent ?? category;
  const aisles = categories.filter((entry) => entry.parentId === department.id);
  const initial = await serverSearch().search({ category: slug });
  return { category, parent, department, aisles, initial };
}

// A blocking route on purpose. Reading `params` inside <Suspense> would let the shell stream first, but then an
// unknown slug could no longer answer with a real 404 status (dynamicParams isn't available with Cache
// Components). Every known category is still prerendered below, so visits and prefetches are static.
export const instant = false;

// Every category is built ahead of time; the first page is already in the HTML.
export async function generateStaticParams() {
  try {
    const categories = await serverProducts().categories();
    if (categories.length) return categories.map((category) => ({ category: category.slug }));
  } catch {
    // The catalog isn't reachable while building: pages are then built on the first visit.
  }
  return [{ category: "_" }];
}

export async function generateMetadata({ params }: PageProps<"/c/[category]">): Promise<Metadata> {
  const { category: slug } = await params;
  const page = await getCategoryPage(slug);
  return page ? { title: page.category.name, description: `Shop ${page.category.name} at Femxo, delivered across Bihar.` } : {};
}

export default async function CategoryPage({ params }: PageProps<"/c/[category]">) {
  const { category: slug } = await params;
  const page = await getCategoryPage(slug);
  if (!page) notFound();
  const { category, parent, department, aisles, initial } = page;
  const rail: Category[] = aisles.length > 0 ? [department, ...aisles] : [];

  return (
    <section className="mx-auto w-full max-w-7xl px-0 pb-5 md:px-4">
      <div className="px-4 pt-4 md:px-0">
        <nav aria-label={t("nav.breadcrumb")} className="mb-2 hidden text-sm text-ink-muted md:block">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/" className="hover:text-primary hover:underline">
                {t("shell.nav.home")}
              </Link>
            </li>
            {parent ? (
              <li className="flex items-center gap-1">
                <ChevronRight size={14} aria-hidden="true" />
                <Link href={`/c/${parent.slug}`} className="hover:text-primary hover:underline">
                  {parent.name}
                </Link>
              </li>
            ) : null}
            <li className="flex items-center gap-1" aria-current="page">
              <ChevronRight size={14} aria-hidden="true" />
              <span className="font-medium text-ink">{category.name}</span>
            </li>
          </ol>
        </nav>
        <h1 className="font-display text-xl font-bold tracking-tight md:text-3xl">{category.name}</h1>
      </div>

      <div className={cn("mt-3", rail.length > 0 && "grid grid-cols-[5.25rem_minmax(0,1fr)] md:grid-cols-[13rem_minmax(0,1fr)] md:gap-6")}>
        {rail.length > 0 ? <AisleRail rail={rail} current={category.slug} departmentSlug={department.slug} /> : null}
        <div className="min-w-0 px-2.5 md:px-0">
          {/* The listing reads the address bar (filters, sort), so it sits in Suspense and the page stays static. */}
          <Suspense fallback={<FirstPage initial={initial} />}>
            <ProductListing categorySlug={category.slug} initial={initial} firstPage={<FirstPage initial={initial} />} filtersInSheet />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

/**
 * The quick-commerce aisle rail: the department's subcategories as pictures down
 * the left edge, sticky under the header, so switching aisles is one tap and the
 * products never leave the screen. "All" is the department itself.
 */
function AisleRail({ rail, current, departmentSlug }: { rail: Category[]; current: string; departmentSlug: string }) {
  return (
    <nav aria-label="Aisles" className="sticky top-[7.75rem] h-[calc(100dvh-7.75rem-3.5rem)] self-start overflow-y-auto border-r border-line bg-surface [scrollbar-width:none] md:top-24 md:h-auto md:max-h-[calc(100dvh-7rem)] md:rounded-card md:border [&::-webkit-scrollbar]:hidden">
      <ul className="grid">
        {rail.map((entry) => {
          const active = entry.slug === current;
          const isAll = entry.slug === departmentSlug;
          return (
            <li key={entry.id}>
              <Link
                href={`/c/${entry.slug}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-1.5 px-1.5 py-3 text-center transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus md:flex-row md:gap-3 md:px-3 md:py-2.5 md:text-left",
                  active ? "bg-primary-soft" : "hover:bg-surface-sunken",
                )}
              >
                {/* The active aisle is marked by a bar as well as colour. */}
                <span aria-hidden="true" className={cn("absolute inset-y-2 right-0 w-1 rounded-l-full md:left-0 md:right-auto md:rounded-l-none md:rounded-r-full", active ? "bg-primary" : "bg-transparent")} />
                <span className={cn("relative size-12 flex-none overflow-hidden rounded-[12px] ring-1 md:size-10", active ? "ring-primary" : "ring-line")}>
                  <Image src={entry.image} alt="" fill sizes="48px" className="object-cover" />
                </span>
                <span className={cn("line-clamp-2 text-[11px] leading-tight md:text-sm", active ? "font-bold text-primary" : "font-medium text-ink")}>{isAll ? "All" : entry.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
