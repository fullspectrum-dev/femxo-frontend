import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { OfflineBanner, ToastProvider, themeInitScript } from "@femxo/ui";
import { BirthdayBanner } from "@/features/prime/components/BirthdayBanner";
import { CartProvider } from "@/features/cart/components/CartProvider";
import { WishlistProvider } from "@/features/wishlist/components/WishlistProvider";
import { SessionProvider } from "@/features/auth/components/SessionProvider";
import { DemoPanelHost } from "@/features/devtools/components/DemoPanelHost";
import { BottomBar } from "@/features/shell/components/BottomBar";
import { CategoryNav } from "@/features/shell/components/CategoryNav";
import { Footer } from "@/features/shell/components/Footer";
import { Header } from "@/features/shell/components/Header";
import { TOP_CATEGORIES } from "@/features/shell/categories";
import "./globals.css";
import { ICONS } from "./icons";
import { t } from "@/i18n";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-space-grotesk", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Femxo", template: "%s | Femxo" },
  description: "Shop staples, daily needs and Prime deals from Femxo across Bihar.",
  // Not public yet: keep the placeholder out of search until launch.
  robots: { index: false, follow: false },
  icons: ICONS,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#6C35A5" },
    { media: "(prefers-color-scheme: dark)", color: "#120A1C" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      {/* Bottom padding keeps content clear of the phone bottom bar. */}
      <body className="flex min-h-dvh flex-col bg-canvas pb-[calc(3.5rem+env(safe-area-inset-bottom))] font-sans text-ink antialiased md:pb-0">
        <a
          href="#main"
          className="sr-only rounded-control bg-surface px-4 py-2 font-semibold text-ink shadow-raised focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
        >
          {t("nav.skip")}
        </a>
        <ToastProvider>
          <SessionProvider>
            <CartProvider>
              <WishlistProvider>
                <Header />
                {/* These read the current path. On pages whose address isn't known until the visit (an order, a support request) that has to wait, without holding up the rest of the page. */}
                <Suspense fallback={null}>
                  <CategoryNav categories={TOP_CATEGORIES} />
                </Suspense>
                <OfflineBanner />
                <BirthdayBanner />
                <main id="main" tabIndex={-1} className="flex-1 outline-none">
                  {children}
                </main>
                <Footer />
                <Suspense fallback={null}>
                  <BottomBar categories={TOP_CATEGORIES} />
                </Suspense>
                <DemoPanelHost />
              </WishlistProvider>
            </CartProvider>
          </SessionProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
