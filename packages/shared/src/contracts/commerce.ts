import { z } from "zod";
import { ProductSummary, Variant } from "./catalog";
import { IsoDate, IsoDateTime, MobileNumber, Paise, Pincode } from "./common";

// ---------- Cart ----------

export const CartLine = z.object({
  id: z.string(),
  product: ProductSummary,
  variant: Variant,
  quantity: z.number().int().positive(),
  unitPrice: Paise,
  lineTotal: Paise,
  /** Stock available for this line right now. */
  available: z.number().int().nonnegative(),
});
export type CartLine = z.infer<typeof CartLine>;

export const PriceBreakup = z.object({
  mrpTotal: Paise,
  discount: Paise,
  primeSavings: Paise,
  couponDiscount: Paise,
  delivery: Paise,
  total: Paise,
  /** GST already inside the prices; intra-Bihar, so CGST + SGST. */
  gstIncluded: z.object({ cgst: Paise, sgst: Paise }),
  youSave: Paise,
});
export type PriceBreakup = z.infer<typeof PriceBreakup>;

/** Why a coupon was refused (the `reason` in a COUPON_INVALID error's details). */
export const CouponRefusal = z.enum(["not_found", "expired", "exhausted", "min_cart", "prime_only", "first_order_only"]);
export type CouponRefusal = z.infer<typeof CouponRefusal>;

export const Cart = z.object({
  id: z.string(),
  lines: z.array(CartLine),
  coupon: z.object({ code: z.string(), label: z.string() }).nullable(),
  breakup: PriceBreakup,
  itemCount: z.number().int().nonnegative(),
  /** Last change + 7 days. */
  expiresAt: IsoDateTime,
});
export type Cart = z.infer<typeof Cart>;

// ---------- Addresses ----------

export const Address = z.object({
  id: z.string(),
  name: z.string().trim().min(2).max(60),
  mobile: MobileNumber,
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(120).optional(),
  landmark: z.string().trim().max(80).optional(),
  city: z.string().trim().min(2).max(60),
  district: z.string().trim().min(2).max(60),
  /** Deliveries are within Bihar only. */
  state: z.literal("Bihar"),
  pincode: Pincode,
  isDefault: z.boolean(),
});
export type Address = z.infer<typeof Address>;

/** What the address form sends; the server assigns the id. */
export const AddressInput = Address.omit({ id: true, isDefault: true }).extend({ isDefault: z.boolean().default(false) });
export type AddressInput = z.input<typeof AddressInput>;

export const Serviceability = z.object({
  pincode: z.string(),
  serviceable: z.boolean(),
  district: z.string().nullable(),
  etaDays: z.object({ min: z.number().int(), max: z.number().int() }).nullable(),
  codAvailable: z.boolean(),
});
export type Serviceability = z.infer<typeof Serviceability>;

// ---------- Checkout and payment ----------

export const DeliveryOption = z.object({
  id: z.literal("standard"),
  label: z.string(),
  fee: Paise,
  etaDays: z.object({ min: z.number().int(), max: z.number().int() }),
});
export type DeliveryOption = z.infer<typeof DeliveryOption>;

export const PaymentMethod = z.enum(["upi", "card", "netbanking", "cod"]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const CheckoutSession = z.object({
  id: z.string(),
  cartId: z.string(),
  address: Address.nullable(),
  delivery: DeliveryOption.nullable(),
  options: z.array(DeliveryOption),
  breakup: PriceBreakup,
  /** Cash on delivery up to ₹2,000 and where the pincode allows it. */
  codAllowed: z.boolean(),
});
export type CheckoutSession = z.infer<typeof CheckoutSession>;

export const PaymentIntent = z.object({
  id: z.string(),
  orderId: z.string(),
  amount: Paise,
  status: z.enum(["created", "pending", "succeeded", "failed"]),
  attempt: z.number().int().positive(),
});
export type PaymentIntent = z.infer<typeof PaymentIntent>;

/** What the demo payment sheet reports back. */
export const PaymentOutcome = z.enum(["success", "failure", "pending"]);
export type PaymentOutcome = z.infer<typeof PaymentOutcome>;

// ---------- Orders ----------

export const OrderStatus = z.enum([
  "placed",
  "confirmed",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "delivery_failed",
  "return_requested",
  "returned",
  "refunded",
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const PaymentStatus = z.enum(["pending", "paid", "failed", "refunded", "cod"]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const TimelineEvent = z.object({ status: OrderStatus, at: IsoDateTime, note: z.string().optional() });
export type TimelineEvent = z.infer<typeof TimelineEvent>;

export const OrderSummary = z.object({
  id: z.string(),
  number: z.string(),
  placedAt: IsoDateTime,
  status: OrderStatus,
  paymentStatus: PaymentStatus,
  total: Paise,
  itemCount: z.number().int().positive(),
  thumbnail: z.string(),
  /** A Prime membership bought like an order; absent for ordinary orders. */
  kind: z.enum(["goods", "prime"]).optional(),
});
export type OrderSummary = z.infer<typeof OrderSummary>;

/** A line as ordered: what was bought, and whether it can be returned. */
export const OrderLine = CartLine.omit({ available: true }).extend({ returnable: z.boolean() });
export type OrderLine = z.infer<typeof OrderLine>;

export const OrderDetail = OrderSummary.extend({
  lines: z.array(OrderLine).min(1),
  breakup: PriceBreakup,
  address: Address,
  paymentMethod: PaymentMethod,
  timeline: z.array(TimelineEvent).min(1),
  canCancel: z.boolean(),
  /** End of the return window, or null when returns aren't possible. */
  canReturnUntil: IsoDate.nullable(),
  paymentRetryable: z.boolean(),
});
export type OrderDetail = z.infer<typeof OrderDetail>;

export const PlacedOrder = z.object({ order: OrderSummary, intent: PaymentIntent.nullable() });
export type PlacedOrder = z.infer<typeof PlacedOrder>;
