import { describe, expect, it } from "vitest";
import type { AccessSummary } from "@/features/auth/types/auth";
import { MODULES } from "./modules/registry";
import { NAV_ITEMS } from "./nav";
import { PANELS, ROLE_PANEL_ORDER, canOpenPanel, homeFor, isPanelId, panelHref, panelModules, panelNav, panelsFor } from "./panels";
import type { PanelConfig } from "./panels";

const access = (over: Partial<AccessSummary> = {}): AccessSummary => ({
  isSuperAdmin: false,
  permissions: [],
  roles: [],
  territoryIds: [],
  locationIds: [],
  ...over,
});

// Generic over every panel, so panels added later are covered too.
const ALL = Object.values(PANELS) as PanelConfig[];
const ROLE_PANELS = ALL.filter((p) => p.id !== "super-admin");
const each = (panels: PanelConfig[]) => panels.map((p) => [p.id, p] as const);
const keysOf = (nav: ReturnType<typeof panelNav>) => nav.flatMap((g) => g.items.map((i) => i.key));

describe("panel registry", () => {
  it("keys match ids, and every role panel lives under /panel/<id>", () => {
    for (const [key, panel] of Object.entries(PANELS)) {
      expect(panel.id).toBe(key);
      expect(isPanelId(key)).toBe(true);
      if (panel.id !== "super-admin") expect(panel.basePath).toBe(`/panel/${panel.id}`);
    }
    expect(PANELS["super-admin"].basePath).toBe("/admin");
    expect(isPanelId("nope")).toBe(false);
    expect(isPanelId("toString")).toBe(false);
  });

  it("ROLE_PANEL_ORDER lists known role panels only", () => {
    for (const id of ROLE_PANEL_ORDER) {
      expect(isPanelId(id)).toBe(true);
      expect(id).not.toBe("super-admin");
    }
  });

  // Panels drawn by ModulePage/CommandCenter need a registry spec for each key. Panels with their own
  // screen component (app/panel/[panel]/[module]/page.tsx) are listed here and only need known keys.
  const OWN_SCREENS = new Set<string>(["delivery", "dispatch", "field", "finance"]);

  it.each(each(ROLE_PANELS.filter((p) => !OWN_SCREENS.has(p.id))))("%s: every module key exists in the module registry", (_id, panel) => {
    const known = new Set<string>([...MODULES.map((m) => m.key), "dashboard"]);
    for (const key of panelModules(panel)) expect(known.has(key), key).toBe(true);
  });

  it.each(each(ALL))("%s: no duplicate module keys", (_id, panel) => {
    const keys = panelModules(panel);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("the super admin panel mirrors the sidebar registry", () => {
    expect(panelModules(PANELS["super-admin"])).toEqual(NAV_ITEMS.map((i) => i.key));
  });

  it.each(each(ALL))("%s: bottom nav keys belong to the panel", (_id, panel) => {
    const own = new Set(panelModules(panel));
    for (const item of panel.bottomNav) expect(own.has(item.key), item.key).toBe(true);
  });

  it.each(each(ROLE_PANELS))("%s: has role names and a dashboard", (_id, panel) => {
    expect(panel.roleNames.length).toBeGreaterThan(0);
    expect(panelModules(panel)).toContain("dashboard");
  });

  it("no role name opens two panels", () => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    const seen = new Map<string, string>();
    for (const panel of ROLE_PANELS) {
      for (const name of panel.roleNames) {
        const prev = seen.get(norm(name));
        expect(prev === undefined || prev === panel.id, `${name}: ${prev} and ${panel.id}`).toBe(true);
        seen.set(norm(name), panel.id);
      }
    }
  });
});

describe("role to panel matching", () => {
  it.each(["Sub-dealer", "sub dealer", "SUB_DEALER", "SubDealer", "  sub-DEALER "])("%s opens the Sub-Dealer panel only", (role) => {
    const a = access({ roles: [role] });
    expect(canOpenPanel(PANELS["sub-dealer"], a)).toBe(true);
    expect(canOpenPanel(PANELS.dealer, a)).toBe(false);
    expect(homeFor(a)).toBe("/panel/sub-dealer/dashboard");
  });

  it.each(["Dealer", "DEALER", "dealer "])("%s opens the Dealer panel, not the Sub-Dealer one", (role) => {
    const a = access({ roles: [role] });
    expect(canOpenPanel(PANELS.dealer, a)).toBe(true);
    expect(canOpenPanel(PANELS["sub-dealer"], a)).toBe(false);
    expect(homeFor(a)).toBe("/panel/dealer/dashboard");
  });

  it.each(each(ROLE_PANELS))("%s: each of its role names opens it (any casing)", (_id, panel) => {
    for (const name of panel.roleNames) {
      expect(canOpenPanel(panel, access({ roles: [name.toUpperCase()] }))).toBe(true);
      expect(homeFor(access({ roles: [name] }))).not.toBeNull();
    }
  });

  it("super admin may open every panel and lands on /admin", () => {
    const a = access({ isSuperAdmin: true });
    for (const panel of ALL) expect(canOpenPanel(panel, a)).toBe(true);
    expect(panelsFor(a).map((p) => p.id)).toEqual(["super-admin"]);
    expect(homeFor(a)).toBe("/admin/dashboard");
  });

  it("a non-super-admin never opens /admin, whatever roles or permissions they hold", () => {
    const everyRole = ALL.flatMap((p) => p.roleNames);
    const a = access({ roles: [...everyRole, "super admin", "Super-Admin"], permissions: ["role.view", "user.manage"] });
    expect(canOpenPanel(PANELS["super-admin"], a)).toBe(false);
    expect(panelsFor(a).some((p) => p.id === "super-admin")).toBe(false);
    expect(homeFor(a)).not.toMatch(/^\/admin/);
  });

  it("unknown or no role gives no home", () => {
    expect(homeFor(access())).toBeNull();
    expect(homeFor(access({ roles: ["Astronaut"] }))).toBeNull();
    expect(panelsFor(access({ roles: ["Astronaut"] }))).toEqual([]);
  });

  it("multi-role users go to the first panel in ROLE_PANEL_ORDER", () => {
    const a = access({ roles: ["Sub-dealer", "Dealer"] });
    const ids = panelsFor(a).map((p) => p.id);
    expect(ids).toEqual(ROLE_PANEL_ORDER.filter((id) => ids.includes(id)));
    expect(homeFor(a)).toBe(`${PANELS[ids[0]!].basePath}/dashboard`);
  });
});

describe("panelHref", () => {
  it("rewrites /admin paths to the panel base path", () => {
    expect(panelHref(PANELS.dealer, "/admin/x?y")).toBe("/panel/dealer/x?y");
    expect(panelHref(PANELS.dealer, "/admin/orders?x=1")).toBe("/panel/dealer/orders?x=1");
    expect(panelHref(PANELS.dealer, "/admin")).toBe("/panel/dealer");
  });

  it("leaves other paths alone", () => {
    expect(panelHref(PANELS.dealer, "/administrator")).toBe("/administrator");
    expect(panelHref(PANELS.dealer, "/administrator/x")).toBe("/administrator/x");
    expect(panelHref(PANELS.dealer, "/account")).toBe("/account");
  });

  it("is the identity for the super admin panel", () => {
    expect(panelHref(PANELS["super-admin"], "/admin/orders?y")).toBe("/admin/orders?y");
  });

  it.each(each(ROLE_PANELS))("%s: rewrites to its basePath", (_id, panel) => {
    expect(panelHref(panel, "/admin/dashboard?y=2")).toBe(`${panel.basePath}/dashboard?y=2`);
  });
});

describe("panelNav", () => {
  it.each(each(ROLE_PANELS))("%s: no permissions shows only the dashboard, and empty groups are dropped", (_id, panel) => {
    const nav = panelNav(panel, access({ roles: [...panel.roleNames] }));
    expect(nav.every((g) => g.items.length > 0)).toBe(true);
    expect(keysOf(nav)).toEqual(["dashboard"]);
  });

  it.each(each(ROLE_PANELS))("%s: shows only the dashboard while access is loading", (_id, panel) => {
    expect(keysOf(panelNav(panel, null))).toEqual(["dashboard"]);
  });

  it("filters dealer items by permission", () => {
    const nav = panelNav(PANELS.dealer, access({ roles: ["Dealer"], permissions: ["order.view", "wallet.view"] }));
    const keys = keysOf(nav);
    expect(keys).toEqual(["dashboard", "orders", "finance"]);
    expect(nav.every((g) => g.items.length > 0)).toBe(true);
  });

  it.each(each(ALL))("%s: items link to /admin/<key> and carry an icon", (_id, panel) => {
    for (const item of panelNav(panel, access({ isSuperAdmin: true })).flatMap((g) => g.items)) {
      expect(item.href).toBe(`/admin/${item.key}`);
      expect(item.icon).toBeTruthy();
    }
  });

  it.each(each(ALL))("%s: super admin sees every item", (_id, panel) => {
    expect(keysOf(panelNav(panel, access({ isSuperAdmin: true })))).toEqual(panelModules(panel));
  });

  it.each(each(ROLE_PANELS))("%s: an item shows when the user holds any one of its permissions", (_id, panel) => {
    for (const item of panel.groups.flatMap((g) => g.items)) {
      for (const perm of item.anyOf) {
        expect(keysOf(panelNav(panel, access({ permissions: [perm] }))), `${item.key} via ${perm}`).toContain(item.key);
      }
    }
  });
});

describe("payments and reviews menu", () => {
  const admin = PANELS.admin;
  const finance = PANELS.finance;

  it("shows Payments only to someone holding a payment permission", () => {
    for (const permission of ["payment.view", "payment.refund", "payment.reconcile"]) {
      expect(keysOf(panelNav(admin, access({ permissions: [permission] }))), permission).toContain("payments");
    }
    expect(keysOf(panelNav(admin, access({ permissions: ["order.view", "wallet.view"] })))).not.toContain("payments");
    expect(keysOf(panelNav(admin, access()))).not.toContain("payments");
  });

  it("shows Reviews only with review.moderate", () => {
    expect(keysOf(panelNav(admin, access({ permissions: ["review.moderate"] })))).toContain("reviews");
    expect(keysOf(panelNav(admin, access({ permissions: ["payment.view"] })))).not.toContain("reviews");
  });

  it("the Finance panel offers online payments to payment.view and not to payout-only staff", () => {
    expect(keysOf(panelNav(finance, access({ permissions: ["payment.view"] })))).toContain("payments");
    expect(keysOf(panelNav(finance, access({ permissions: ["finance.payout.view"] })))).not.toContain("payments");
  });

  it("a Super Admin sees both in the full menu", () => {
    const keys = keysOf(panelNav(PANELS["super-admin"], access({ isSuperAdmin: true })));
    expect(keys).toEqual(expect.arrayContaining(["payments", "reviews"]));
  });

  it("both have screens in the module registry", () => {
    const known = new Set<string>(MODULES.map((m) => m.key));
    expect(known.has("payments") && known.has("reviews")).toBe(true);
  });
});
