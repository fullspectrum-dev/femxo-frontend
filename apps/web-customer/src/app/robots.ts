import type { MetadataRoute } from "next";
import { ALLOW_INDEXING, SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!ALLOW_INDEXING) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/account", "/cart", "/checkout", "/orders", "/wishlist", "/login", "/signup", "/search", "/art/", "/offline"] },
    ...(SITE_URL ? { sitemap: `${SITE_URL}/sitemap.xml` } : {}),
  };
}
