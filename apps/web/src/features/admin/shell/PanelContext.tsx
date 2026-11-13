"use client";

import Link from "next/link";
import { createContext, useContext, useMemo } from "react";
import type { ComponentProps, ReactNode } from "react";
import type { AccessSummary } from "@/features/auth/types/auth";
import { PANELS, panelHref, panelNav } from "../panels";
import type { PanelConfig, PanelId } from "../panels";
import type { NavGroup, NavItem } from "../nav";

interface PanelValue {
  panel: PanelConfig;
  access: AccessSummary | null;
  /** The menu for this user in this panel. */
  groups: NavGroup[];
  items: NavItem[];
  /** Rewrites a canonical `/admin/...` href into this panel. */
  to: (href: string) => string;
  /** The nav item and group for a path inside this panel. */
  find: (pathname: string) => { group: NavGroup; item: NavItem } | null;
}

const PanelContext = createContext<PanelValue | null>(null);

export function PanelProvider({ panelId, access, children }: { panelId: PanelId; access: AccessSummary | null; children: ReactNode }) {
  const value = useMemo<PanelValue>(() => {
    const panel = PANELS[panelId];
    const groups = panelNav(panel, access);
    const to = (href: string) => panelHref(panel, href);
    return {
      panel,
      access,
      groups,
      items: groups.flatMap((g) => g.items),
      to,
      find(pathname) {
        for (const group of groups) {
          const item = group.items.find((entry) => {
            const href = to(entry.href);
            return pathname === href || pathname.startsWith(`${href}/`);
          });
          if (item) return { group, item };
        }
        return null;
      },
    };
  }, [panelId, access]);
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

const FALLBACK_PANEL = PANELS["super-admin"];
const FALLBACK: PanelValue = {
  panel: FALLBACK_PANEL,
  access: null,
  groups: panelNav(FALLBACK_PANEL, null),
  items: panelNav(FALLBACK_PANEL, null).flatMap((g) => g.items),
  to: (href) => href,
  find: () => null,
};

/** The panel being shown. Outside a provider it is the Super Admin panel. */
export function usePanel(): PanelValue {
  return useContext(PanelContext) ?? FALLBACK;
}

/** A Link whose `/admin/...` href points into the current panel. */
export function PanelLink({ href, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const { to } = usePanel();
  return <Link href={to(href)} {...props} />;
}
