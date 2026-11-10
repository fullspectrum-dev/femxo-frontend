import type { Metadata } from "next";
import { LiveDashboard } from "@/features/admin/dashboard/LiveDashboard";

// Rendered after the in-browser session check; see ../layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <LiveDashboard />;
}
