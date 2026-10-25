import { z } from "zod";
import { IsoDate, IsoDateTime, MobileNumber, Paise, page } from "./common";
import { OrderSummary, PaymentIntent } from "./commerce";

// ---------- Auth and profile ----------

export const Customer = z.object({
  id: z.string(),
  name: z.string(),
  mobile: MobileNumber,
  email: z.email().nullable(),
  /** Needed for the birthday reward; optional. */
  birthday: IsoDate.nullable(),
  isPrime: z.boolean(),
});
export type Customer = z.infer<typeof Customer>;

export const OtpChallenge = z.object({
  requestId: z.string(),
  resendAfterSeconds: z.number().int().nonnegative(),
  expiresInSeconds: z.number().int().positive(),
});
export type OtpChallenge = z.infer<typeof OtpChallenge>;

export const Session = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: Customer,
  /** A first-time mobile number: signup must collect a name before shopping. */
  isNewUser: z.boolean(),
});
export type Session = z.infer<typeof Session>;

export const ProfileUpdate = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  email: z.email().nullable().optional(),
  birthday: IsoDate.nullable().optional(),
});
export type ProfileUpdate = z.infer<typeof ProfileUpdate>;

// ---------- Prime ----------

export const PrimePlan = z.object({
  id: z.string(),
  name: z.string(),
  price: Paise,
  durationDays: z.number().int().positive(),
  benefits: z.array(z.string()),
});
export type PrimePlan = z.infer<typeof PrimePlan>;

export const Membership = z.object({
  memberId: z.string(),
  plan: PrimePlan,
  startedAt: IsoDateTime,
  validTill: IsoDateTime,
  /** Encoded in the QR on the membership card. */
  qrPayload: z.string(),
});
export type Membership = z.infer<typeof Membership>;

export const Coupon = z.object({
  code: z.string(),
  label: z.string(),
  kind: z.enum(["flat", "percent"]),
  /** Paise for flat coupons, basis points for percent ones. */
  value: z.number().int().positive(),
  maxDiscount: Paise.nullable(),
  minCart: Paise,
  primeOnly: z.boolean(),
  validTill: IsoDateTime,
});
export type Coupon = z.infer<typeof Coupon>;

export const Referral = z.object({
  code: z.string(),
  link: z.string(),
  invited: z.number().int().nonnegative(),
  joined: z.number().int().nonnegative(),
  rewardsEarned: Paise,
});
export type Referral = z.infer<typeof Referral>;

export const BirthdayReward = z.object({ coupon: Coupon, message: z.string() });
export type BirthdayReward = z.infer<typeof BirthdayReward>;

export const PrimePurchase = z.object({ order: OrderSummary, intent: PaymentIntent });
export type PrimePurchase = z.infer<typeof PrimePurchase>;

// ---------- Reviews (read-only: writing reviews is out of scope) ----------

export const Review = z.object({
  id: z.string(),
  author: z.string(),
  rating: z.number().int().min(1).max(5),
  title: z.string(),
  body: z.string(),
  createdAt: IsoDateTime,
  verifiedPurchase: z.boolean(),
});
export type Review = z.infer<typeof Review>;

export const ReviewSummary = z.object({
  average: z.number().min(0).max(5),
  count: z.number().int().nonnegative(),
  /** Counts for 1★ … 5★. */
  histogram: z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int(), z.number().int()]),
});
export type ReviewSummary = z.infer<typeof ReviewSummary>;

/** A page of a product's reviews, newest first, with the summary over all of them. */
export const ReviewList = page(Review).extend({ summary: ReviewSummary });
export type ReviewList = z.infer<typeof ReviewList>;

// ---------- Support ----------

export const TicketMessage = z.object({ id: z.string(), from: z.enum(["customer", "support"]), body: z.string(), at: IsoDateTime });
export const Ticket = z.object({
  id: z.string(),
  subject: z.string(),
  category: z.enum(["order", "payment", "return", "account", "other"]),
  status: z.enum(["open", "awaiting_customer", "resolved"]),
  orderId: z.string().nullable(),
  messages: z.array(TicketMessage).min(1),
  updatedAt: IsoDateTime,
});
export type Ticket = z.infer<typeof Ticket>;

export const TicketInput = z.object({
  subject: z.string().trim().min(4).max(120),
  category: Ticket.shape.category,
  orderId: z.string().nullable().default(null),
  message: z.string().trim().min(10).max(2000),
});
export type TicketInput = z.input<typeof TicketInput>;
