import type { MetadataRoute } from "next";
import { serverProducts } from "@/lib/server-api";
import { ALLOW_INDEXING, SITE_URL } from "@/lib/site";

/** Home, every category and the first page of products. Empty while indexing is off or the site address is unknown. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!ALLOW_INDEXING || !SITE_URL) return [];
  const api = serverProducts();
  const [categories, products] = await Promise.all([api.categories().catch(() => []), api.list({ limit: 100 }).catch(() => ({ items: [] }))]);
  return [
    { url: SITE_URL },
    ...categories.map((c) => ({ url: `${SITE_URL}/c/${c.slug}` })),
    ...products.items.map((p) => ({ url: `${SITE_URL}/p/${p.slug}` })),
  ];
}
