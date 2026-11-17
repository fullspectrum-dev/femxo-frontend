import { z } from "zod";
import { ProductSummary, Variant } from "./catalog";
import { Cursor, MobileNumber, Paise, Pincode } from "./common";

/*
 * The customer-commerce contracts of femxo-backend's /store/v1 (ADR 0020, 0021): cart, addresses, checkout,
 * orders, payments, Prime, reviews. The "Server*" schemas are wire shapes; the plain interfaces are what the UI uses
 * (the cart, for instance, is joined with catalogue details the backend's cart does not carry).
 * Money is integer paise. The server prices everything: no request here carries a price.
 */

// ---------- Cart ----------

export const ServerCartLine = z.object({
  variantId: z.string(),
  productId: z.string().nullable(),
  quantity: z.number().int().positive(),
  unitPricePaise: z.number().int().nullable(),
  linePaise: z.number().int().nullable(),
  gstRateBp: z.number().int().nullable().optional(),
  /** VARIANT_NOT_FOUND, VARIANT_UNAVAILABLE or PRICE_NOT_SET when the line cannot be sold. */
  problem: z.string().nullable(),
  priceChanged: z.boolean(),
  previousUnitPricePaise: z.number().int().nullable(),
  /** Null when the stock lookup failed: the cart is then shown without stock flags. */
  inStock: z.boolean().nullable(),
  availableQty: z.number().int().nonnegative().nullable(),
  sufficient: z.boolean().nullable(),
});
export type ServerCartLine = z.infer<typeof ServerCartLine>;

export const ServerCart = z.object({
  rev: z.number().int().nonnegative(),
  tier: z.string(),
  items: z.array(ServerCartLine),
  subtotalPaise: z.number().int(),
  deliveryChargePaise: z.number().int(),
  totalPaise: z.number().int(),
  hasPriceChange: z.boolean(),
  hasStockIssue: z.boolean(),
  canCheckout: z.boolean(),
  expiresAt: z.string().nullable(),
});
export const CartEnvelope = z.object({ cart: ServerCart });

/** A cart line joined with its catalogue entry. `product` / `variant` are null for an item the catalogue snapshot does not know. */
export interface CartLine {
  /** The variant id: a cart has one line per variant. */
  id: string;
  variantId: string;
  productId: string | null;
  product: ProductSummary | null;
  variant: Variant | null;
  quantity: number;
  /** Null when the line can't be priced (see `problem`). */
  unitPrice: number | null;
  lineTotal: number | null;
  priceChanged: boolean;
  previousUnitPrice: number | null;
  problem: string | null;
  /** How many can be had now (capped by the server's display limit); null when unknown. */
  available: number | null;
  inStock: boolean | null;
  sufficient: boolean | null;
}

export interface Cart {
  rev: number;
  tier: string;
  lines: CartLine[];
  itemCount: number;
  subtotal: number;
  delivery: number;
  total: number;
  hasPriceChange: boolean;
  hasStockIssue: boolean;
  canCheckout: boolean;
  expiresAt: string | null;
}

/** What `PUT /cart` takes: one entry per variant. */
export interface CartEntry {
  variantId: string;
  quantity: number;
}

// ---------- Addresses ----------

export const Address = z.object({
  id: z.string(),
  label: z.string().nullable(),
  name: z.string(),
  phone: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  landmark: z.string().nullable(),
  pincode: z.string(),
  locationId: z.string(),
  isDefault: z.boolean(),
  createdAt: z.string(),
});
export type Address = z.infer<typeof Address>;

export const AddressBook = z.object({ items: z.array(Address), max: z.number().int().positive().optional() });
export type AddressBook = z.infer<typeof AddressBook>;

/** What the address form sends. The pincode must belong to the chosen location, and we must deliver there. */
export const AddressInput = z.object({
  label: z.string().trim().max(40).nullable().optional(),
  name: z.string().trim().min(1, "Enter the name").max(100),
  phone: MobileNumber,
  line1: z.string().trim().min(1, "Enter the house, street or village").max(200),
  line2: z.string().trim().max(200).nullable().optional(),
  landmark: z.string().trim().max(100).nullable().optional(),
  pincode: Pincode,
  locationId: z.string().regex(/^[a-z_]{3,20}:[A-Za-z0-9_-]{1,32}$/, "Choose where we deliver"),
  isDefault: z.boolean().optional(),
});
export type AddressInput = z.input<typeof AddressInput>;

