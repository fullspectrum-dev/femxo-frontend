import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cspHeaders } from "@/lib/csp";
import { PANELS, ROLE_PANEL_ORDER, panelModules } from "@/features/admin/panels";

/*
 * Role panel URLs are dynamic segments (app/panel/[panel]/[module]). With
 * cacheComponents those stream, so a notFound() inside them answers 200.
 * Paths that no panel has are sent to an unmatched route here instead, which
 * Next answers with a real 404.
 */
const KNOWN = new Set(
  ROLE_PANEL_ORDER.flatMap((id) => panelModules(PANELS[id]).filter((key) => key !== "company").map((key) => `/panel/${id}/${key}`))
);

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = cspHeaders(nonce);
  // Next reads the nonce from the request's CSP header and stamps its own scripts; the layout reads x-nonce.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  for (const [key, value] of Object.entries(csp)) requestHeaders.set(key, value);

  const path = request.nextUrl.pathname.replace(/\/$/, "");
  const response =
    path.startsWith("/panel/") && !KNOWN.has(path)
      ? NextResponse.rewrite(new URL("/_panel-not-found", request.url), { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });
  for (const [key, value] of Object.entries(csp)) response.headers.set(key, value);
  return response;
}

// Every page, not static files or prefetches.
export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icons/|images/|manifest.json).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
