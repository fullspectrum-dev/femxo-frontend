import type { NextConfig } from "next";
import path from "node:path";

// Sent with every page; same set as apps/web (plus the CSP below).
const BASE_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const isProd = process.env.NODE_ENV === "production";
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

// The storefront has nothing to show without the backend, so a production server must be told where it is.
// Checked when the config loads (build and start), not at request time.
if (isProd && !process.env.FEMXO_API_ORIGIN) {
  throw new Error("FEMXO_API_ORIGIN is not set. Set it to the origin of femxo-backend (see .env.example).");
}

// Product pictures come from the backend's public storage (S3_PUBLIC_BASE_URL), which next/image must be told about.
const imageUrl = (() => {
  try {
    return process.env.FEMXO_IMAGE_ORIGIN ? new URL(process.env.FEMXO_IMAGE_ORIGIN) : null;
  } catch {
    return null;
  }
})();
if (isProd && !isBuildPhase && process.env.FEMXO_IMAGE_ORIGIN && !imageUrl) throw new Error("FEMXO_IMAGE_ORIGIN is not a valid URL.");

// The Content-Security-Policy is per request (it carries a nonce): see src/proxy.ts and src/lib/csp.ts.
const SECURITY_HEADERS = BASE_HEADERS;

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
    remotePatterns: imageUrl
      ? [{ protocol: imageUrl.protocol.replace(":", "") as "http" | "https", hostname: imageUrl.hostname, ...(imageUrl.port ? { port: imageUrl.port } : {}) }]
      : [],
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
