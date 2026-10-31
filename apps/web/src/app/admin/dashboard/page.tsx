import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin-ui";
import { isAdminPrototype } from "@/features/admin/data/data-mode";
import { Dashboard } from "@/features/admin/dashboard/Dashboard";

// Rendered after the in-browser session check; see ../layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  if (!isAdminPrototype) return <ComingSoon module="Dashboard" message="Analytics module — coming soon with live dashboards." />;
  return <Dashboard />;
}
