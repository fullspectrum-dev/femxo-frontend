import type { NextConfig } from "next";
import path from "node:path";

// Dummy data (demo mode) is the default until the backend is connected; see
// src/features/auth/services/demo-mode.ts. Must match the check there.
const backendConnected = process.env.NEXT_PUBLIC_AUTH_DEMO_MODE === "false";

// Where femxo-backend runs. The browser calls /auth, /access and /territories
// on this site and Next forwards them, so the API's refresh cookie
// (Path=/auth, SameSite=Strict) works without CORS. Set
// NEXT_PUBLIC_API_BASE_URL instead to call the API origin directly.
// Read at build time: rewrites are baked into the build output.
const apiOrigin = (process.env.FEMXO_API_ORIGIN || "http://localhost:3000").replace(/\/$/, "");

// Account types used to have their own sign-in pages; there is one now.
const OLD_PORTALS = "customer|dealer|sub-dealer|retail-partner|super-admin";

// Sent with every page. No CSP yet: the theme script in app/layout.tsx is
// inline, so a CSP needs a nonce first.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// The storefront is its own site (its own Vercel project). Without its address, the header can't offer
// "Customer sign in" (see src/lib/constants.ts), so say so loudly instead of shipping without it unnoticed.
if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_STORE_URL?.trim()) {
  console.warn(
    "[femxo] NEXT_PUBLIC_STORE_URL is not set: this build has no \"Customer sign in\" link. " +
      "Set it to the storefront address (for example https://shop.femxo.in) and redeploy."
  );
}

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // A self-contained server in .next/standalone, for the Docker image.
  output: "standalone",
  // This app is one package of a pnpm workspace: trace from the repo root so
  // the standalone build includes workspace packages (Next docs: output).
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  images: {
    qualities: [50, 75],
  },
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    // Nothing to forward to while the site runs on dummy data.
    if (!backendConnected) return [];
    return ["auth", "access", "territories"].map((prefix) => ({
      source: `/${prefix}/:path*`,
      destination: `${apiOrigin}/${prefix}/:path*`,
    }));
  },
  async redirects() {
    return [
      { source: "/register", destination: "/login", permanent: false },
      { source: "/verify-otp", destination: "/login", permanent: false },
      { source: "/reset-password", destination: "/forgot-password", permanent: false },
      { source: `/:portal(${OLD_PORTALS})/login`, destination: "/login", permanent: false },
      { source: `/:portal(${OLD_PORTALS})/register`, destination: "/login", permanent: false },
      { source: `/:portal(${OLD_PORTALS})/forgot-password`, destination: "/forgot-password", permanent: false },
      { source: `/:portal(${OLD_PORTALS})/coming-soon`, destination: "/account", permanent: false },
    ];
  },
  turbopack: {
    resolveAlias:
      // Once connected, production builds drop the demo accounts entirely.
      process.env.NODE_ENV === "production" && backendConnected
        ? {
            "@/features/auth/services/demo-backend":
              "./src/features/auth/services/demo-backend-disabled.ts",
          }
        : {},
  },
};

export default nextConfig;