// ---------- Locations and serviceability ----------

export const Location = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  kind: z.string().optional(),
  pincode: z.string().optional(),
  breadcrumb: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
});
export type Location = z.infer<typeof Location>;

export const LocationList = z.object({ mode: z.enum(["children", "pincode", "search"]), items: z.array(Location) });
export type LocationList = z.infer<typeof LocationList>;

export const Serviceability = z.object({
  pincode: z.string(),
  known: z.boolean(),
  serviceable: z.boolean(),
  locations: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      name: z.string(),
      serviceable: z.boolean(),
      coverage: z.enum(["sub_dealer", "district", "state"]).nullable(),
    })
  ),
});
export type Serviceability = z.infer<typeof Serviceability>;

// ---------- Orders and payments ----------

export const PaymentMethod = z.enum(["cod", "online"]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

/** The stored status of an order (ADR 0020). `displayStatus` is what to show. */
export const OrderStatus = z.enum(["pending_approval", "pending_payment", "payment_failed", "placed", "cancelled", "completed"]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const OrderPaymentStatus = z.enum(["none", "pending", "captured", "failed"]);
export type OrderPaymentStatus = z.infer<typeof OrderPaymentStatus>;

export const Shipping = z.object({
  name: z.string(),
  phone: z.string(),
  line1: z.string(),
  line2: z.string().nullable().optional(),
  landmark: z.string().nullable().optional(),
  pincode: z.string(),
  locationId: z.string().optional(),
});
export type Shipping = z.infer<typeof Shipping>;

export const Order = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: OrderStatus,
  /** awaiting_payment, payment_expired, payment_failed, awaiting_approval, confirmed, partially_delivered, delivered, cancelled. */
  displayStatus: z.string(),
  paymentMethod: PaymentMethod.nullable(),
  paymentStatus: OrderPaymentStatus,
  subtotalPaise: Paise,
  deliveryChargePaise: Paise,
  totalPaise: Paise,
  itemCount: z.number().int().nonnegative(),
  placedAt: z.string(),
  confirmedAt: z.string().nullable(),
  /** When an unpaid online order lapses. */
  expiresAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  shipping: Shipping.nullable(),
  providerOrderId: z.string().nullable().optional(),
});
export type Order = z.infer<typeof Order>;

export const OrderPage = z.object({ items: z.array(Order), nextCursor: Cursor });

export const OrderItem = z.object({
  lineNo: z.number().int(),
  variantId: z.string(),
  productId: z.string(),
  quantity: z.number().int().positive(),
  unitPricePaise: Paise,
  gstRateBp: z.number().int().nonnegative(),
  linePaise: Paise,
  units: z
    .object({ ordered: z.number(), delivered: z.number(), undelivered: z.number(), cancelled: z.number(), returned: z.number(), requested: z.number() })
    .nullable(),
});
export type OrderItem = z.infer<typeof OrderItem>;

/** What Razorpay Checkout needs to open: only present for an online order that still waits for payment. */
export const PaymentOrder = z.object({
  providerOrderId: z.string().nullable(),
  keyId: z.string().nullable(),
  status: z.string(),
  amountPaise: Paise,
  expiresAt: z.string().nullable(),
});
export type PaymentOrder = z.infer<typeof PaymentOrder>;

