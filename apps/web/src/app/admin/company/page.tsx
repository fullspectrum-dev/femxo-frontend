import type { Metadata } from "next";
import { CompanyEditor } from "@/features/admin/company/CompanyEditor";

// Rendered after the in-browser session check; see ../layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Company Overview" };

export default function CompanyPage() {
  return <CompanyEditor />;
}
