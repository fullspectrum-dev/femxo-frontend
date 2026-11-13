import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "@/components/admin-ui/admin.css";
import "@/components/admin-ui/ops.css";
import { AuthSessionProvider } from "@/features/auth";
import { AdminGate } from "@/features/admin/shell/AdminGate";

// Foundations: Inter for interface and tables (Space Grotesk comes from the root layout).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

// The panel renders only after the in-browser session check (the access token
// lives in memory, ADR 0005), so there is no server-rendered segment for
// instant-navigation validation to check.
export const instant = false;

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Femxo Admin" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`fx-admin ${inter.variable}`}>
      <AuthSessionProvider>
        <AdminGate>{children}</AdminGate>
      </AuthSessionProvider>
    </div>
  );
}
