import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { OfflineBanner, ToastProvider } from "@femxo/ui";
import { SessionProvider } from "@/features/auth/components/SessionProvider";
import { DemoPanelHost } from "@/features/devtools/components/DemoPanelHost";
import { BottomBar } from "@/features/shell/components/BottomBar";
import { CategoryNav } from "@/features/shell/components/CategoryNav";
import { Footer } from "@/features/shell/components/Footer";
import { Header } from "@/features/shell/components/Header";
import { TOP_CATEGORIES } from "@/features/shell/categories";
import "./globals.css";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-space-grotesk", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Femxo", template: "%s | Femxo" },
  description: "Shop staples, daily needs and Prime deals from Femxo across Bihar.",
  // Not public yet: keep the placeholder out of search until launch.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#6C35A5" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      {/* Bottom padding keeps content clear of the phone bottom bar. */}
      <body className="flex min-h-dvh flex-col bg-canvas pb-[calc(3.5rem+env(safe-area-inset-bottom))] font-sans text-ink antialiased md:pb-0">
        <a
          href="#main"
          className="sr-only rounded-control bg-surface px-4 py-2 font-semibold text-ink shadow-raised focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to content
        </a>
        <ToastProvider>
          <SessionProvider>
            <Header cartCount={0} />
            <CategoryNav categories={TOP_CATEGORIES} />
            <OfflineBanner />
            <main id="main" tabIndex={-1} className="flex-1 outline-none">
              {children}
            </main>
            <Footer />
            <BottomBar categories={TOP_CATEGORIES} />
            <DemoPanelHost />
          </SessionProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
