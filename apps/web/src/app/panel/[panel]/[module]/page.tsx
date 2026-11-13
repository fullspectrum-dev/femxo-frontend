import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommandCenter } from "@/features/admin/dashboard/CommandCenter";
import { ModulePage } from "@/features/admin/modules/ModulePage";
import { PANELS, ROLE_PANEL_ORDER, isPanelId, panelModules } from "@/features/admin/panels";
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
  if (found.key === "dashboard") return <CommandCenter />;
  if (found.key === "company") notFound();
  return <ModulePage moduleKey={found.key} />;
}
