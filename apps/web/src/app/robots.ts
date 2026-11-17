import type { MetadataRoute } from "next";
import { SITE } from "@/lib/constants";

// The website is public; staff screens and sign-in pages are not for search engines.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/panel", "/login", "/account", "/change-password", "/forgot-password"] }],
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
