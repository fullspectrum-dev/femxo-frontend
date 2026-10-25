import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@femxo/ui";
import { ProductListing } from "@/features/catalog/components/ProductListing";
import { serverProducts, serverSearch } from "@/lib/server-api";

/** Everything the page needs for one category: its place in the tree, and the first page of products. */
async function getCategoryPage(slug: string) {
  "use cache";
  cacheLife("hours");
  const categories = await serverProducts().categories();
  const category = categories.find((entry) => entry.slug === slug);
  if (!category) return null;
  const parent = categories.find((entry) => entry.id === category.parentId) ?? null;
  const children = categories.filter((entry) => entry.parentId === category.id);
  const initial = await serverSearch().search({ category: slug });
  return { category, parent, children, initial };
}

// A blocking route on purpose. Reading `params` inside <Suspense> would let the shell stream first, but then an
// unknown slug could no longer answer with a real 404 status (dynamicParams isn't available with Cache
// Components). Every known category is still prerendered below, so visits and prefetches are static.
export const instant = false;

// Every category is built ahead of time; the first page is already in the HTML.
export async function generateStaticParams() {
  const categories = await serverProducts().categories();
  return categories.map((category) => ({ category: category.slug }));
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
  const { category, parent, children, initial } = page;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-5">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:text-primary hover:underline">
              Home
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

      <h1 className="font-display text-2xl font-bold md:text-3xl">{category.name}</h1>

      {children.length > 0 ? (
        <ul aria-label={`${category.name} subcategories`} className="my-4 flex flex-wrap gap-2">
          {children.map((child) => (
            <li key={child.id}>
              <Link
                href={`/c/${child.slug}`}
                className="inline-flex h-9 items-center rounded-full border border-line-input bg-surface px-4 text-sm font-medium text-ink hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-focus"
              >
                {child.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4">
        {/* The listing reads the address bar (filters, sort), so it sits in Suspense and the page stays static. */}
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <ProductListing categorySlug={category.slug} initial={initial} />
        </Suspense>
      </div>
    </section>
  );
}
