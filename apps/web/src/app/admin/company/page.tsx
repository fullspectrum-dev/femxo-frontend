import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin-ui";

// Rendered after the in-browser session check; see ../layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Company Overview" };

export default function CompanyPage() {
  return <ComingSoon module="Company Overview" />;
}
