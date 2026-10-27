import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ProductRail } from "@/features/catalog/components/ProductRail";
import { ProductBuyBox } from "@/features/product/components/ProductBuyBox";
import { ProductReviews } from "@/features/product/components/ProductReviews";
import { productJsonLd } from "@/features/product/json-ld";
import { serverProducts } from "@/lib/server-api";
import { t } from "@/i18n";

/** Everything the page shows, fetched together and cached; the shopper-specific bits are refreshed in the browser. */
async function getProductPage(slug: string) {
  "use cache";
  cacheLife("hours");
  const api = serverProducts();
  try {
    const [product, related, reviews] = await Promise.all([api.detail(slug), api.related(slug), api.reviews(slug)]);
    return { product, related, reviews };
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 404) return null;
    throw error;
  }
}

// Blocking on purpose, like the category page: an unknown slug must answer with a real 404.
export const instant = false;

export async function generateStaticParams() {
  const api = serverProducts();
  const slugs: string[] = [];
  let cursor: string | undefined;
  do {
    const { items, nextCursor } = await api.list({ limit: 100, cursor });
    slugs.push(...items.map((item) => item.slug));
    cursor = nextCursor ?? undefined;
  } while (cursor);
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await getProductPage(slug);
  if (!page) return {};
  const { product } = page;
  return {
    title: product.name,
    description: product.description,
    openGraph: { title: product.name, description: product.description, images: [product.image] },
  };
}

export default async function ProductPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const page = await getProductPage(slug);
  if (!page) notFound();
  const { product, related, reviews } = page;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(product)).replace(/</g, "\\u003c") }} />
      <section className="mx-auto w-full max-w-7xl px-4 py-5">
        <nav aria-label={t("nav.breadcrumb")} className="mb-4 text-sm text-ink-muted">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/" className="hover:text-primary hover:underline">
                {t("shell.nav.home")}
              </Link>
            </li>
            {product.breadcrumbs.map((crumb) => (
              <li key={crumb.id} className="flex items-center gap-1">
                <ChevronRight size={14} aria-hidden="true" />
                <Link href={`/c/${crumb.slug}`} className="hover:text-primary hover:underline">
                  {crumb.name}
                </Link>
              </li>
            ))}
            <li className="flex items-center gap-1" aria-current="page">
              <ChevronRight size={14} aria-hidden="true" />
              <span className="line-clamp-1 font-medium text-ink">{product.name}</span>
            </li>
          </ol>
        </nav>

        <ProductBuyBox product={product} />

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <section aria-labelledby="about-heading">
            <h2 id="about-heading" className="mb-2 text-base font-semibold">
              {t("product.about")}
            </h2>
            <p className="text-sm">{product.description}</p>
          </section>
          {product.specs.length > 0 ? (
            <section aria-labelledby="specs-heading">
              <h2 id="specs-heading" className="mb-2 text-base font-semibold">
                {t("product.details")}
              </h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                {product.specs.map((spec) => (
                  <div key={spec.label} className="contents">
                    <dt className="text-ink-muted">{spec.label}</dt>
                    <dd>{spec.value}</dd>
                  </div>
                ))}
                <div className="contents">
                  <dt className="text-ink-muted">{t("product.returns")}</dt>
                  <dd>{product.returnable ? t("product.returnable") : t("product.notReturnable")}</dd>
                </div>
              </dl>
            </section>
          ) : null}
        </div>
      </section>

      <ProductReviews slug={product.slug} initial={reviews} />
      <ProductRail title={t("product.related")} products={related} />
    </>
  );
}
