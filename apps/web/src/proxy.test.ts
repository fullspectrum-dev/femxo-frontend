import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { PANELS, ROLE_PANEL_ORDER, panelModules } from "@/features/admin/panels";
import { config, proxy } from "./proxy";

const run = (path: string) => proxy(new NextRequest(new URL(path, "http://localhost:3001")));
const rewrittenTo = (res: Response) => res.headers.get("x-middleware-rewrite");
const passes = (res: Response) => res.headers.get("x-middleware-next") === "1" && !rewrittenTo(res);

describe("proxy", () => {
  it("matches pages but not static assets", () => {
    expect(config.matcher[0].source).toContain("_next/static");
  });

  it("sets an enforced CSP, with x-nonce forwarded to the page", () => {
    const res = run("/login");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(res.headers.get("content-security-policy-report-only")).toBeNull();
    expect(csp).toMatch(/script-src 'self' 'unsafe-inline'/);
    expect(csp).not.toMatch(/https:|\*/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(res.headers.get("x-middleware-request-x-nonce")).toBeTruthy();
  });

  it("lets every known panel module through, with or without a trailing slash", () => {
    for (const id of ROLE_PANEL_ORDER) {
      for (const key of panelModules(PANELS[id]).filter((k) => k !== "company")) {
        expect(passes(run(`/panel/${id}/${key}`)), `${id}/${key}`).toBe(true);
        expect(passes(run(`/panel/${id}/${key}/`)), `${id}/${key}/`).toBe(true);
      }
    }
  });

  it.each(["/panel/nope/dashboard", "/panel/dealer/nope", "/panel/super-admin/dashboard", "/panel/dealer/dashboard/extra"])(
    "rewrites unknown %s to the not-found route",
    (path) => {
      expect(rewrittenTo(run(path))).toContain("/_panel-not-found");
    }
  );

  it("rewrites a module the panel does not offer", () => {
    const missing = PANELS.dealer.groups.flatMap((g) => g.items).some((i) => i.key === "users");
    if (!missing) expect(rewrittenTo(run("/panel/dealer/users"))).toContain("/_panel-not-found");
  });
});
