"use client";

import { PageHeader } from "@/components/admin-ui";
import { PanelLink, usePanel } from "@/features/admin/shell/PanelContext";

/** The home of a task panel (Field Staff, Finance): one tile per screen this user may open. */
export function StaffHome({ intro }: { intro: string }) {
  const { panel, items } = usePanel();
  const tiles = items.filter((item) => item.key !== "dashboard");
  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5">
      <PageHeader title={panel.name} description={intro} />
      {tiles.length === 0 ? <p className="text-[14px] fx-muted">Your role has no screens in this panel yet. Ask an admin for the permissions you need.</p> : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <PanelLink href={item.href} className="fx-card fx-card-pad flex h-full flex-col gap-2 no-underline">
                <Icon size={22} aria-hidden="true" />
                <span className="font-semibold">{item.label}</span>
              </PanelLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
