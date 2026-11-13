import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
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
  const path = request.nextUrl.pathname.replace(/\/$/, "");
  if (KNOWN.has(path)) return NextResponse.next();
  return NextResponse.rewrite(new URL("/_panel-not-found", request.url));
}

export const config = { matcher: ["/panel/:path+"] };
