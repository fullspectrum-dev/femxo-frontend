import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin-ui";
import { isAdminPrototype } from "@/features/admin/data/data-mode";
import { CompanyOverview } from "@/features/admin/company/CompanyOverview";

// Rendered after the in-browser session check; see ../layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Company Overview" };

export default function CompanyPage() {
  if (!isAdminPrototype) return <ComingSoon module="Company Overview" />;
  return <CompanyOverview />;
}
