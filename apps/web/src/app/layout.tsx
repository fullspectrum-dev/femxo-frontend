import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { Suspense } from "react";
import "./globals.css";
import { CONTACT, SITE } from "@/lib/constants";

// Self-hosted variable fonts (OFL, Latin subset): no request to Google, nothing for the CSP to allow but 'self'.
const displayFont = localFont({
  src: "./fonts/space-grotesk-latin.woff2",
  weight: "300 700",
  variable: "--font-display",
  display: "swap",
});

const bodyFont = localFont({
  src: "./fonts/dm-sans-latin.woff2",
  weight: "100 1000",
  variable: "--font-body",
  display: "swap",
});

const themeInitializationScript = `
  try {
    const storedTheme = localStorage.getItem("femxo-theme");
    const isDark = storedTheme
      ? storedTheme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  } catch {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  }
`;

// The home page title: the brand first, then what people search for.
const HOME_TITLE = `${SITE.name} | Digitising Bihar's Local Businesses`;

const DESCRIPTION =
  "Femxo Consultancy Services (femxo.in) takes Bihar's local businesses digital: e-commerce, dealer distribution, ERP and agentic AI, building 1 lakh+ local entrepreneurs across all 38 districts of Bihar.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: HOME_TITLE,
    template: `%s | ${SITE.name}`,
  },
  description: DESCRIPTION,
  applicationName: SITE.name,
  keywords: [
    "Femxo",
    "femxo.in",
    "Femxo Consultancy Services",
    "Bihar local businesses digital",
    "digital solutions for Bihar businesses",
    "Bihar business network",
    "ERP India",
    "dealer management",
    "commission management",
    "GST billing",
    "supply chain",
  ],
  authors: [{ name: SITE.name }],
  creator: SITE.name,
  publisher: SITE.name,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: SITE.url,
    siteName: SITE.name,
    title: HOME_TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: SITE.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: DESCRIPTION,
    images: ["/images/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  manifest: "/manifest.json",
  // Google's result favicon needs a square icon of 48px or more; the .ico
  // only carries 16 and 32, so the PNGs are listed first.
  icons: {
    icon: [
      { url: "/icons/icon-192.png?v=20261022", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png?v=20261022", sizes: "512x512", type: "image/png" },
      { url: "/favicon.ico?v=20261022", sizes: "any" },
    ],
    apple: "/femxo-favicon.png?v=20261022",
  },
};

// Tells Google the site's name ("Femxo Consultancy Services") and logo.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE.url}/#website`,
      url: SITE.url,
      name: SITE.name,
      alternateName: [SITE.shortName, "femxo.in", "FEMXO"],
      inLanguage: "en-IN",
      publisher: { "@id": `${SITE.url}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE.url}/#organization`,
      name: SITE.name,
      legalName: `${SITE.name} Private Limited`,
      alternateName: [SITE.shortName, "FEMXO"],
      slogan: "Digitising Bihar's Local Businesses",
      url: SITE.url,
      logo: `${SITE.url}/icons/icon-512.png`,
      description: DESCRIPTION,
      telephone: CONTACT.phone,
      address: {
        "@type": "PostalAddress",
        streetAddress: "College Road, Near Kaudihar Chowk",
        addressLocality: "Raxaul",
        addressRegion: "Bihar",
        postalCode: "845305",
        addressCountry: "IN",
      },
      areaServed: { "@type": "State", name: "Bihar" },
      knowsAbout: ["E-commerce", "Dealer distribution", "ERP", "Agentic AI", "Digital transformation for local businesses"],
    },
  ],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5EDFB" },
    { media: "(prefers-color-scheme: dark)", color: "#130A1F" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

/** The inline scripts. They need this request's CSP nonce, so they are read per request (hence the Suspense). */
async function InlineScripts({ jsonLd }: { jsonLd: boolean }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return jsonLd ? (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, "\\u003c") }}
    />
  ) : (
    <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
  );
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <Suspense fallback={null}>
          <InlineScripts jsonLd={false} />
        </Suspense>
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Suspense fallback={null}>
          <InlineScripts jsonLd />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
