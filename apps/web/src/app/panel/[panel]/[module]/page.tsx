import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommandCenter } from "@/features/admin/dashboard/CommandCenter";
import { ModulePage } from "@/features/admin/modules/ModulePage";
import { DeliveryPanel } from "@/features/delivery/DeliveryPanel";
import type { DeliveryScreen } from "@/features/delivery/DeliveryPanel";
import { DispatchPanel } from "@/features/dispatch/DispatchPanel";
import type { DispatchScreen } from "@/features/dispatch/DispatchPanel";
import { PANELS, ROLE_PANEL_ORDER, isPanelId, panelModules } from "@/features/admin/panels";
import { STAFF_HOME_PANELS, STAFF_SCREEN_KEYS } from "@/features/finance/screen-keys";
import { StaffScreen } from "@/features/finance/screens";
import type { ModuleKey } from "@/features/admin/nav";

// Rendered after the in-browser session check; see ../layout.tsx.
export const instant = false;

type Params = Promise<{ panel: string; module: string }>;

function resolve(panel: string, module: string) {
  if (!isPanelId(panel) || panel === "super-admin") return null;
  const config = PANELS[panel];
  const key = panelModules(config).find((entry) => entry === module) as ModuleKey | undefined;
  if (!key) return null;
  const label = config.groups.flatMap((g) => g.items).find((item) => item.key === key)?.label ?? key;
  return { key, label };
}

export function generateStaticParams() {
  return ROLE_PANEL_ORDER.flatMap((panel) => panelModules(PANELS[panel]).map((module) => ({ panel, module })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { panel, module } = await params;
  return { title: resolve(panel, module)?.label ?? "Not found" };
}

/** One module of a role panel. The same screens as /admin; the API scopes the data to the user. */
export default async function PanelModulePage({ params }: { params: Params }) {
  const { panel, module } = await params;
  const found = resolve(panel, module);
  if (!found) notFound();
  // Delivery Partner and Dispatch have their own screens; panels.ts only offers them keys those screens know.
  if (panel === "delivery") return <DeliveryPanel screen={found.key as DeliveryScreen} />;
  if (panel === "dispatch") return <DispatchPanel screen={found.key as DispatchScreen} />;
  // Field Staff and Finance: their own screens and a tile home (src/features/field, src/features/finance).
  if (STAFF_SCREEN_KEYS.has(found.key) || (found.key === "dashboard" && STAFF_HOME_PANELS.has(panel))) return <StaffScreen panel={panel} moduleKey={found.key} />;
  if (found.key === "dashboard") return <CommandCenter />;
  if (found.key === "company") notFound();
  return <ModulePage moduleKey={found.key} />;
}
