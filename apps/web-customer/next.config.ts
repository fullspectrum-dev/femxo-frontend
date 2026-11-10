import type { NextConfig } from "next";
import path from "node:path";

// Sent with every page; same set as apps/web.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  // One package of a pnpm workspace: trace from the repo root so the
  // standalone build includes @femxo/shared and @femxo/ui.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  // Catalog pages prerender with Cache Components (design §5).
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // AVIF first, WebP fallback (performance gate).
    formats: ["image/avif", "image/webp"],
  },
  // The browser asks for /store/v1/... on this site; Next forwards it to femxo-backend.
  async rewrites() {
    const origin = (process.env.FEMXO_API_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
    return [{ source: "/store/v1/:path*", destination: `${origin}/store/v1/:path*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
