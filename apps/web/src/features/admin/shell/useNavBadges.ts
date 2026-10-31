"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isAdminPrototype } from "../data/data-mode";
import type { ModuleKey } from "../nav";

/** The API's page size cap: counting more than one page would take many calls, so show "100+". */
const PAGE = 100;

type Badges = Partial<Record<ModuleKey, string>>;

/**
 * The gold "waiting" counts in the sidebar, read from the API. Only modules with
 * a backend get one: Warehouse counts transfers waiting for someone to act (not
 * yet dispatched, or on the road and not yet received). Everything else shows
 * nothing until its API exists, so no made-up number is ever shown. Counts
 * refresh whenever the route changes (an action usually ends with a navigation
 * or a return to the list). Any failure, such as no permission, shows no badge.
 */
export function useNavBadges(pathname: string): Badges {
  const [badges, setBadges] = useState<Badges>({});

  useEffect(() => {
    if (isAdminPrototype) return;
    let cancelled = false;
    api
      .get<{ transfers: { status: string }[]; nextCursor: string | null }>("/inventory/transfers", { limit: PAGE })
      .then(({ transfers, nextCursor }) => {
        if (cancelled) return;
        const waiting = transfers.filter((t) => t.status === "draft" || t.status === "in_transit").length;
        setBadges(waiting > 0 ? { warehouse: nextCursor ? `${waiting}+` : String(waiting) } : {});
      })
      .catch(() => {
        if (!cancelled) setBadges({});
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return badges;
}
