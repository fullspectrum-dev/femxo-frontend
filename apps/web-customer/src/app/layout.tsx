import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { OfflineBanner, ToastProvider, themeInitScript } from "@femxo/ui";
import { CartBar } from "@/features/cart/components/CartBar";
import { CartProvider } from "@/features/cart/components/CartProvider";
import { WishlistProvider } from "@/features/wishlist/components/WishlistProvider";
import { SessionProvider } from "@/features/auth/components/SessionProvider";
import { BottomBarLoader, CategoryNavLoader } from "@/features/shell/components/NavLoaders";
import { Footer } from "@/features/shell/components/Footer";
import { Header } from "@/features/shell/components/Header";
import "./globals.css";
import { ICONS } from "./icons";
import { t } from "@/i18n";
import { ALLOW_INDEXING, SITE_URL } from "@/lib/site";

// The ui-ux-pro-max e-commerce pairing: Rubik for headings and prices, Nunito Sans for reading.
// Self-hosted variable fonts (OFL, Latin subset): no request to Google, nothing for a CSP to allow but 'self'.
const display = localFont({ src: "./fonts/rubik-latin.woff2", variable: "--font-rubik", display: "swap", weight: "300 900" });
const body = localFont({ src: "./fonts/nunito-sans-latin.woff2", variable: "--font-nunito", display: "swap", weight: "200 1000" });

export const metadata: Metadata = {
  ...(SITE_URL ? { metadataBase: new URL(SITE_URL) } : {}),
  title: { default: "Femxo", template: "%s | Femxo" },
  description: "Shop staples, daily needs and Prime deals from Femxo across Bihar.",
  // Indexing is switched on per environment (NEXT_PUBLIC_ALLOW_INDEXING=true in production only).
  robots: ALLOW_INDEXING ? { index: true, follow: true } : { index: false, follow: false },
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

/** The theme script needs this request's CSP nonce (set by proxy.ts), so it is read per request. */
async function ThemeScript() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <Suspense fallback={null}>
          <ThemeScript />
        </Suspense>
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
                  <CategoryNavLoader />
                </Suspense>
                <OfflineBanner />
                <main id="main" tabIndex={-1} className="flex-1 outline-none">
                  {children}
                </main>
                <Footer />
                <Suspense fallback={null}>
                  <CartBar />
                  <BottomBarLoader />
                </Suspense>
              </WishlistProvider>
            </CartProvider>
          </SessionProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
