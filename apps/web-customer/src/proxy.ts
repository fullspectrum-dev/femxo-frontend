import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cspHeaders } from "@/lib/csp";

/*
 * Sets the enforced, nonce-based Content-Security-Policy on every page (CSP_REPORT_ONLY=true downgrades it to
 * Report-Only). Next reads the nonce from the request's CSP header and stamps its own scripts; the root layout
 * reads x-nonce for the theme script and JSON-LD.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = cspHeaders(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  for (const [key, value] of Object.entries(csp)) requestHeaders.set(key, value);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [key, value] of Object.entries(csp)) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|store/v1|favicon.ico|icons/|banners/|manifest.webmanifest|sw.js).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
