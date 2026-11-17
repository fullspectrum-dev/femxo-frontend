"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ModuleKey } from "../nav";
import { usePanel } from "./PanelContext";

/** The API's page size cap: counting more than one page would take many calls, so show "100+". */
const PAGE = 100;

type Badges = Partial<Record<ModuleKey, string>>;

const label = (count: number, more: boolean) => (count > 0 ? (more ? `${count}+` : String(count)) : undefined);

/**
 * The gold "waiting" counts in the sidebar, read from the API: work that sits until someone acts.
 * Warehouse counts transfers not yet dispatched or not yet received; Approvals counts pending
 * requests; Orders counts return requests waiting for a decision; Payments counts flagged payments; Reviews counts reviews waiting to be moderated. Each count is fetched on its own,
 * so a missing permission hides only that badge. No made-up number is ever shown.
 */
export function useNavBadges(pathname: string): Badges {
  const [badges, setBadges] = useState<Badges>({});
  // Only count modules this user's menu shows: asking for the rest would only earn 403s.
  const { items } = usePanel();
  const visible = items.map((item) => item.key).join(",");

  useEffect(() => {
    let cancelled = false;
    const all: [ModuleKey, () => Promise<string | undefined>][] = [
      [
        "warehouse",
        () =>
          api
            .get<{ transfers: { status: string }[]; nextCursor: string | null }>("/inventory/transfers", { limit: PAGE })
            .then(({ transfers, nextCursor }) => label(transfers.filter((t) => t.status === "draft" || t.status === "in_transit").length, nextCursor !== null)),
      ],
      [
        "approvals",
        () =>
          api
            .get<{ items: unknown[]; nextCursor: string | null }>("/approvals", { status: "pending", limit: PAGE })
            .then(({ items, nextCursor }) => label(items.length, nextCursor !== null)),
      ],
      [
        "orders",
        () =>
          api
            .get<{ items: unknown[]; nextCursor: string | null }>("/delivery/returns", { status: "requested", limit: PAGE })
            .then(({ items, nextCursor }) => label(items.length, nextCursor !== null)),
      ],
      [
        "payments",
        () =>
          api
            .get<{ items: unknown[]; nextCursor: string | null }>("/payments", { flagged: "true", limit: PAGE })
            .then(({ items, nextCursor }) => label(items.length, nextCursor !== null)),
      ],
      [
        "reviews",
        () =>
          api
            .get<{ items: unknown[]; nextCursor: string | null }>("/reviews", { status: "pending", limit: PAGE })
            .then(({ items, nextCursor }) => label(items.length, nextCursor !== null)),
      ],
    ];
    // Filtered before calling, so a hidden module costs no request.
    const shown = visible.split(",");
    const counts = all.filter(([key]) => shown.includes(key));
    Promise.all(counts.map(([key, count]) => count().then((value) => [key, value] as const).catch(() => [key, undefined] as const))).then((entries) => {
      if (cancelled) return;
      setBadges(Object.fromEntries(entries.filter(([, value]) => value !== undefined)) as Badges);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, visible]);

  return badges;
}
