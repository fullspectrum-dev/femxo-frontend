import type { Metadata } from "next";
import { CommandCenter } from "@/features/admin/dashboard/CommandCenter";

// Rendered after the in-browser session check; see ../layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Command center" };

export default function DashboardPage() {
  return <CommandCenter />;
}
