import type { Metadata } from "next";
import { AccountHome } from "@/features/account/components/AccountHome";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default function AccountPage() {
  return <AccountHome />;
}
