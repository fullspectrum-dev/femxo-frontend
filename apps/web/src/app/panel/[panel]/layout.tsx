import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import "@/components/admin-ui/admin.css";
import "@/components/admin-ui/ops.css";
import { AuthSessionProvider } from "@/features/auth";
import { PANELS, ROLE_PANEL_ORDER, isPanelId } from "@/features/admin/panels";
import { PanelGate } from "@/features/admin/shell/AdminGate";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

// Rendered after the in-browser session check, like /admin (see app/admin/layout.tsx).
export const instant = false;

export function generateStaticParams() {
  return ROLE_PANEL_ORDER.map((panel) => ({ panel }));
}

export async function generateMetadata({ params }: { params: Promise<{ panel: string }> }): Promise<Metadata> {
  const { panel } = await params;
  const name = isPanelId(panel) ? PANELS[panel].name : "Panel";
  return { title: { default: name, template: `%s · Femxo ${name}` }, robots: { index: false, follow: false } };
}

/** The role panels: Admin, Warehouse, Dealer and Sub-Dealer. The Super Admin panel stays at /admin. */
export default async function PanelLayout({ children, params }: { children: ReactNode; params: Promise<{ panel: string }> }) {
  const { panel } = await params;
  if (!isPanelId(panel) || panel === "super-admin") notFound();
  return (
    <div className={`fx-admin ${inter.variable}`}>
      <AuthSessionProvider>
        <PanelGate panelId={panel}>{children}</PanelGate>
      </AuthSessionProvider>
    </div>
  );
}
