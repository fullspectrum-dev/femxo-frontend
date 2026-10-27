import type { Banner, Brand, Category } from "../../contracts/catalog";
import type { Address, OrderDetail, PaymentIntent, Serviceability } from "../../contracts/commerce";
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

export type StoredOrder = OrderDetail & {
  customerId: string;
  /** Orders placed in this browser move on by themselves from when they were confirmed; seeded ones stay as they are. */
  lifecycle?: { confirmedAt: number };
  /** Set on a Prime membership purchase: the plan to start once it is paid. */
  prime?: { planId: string };
};

export interface StoredCartLine {
  id: string;
  variantId: string;
  quantity: number;
}

/** A cart as kept: variants and counts only; prices and stock are looked up fresh each time it is read. */
export interface StoredCart {
  id: string;
  lines: StoredCartLine[];
  couponCode: string | null;
  /** When it last changed (clock ms); it expires 7 days later. */
  updatedAt: number;
}

/** A checkout in progress: which address and delivery option the shopper has chosen so far. */
export interface StoredCheckout {
  id: string;
  customerId: string;
  addressId: string | null;
  deliveryId: "standard" | null;
}

/** One payment attempt for an order. */
export interface StoredIntent extends PaymentIntent {
  /** A pending payment settles (as paid) once the demo clock reaches this. */
  settlesAt?: number;
}

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
  /** Carts by owner: a customer id, or the guest cart's id. */
  carts: Record<string, StoredCart>;
  /**
   * The guest-cart cookie: which cart a signed-out browser is filling.
   * Absent in state saved before carts existed.
   */
  guestCartId?: string | null;
  /** Absent in state saved before checkout existed. */
  checkouts?: Record<string, StoredCheckout>;
  intents?: Record<string, StoredIntent>;
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
