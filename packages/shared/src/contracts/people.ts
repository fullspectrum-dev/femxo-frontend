import { z } from "zod";
import { IsoDateTime, MobileNumber, Pincode } from "./common";

// ---------- Auth and profile (femxo-backend /store/v1/auth/* and /me) ----------

export const PrimeStatus = z.enum(["none", "active", "expired"]);
export type PrimeStatus = z.infer<typeof PrimeStatus>;

/** The signed-in customer, as `GET /me` returns it. The phone is the identity and cannot change. */
export const Customer = z.object({
  id: z.string(),
  /** 10-digit Indian mobile number. */
  phone: MobileNumber,
  name: z.string(),
  email: z.string().nullable(),
  addressLine: z.string().nullable(),
  pincode: z.string().nullable(),
  /** The government location the customer is served from; null until `PUT /me/location`. */
  locationId: z.string().nullable(),
  prime: z.object({ status: PrimeStatus, until: IsoDateTime.nullable() }),
  createdAt: IsoDateTime,
});
export type Customer = z.infer<typeof Customer>;

/** Prime prices apply while the membership is active and not past its end (same rule as the backend's tier). */
export const isPrimeMember = (customer: Pick<Customer, "prime"> | null | undefined, now = new Date()): boolean =>
  customer?.prime.status === "active" && (!customer.prime.until || new Date(customer.prime.until) > now);

/** `POST /auth/otp/request` answer. The backend says how long the code lives, not how long to wait to resend. */
export const OtpRequested = z.object({ expiresIn: z.number().int().positive() });
export type OtpRequested = z.infer<typeof OtpRequested>;

/** An access token with its lifetime; what `/auth/refresh` returns. */
export const TokenGrant = z.object({ accessToken: z.string().min(1), expiresIn: z.number().int().positive() });
export type TokenGrant = z.infer<typeof TokenGrant>;

/** A signed-in session: the grant plus the customer. */
export const Session = TokenGrant.extend({ user: Customer });
export type Session = z.infer<typeof Session>;

/** The raw bodies of verify and signup, before the customer is attached. */
export const VerifySignedIn = TokenGrant.extend({ status: z.literal("signed_in"), customer: Customer });
export const VerifySignupRequired = z.object({
  status: z.literal("signup_required"),
  /** One-use proof that this phone was verified; valid as long as a code is. */
  signupToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
});
export const VerifyResponse = z.discriminatedUnion("status", [VerifySignedIn, VerifySignupRequired]);
export const SignupResponse = TokenGrant.extend({ customer: Customer });
export const CustomerEnvelope = z.object({ customer: Customer });

/** What verifying a code leads to: signed in, or a new customer who must give a name first. */
export type VerifyOutcome = { status: "signed_in"; session: Session } | { status: "signup_required"; signupToken: string; expiresIn: number };

export const ProfileUpdate = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.email().max(200).nullable().optional(),
  })
  .refine((update) => Object.keys(update).length > 0, { message: "Nothing to change" });
export type ProfileUpdate = z.infer<typeof ProfileUpdate>;

/** `PUT /me/location`: where the customer is served from. `locationId` looks like `village:64f1...`. */
export const LocationInput = z.object({
  locationId: z.string().regex(/^[a-z_]{3,20}:[A-Za-z0-9_-]{1,32}$/),
  addressLine: z.string().trim().min(1).max(300).optional(),
  pincode: Pincode.optional(),
});
export type LocationInput = z.infer<typeof LocationInput>;

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
