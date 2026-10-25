import type { Banner, Brand, Category } from "../../contracts/catalog";
import type { Address, OrderDetail, Serviceability } from "../../contracts/commerce";
import type { Coupon, Customer, Membership, Referral, Review, Ticket } from "../../contracts/people";

/*
 * The mock's own model. Richer than the contract where the backend would
 * be (batches behind "best before"), and mapped to contract objects by
 * mappers.ts before anything leaves a handler.
 */

export interface SeedBatch {
  code: string;
  /** YYYY-MM-DD. */
  expiry: string;
}

export interface SeedVariant {
  id: string;
  sku: string;
  label: string;
  mrp: number;
  price: number;
  primePrice: number;
  gstBps: number;
  stock: number;
  maxPerOrder: number;
  batches: SeedBatch[];
}

export interface SeedProduct {
  id: string;
  slug: string;
  name: string;
  brandId: string;
  /** The subcategory. */
  categoryId: string;
  topCategoryId: string;
  description: string;
  highlights: string[];
  specs: { label: string; value: string }[];
  returnable: boolean;
  primeExclusive: boolean;
  badges: string[];
  createdAt: string;
  image: string;
  gallery: { src: string; alt: string }[];
  rating: number;
  ratingCount: number;
  variants: SeedVariant[];
}

/** Read-only, deterministic, never stored in the browser (the server can build it too). */
export interface Catalog {
  categories: Category[];
  brands: Brand[];
  products: SeedProduct[];
  banners: Banner[];
  reviews: Record<string, Review[]>;
}

export interface StoredCoupon extends Coupon {
  usageLimit: number | null;
  used: number;
  firstOrderOnly: boolean;
}

export type StoredOrder = OrderDetail & { customerId: string };

/** Everything a shopper can change; persisted in IndexedDB in the browser. */
export interface MockState {
  customers: Customer[];
  /** Demo email/password logins; public demo values that grant nothing. */
  credentials: Record<string, { email: string; password: string }>;
  addresses: Record<string, Address[]>;
  orders: Record<string, StoredOrder>;
  memberships: Record<string, Membership>;
  referrals: Record<string, Referral>;
  coupons: Record<string, StoredCoupon>;
  pincodes: Record<string, Serviceability>;
  wishlists: Record<string, string[]>;
  tickets: Record<string, Ticket[]>;
  /** Stock after orders placed in this browser, by variant id (absent = seed stock). */
  stock: Record<string, number>;
  /** Filled by later modules (carts). */
  carts: Record<string, unknown>;
  otp: { challenges: Record<string, OtpChallengeRecord>; byMobile: Record<string, OtpMobileRecord> };
  sessions: Record<string, SessionRecord>;
  /**
   * The httpOnly refresh cookie. A browser keeps it out of page code; here
   * only the mock's auth handlers read it, never the UI.
   */
  refreshCookie: string | null;
}

export interface OtpChallengeRecord {
  mobile: string;
  createdAt: number;
  wrongAttempts: number;
}

/** Per-number OTP bookkeeping: resends and the 15-minute lockout. */
export interface OtpMobileRecord {
  sends: number;
  lastSentAt: number;
  lockedUntil: number | null;
}

export interface SessionRecord {
  customerId: string;
  refreshToken: string;
  /** Rotated-out refresh tokens: seeing one again means it was copied. */
  usedRefreshTokens: string[];
}