export const TimelineEntry = z.object({
  type: z.string(),
  at: z.string(),
  actor: z.string().optional(),
  detail: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type TimelineEntry = z.infer<typeof TimelineEntry>;

export const OrderDetail = z.object({
  order: Order,
  items: z.array(OrderItem),
  payment: PaymentOrder.nullable(),
  cancellable: z.boolean(),
  timeline: z.array(TimelineEntry),
});
export type OrderDetail = z.infer<typeof OrderDetail>;

/** `POST /checkout`: the order, and (online) the Razorpay order to pay. `replayed` is true when the same Idempotency-Key was seen before. */
export const CheckoutResult = z.object({
  order: Order,
  items: z.array(OrderItem),
  payment: PaymentOrder.nullable(),
  replayed: z.boolean(),
});
export type CheckoutResult = z.infer<typeof CheckoutResult>;

export const CancelResult = z.object({
  order: Order,
  items: z.array(OrderItem).optional(),
  payment: PaymentOrder.nullable().optional(),
  replayed: z.boolean().optional(),
  cancelled: z.boolean().optional(),
});
export type CancelResult = z.infer<typeof CancelResult>;

export const PayAgainResult = z.object({ payment: PaymentOrder });

export const PaymentStatus = z.enum(["created", "authorized", "captured", "failed", "expired", "partially_refunded", "refunded"]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

/** One payment of ours (the id is what `GET /payments/:id` polls). */
export const Payment = z.object({
  id: z.string(),
  reference: z.string().optional(),
  purpose: z.enum(["order", "membership"]),
  orderId: z.string().nullable().optional(),
  amountPaise: Paise,
  currency: z.string().optional(),
  status: PaymentStatus,
  providerOrderId: z.string(),
  providerPaymentId: z.string().nullable().optional(),
  capturedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});
export type Payment = z.infer<typeof Payment>;

export const PaymentEnvelope = z.object({ payment: Payment });
export const VerifyResult = z.object({ payment: Payment, confirmed: z.boolean() });
export type VerifyResult = z.infer<typeof VerifyResult>;

/** What Razorpay's Checkout hands its success handler. */
export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

// ---------- Prime ----------

export const PrimePlan = z.object({
  id: z.string(),
  name: z.string(),
  pricePaise: Paise,
  durationDays: z.number().int().positive(),
  benefits: z.array(z.string()),
});
export type PrimePlan = z.infer<typeof PrimePlan>;

export const PrimeMembership = z.object({
  isPrime: z.boolean(),
  subscription: z
    .object({ id: z.string(), planId: z.string(), planName: z.string(), startAt: z.string(), endAt: z.string(), pricePaise: Paise })
    .nullable(),
});
export type PrimeMembership = z.infer<typeof PrimeMembership>;

/** `POST /membership/purchase`: the payment intent (open Checkout with providerOrderId and keyId) and the plan being bought. */
export const PrimePurchase = z.object({
  payment: Payment.extend({ keyId: z.string() }),
  plan: PrimePlan,
});
export type PrimePurchase = z.infer<typeof PrimePurchase>;

// ---------- Wishlist and reviews ----------

export const WishlistEntry = z.object({ productId: z.string(), variantId: z.string().nullable(), addedAt: z.string() });
export type WishlistEntry = z.infer<typeof WishlistEntry>;
export const WishlistEnvelope = z.object({ items: z.array(WishlistEntry) });

export const Review = z.object({
  id: z.string(),
  productId: z.string(),
  rating: z.number().int().min(1).max(5),
  title: z.string(),
  body: z.string(),
  authorName: z.string(),
  createdAt: z.string(),
});
export type Review = z.infer<typeof Review>;

export const ReviewSummary = z.object({
  count: z.number().int().nonnegative(),
  average: z.number().min(0).max(5),
  distribution: z.object({ "1": z.number(), "2": z.number(), "3": z.number(), "4": z.number(), "5": z.number() }),
});
export type ReviewSummary = z.infer<typeof ReviewSummary>;

export const ReviewList = z.object({ summary: ReviewSummary, items: z.array(Review), nextCursor: Cursor });
export type ReviewList = z.infer<typeof ReviewList>;

export const ReviewInput = z.object({
  rating: z.number().int().min(1, "Choose a rating").max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(3, "Write at least a few words").max(2000),
});
export type ReviewInput = z.input<typeof ReviewInput>;

// ---------- Sign-in settings ----------

export const AuthConfig = z.object({
  otp: z.object({
    enabled: z.boolean(),
    length: z.number().int().nullable(),
    resendCooldownSeconds: z.number().int().nullable(),
    validitySeconds: z.number().int().nullable(),
    maxAttempts: z.number().int().nullable(),
  }),
});
export type AuthConfig = z.infer<typeof AuthConfig>;
