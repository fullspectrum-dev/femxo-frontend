import type { Metadata } from "next";
import { SupportPage } from "@/features/account/components/SupportPage";

export const metadata: Metadata = { title: "Help & support", robots: { index: false } };

export default function Support() {
  return <SupportPage />;
}
