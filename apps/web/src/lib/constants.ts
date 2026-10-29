export interface NavLink {
  label: string;
  href: string;
  /** Drawn as a gold pill so it stands out from the other links. */
  highlight?: boolean;
}

/** The live site. Canonical URLs, the sitemap and structured data use it. */
export const SITE = {
  url: "https://www.femxo.in",
  name: "Femxo Consultancy Services",
  shortName: "Femxo",
} as const;

/**
 * Where the customer storefront runs: its own site (its own Vercel project, its own port locally).
 * Set NEXT_PUBLIC_STORE_URL at build time. Without it, local development and tests use the local
 * storefront, but a production build has no address: "Customer sign in" is left out rather than
 * sending visitors to localhost.
 */
export function resolveStoreUrl(configured: string | undefined, nodeEnv: string | undefined): string | null {
  const url = configured?.trim().replace(/\/$/, "");
  if (url) return url;
  return nodeEnv === "production" ? null : "http://localhost:3002";
}

export const STORE_URL = resolveStoreUrl(process.env.NEXT_PUBLIC_STORE_URL, process.env.NODE_ENV);
export const CUSTOMER_SIGN_IN_URL = STORE_URL ? `${STORE_URL}/login` : null;

export const NAV_LINKS: readonly NavLink[] = [
  { label: "Why Femxo", href: "#why" },
  { label: "Network", href: "#entrepreneurs" },
  { label: "Platform", href: "#platform" },
  { label: "Femxo Tech", href: "#tech", highlight: true },
  { label: "Women", href: "#women" },
  { label: "Roadmap", href: "#roadmap" },
];

export const CONTACT = {
  phone: "+91 9065741541",
  phoneHref: "tel:+919065741541",
  directors: "Munni Srivastava | Aditya Raj",
  registeredAddress:
    "C/O Sanjay Srivastava, Chhota Pareawa, Raxaul, East Champaran, Bihar, 845305",
  corporateOffice: "College Road, Near Kaudihar Chowk, Raxaul, Bihar, 845305",
} as const;

export const CAPABILITIES = [
  "E-commerce",
  "Dealer network",
  "ERP",
  "Agentic AI",
  "Websites and apps",
  "Cloud",
  "Women entrepreneurs",
  "38 districts",
] as const;

/**
 * Bihar's government tree, as the backend imports it from the Local
 * Government Directory (State → District → Sub-division → Block / Urban body
 * → Gram Panchayat → Village). Divisions are a sales grouping, not a
 * government level. Counts are rounded.
 */
export const BIHAR_LEVELS = [
  { value: "9", label: "Divisions" },
  { value: "38", label: "Districts" },
  { value: "101", label: "Sub-divisions" },
  { value: "534", label: "Blocks" },
  { value: "8,000+", label: "Gram panchayats" },
  { value: "40,000+", label: "Villages" },
] as const;

/**
 * The entrepreneur model: one dealer per gram panchayat, two sub-dealers per
 * village, one urban dealer per municipal ward. Panchayats: 8,072 contested
 * in the 2021 Bihar panchayat elections (CAG audit report, 2023). Villages:
 * 44,874 in Census 2011. Urban wards: 3,398 across Bihar's municipal
 * corporations, nagar parishads and nagar panchayats (CAG, December 2019).
 */
export const ENTREPRENEUR_MODEL = {
  panchayats: 8072,
  dealersPerPanchayat: 1,
  villages: 44874,
  subDealersPerVillage: 2,
  urbanWards: 3398,
  dealersPerWard: 1,
} as const;
