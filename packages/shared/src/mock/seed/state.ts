import type { Address, OrderStatus, PaymentMethod, PaymentStatus, Serviceability, TimelineEvent } from "../../contracts/commerce";
import type { Customer, Membership, PrimePlan, Referral } from "../../contracts/people";
import { createRng } from "../../lib/rng";
import { istDate, toProductSummary, toVariant } from "../domain/mappers";
import { priceLines } from "../domain/pricing";
import type { Catalog, MockState, StoredCoupon, StoredOrder } from "../domain/types";

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Same plans and prices as the admin panel's Prime plans. */
export const PRIME_PLANS: readonly PrimePlan[] = [
  { id: "pln-monthly", name: "Prime Monthly", price: 9900, durationDays: 30, benefits: ["Prime prices on every product", "Free delivery on all orders", "Member-only coupons"] },
  { id: "pln-quarterly", name: "Prime Quarterly", price: 26900, durationDays: 90, benefits: ["Prime prices on every product", "Free delivery on all orders", "Member-only coupons", "Birthday reward"] },
  { id: "pln-annual", name: "Prime Annual", price: 99900, durationDays: 365, benefits: ["Prime prices on every product", "Free delivery on all orders", "Member-only coupons", "Birthday reward", "Referral rewards"] },
];

/** Hindi and spelling variants the search treats as the same word. */
export const SEARCH_SYNONYMS: Record<string, string[]> = {
  atta: ["flour", "aata", "wheat"],
  aata: ["atta", "flour"],
  chawal: ["rice", "basmati"],
  tel: ["oil"],
  dal: ["lentils", "pulses", "daal"],
  namak: ["salt"],
  cheeni: ["sugar", "shakkar"],
  chai: ["tea"],
  biscuit: ["biscuits", "cookies"],
  sabun: ["soap"],
  ghee: ["clarified butter"],
  masala: ["spices", "spice"],
};

const DISTRICT_PINCODES: readonly (readonly [district: string, first: number, count: number])[] = [
  ["Patna", 800001, 12],
  ["Gaya", 823001, 5],
  ["Muzaffarpur", 842001, 5],
  ["Bhagalpur", 812001, 4],
  ["Darbhanga", 846004, 5],
  ["Purnia", 854301, 4],
  ["Saharsa", 852201, 3],
  ["Begusarai", 851101, 3],
  ["Purbi Champaran", 845401, 4],
  ["Saran", 841301, 3],
  ["Vaishali", 844101, 3],
  ["Bhojpur", 802301, 3],
  ["Nalanda", 803101, 3],
  ["Siwan", 841226, 3],
];
const UNSERVICEABLE = ["855107", "855101", "854105", "845438"];

function buildPincodes(): Record<string, Serviceability> {
  const pincodes: Record<string, Serviceability> = {};
  for (const [district, first, count] of DISTRICT_PINCODES) {
    for (let i = 0; i < count; i++) {
      const pincode = String(first + i);
      pincodes[pincode] = {
        pincode,
        serviceable: true,
        district,
        etaDays: district === "Patna" ? { min: 1, max: 2 } : { min: 2, max: 4 },
        codAvailable: i % 5 !== 4,
      };
    }
  }
  for (const pincode of UNSERVICEABLE) pincodes[pincode] = { pincode, serviceable: false, district: null, etaDays: null, codAvailable: false };
  return pincodes;
}

function buildCoupons(now: Date): Record<string, StoredCoupon> {
  const future = new Date(now.getTime() + 60 * DAY).toISOString();
  const base = { primeOnly: false, firstOrderOnly: false, usageLimit: null, used: 0, maxDiscount: null } as const;
  const coupons: StoredCoupon[] = [
    { ...base, code: "WELCOME100", label: "₹100 off your first order", kind: "flat", value: 10000, minCart: 49900, validTill: future, firstOrderOnly: true },
    { ...base, code: "FLAT50", label: "₹50 off orders above ₹299", kind: "flat", value: 5000, minCart: 29900, validTill: future },
    { ...base, code: "SAVE10", label: "10% off, up to ₹150", kind: "percent", value: 1000, minCart: 19900, maxDiscount: 15000, validTill: future },
    { ...base, code: "PRIME15", label: "Prime: 15% off, up to ₹200", kind: "percent", value: 1500, minCart: 29900, maxDiscount: 20000, primeOnly: true, validTill: future },
    { ...base, code: "OLD20", label: "20% off (expired)", kind: "percent", value: 2000, minCart: 19900, maxDiscount: 10000, validTill: new Date(now.getTime() - 30 * DAY).toISOString() },
    { ...base, code: "FEST25", label: "₹250 festive offer (fully used)", kind: "flat", value: 25000, minCart: 99900, validTill: future, usageLimit: 500, used: 500 },
  ];
  return Object.fromEntries(coupons.map((coupon) => [coupon.code, coupon]));
}

const CHAIN: OrderStatus[] = ["placed", "confirmed", "packed", "shipped", "out_for_delivery", "delivered"];
const PATHS: Record<OrderStatus, OrderStatus[]> = {
  placed: CHAIN.slice(0, 1),
  confirmed: CHAIN.slice(0, 2),
  packed: CHAIN.slice(0, 3),
  shipped: CHAIN.slice(0, 4),
  out_for_delivery: CHAIN.slice(0, 5),
  delivered: CHAIN,
  cancelled: ["placed", "cancelled"],
  delivery_failed: [...CHAIN.slice(0, 5), "delivery_failed"],
  return_requested: [...CHAIN, "return_requested"],
  returned: [...CHAIN, "return_requested", "returned"],
  refunded: [...CHAIN, "return_requested", "returned", "refunded"],
};
const NOTES: Partial<Record<OrderStatus, string>> = {
  shipped: "Left the Patna warehouse",
  out_for_delivery: "With the delivery partner",
  delivery_failed: "Nobody was available at the address",
};
const STATUSES = Object.keys(PATHS) as OrderStatus[];
const METHODS: PaymentMethod[] = ["upi", "card", "netbanking"];

/** Everything a shopper can change, as it starts in a fresh browser. */
export function buildInitialState(catalog: Catalog, now: Date): MockState {
  const rng = createRng(77);
  const today = istDate(now);
  const pincodes = buildPincodes();
  const servicePins = Object.values(pincodes).filter((pin) => pin.serviceable);

  const customers: Customer[] = [
    { id: "cus-new", name: "Aarav Singh", mobile: "9000000001", email: null, birthday: null, isPrime: false },
    { id: "cus-regular", name: "Rahul Verma", mobile: "9000000002", email: "rahul.v@demo.femxo.test", birthday: "1990-03-12", isPrime: false },
    { id: "cus-prime", name: "Pooja Kumari", mobile: "9000000003", email: "pooja.k@demo.femxo.test", birthday: `1992-${today.slice(5)}`, isPrime: true },
    { id: "cus-expired", name: "Md. Arif", mobile: "9000000004", email: null, birthday: "1985-07-30", isPrime: false },
    { id: "cus-email", name: "Kiran Singh", mobile: "9000000005", email: "kiran.s@demo.femxo.test", birthday: null, isPrime: false },
  ];

  const addresses: Record<string, Address[]> = {};
  customers.forEach((customer, index) => {
    const pin = servicePins[index * 7 % servicePins.length]!;
    addresses[customer.id] = [
      {
        id: `adr-${customer.id}`,
        name: customer.name,
        mobile: customer.mobile,
        line1: `House ${12 + index * 5}, Station Road`,
        city: pin.district!,
        district: pin.district!,
        state: "Bihar",
        pincode: pin.pincode,
        isDefault: true,
      },
    ];
  });

  const memberships: Record<string, Membership> = {
    "cus-prime": {
      memberId: "FXP-000231",
      plan: PRIME_PLANS[2]!,
      startedAt: new Date(now.getTime() - 120 * DAY).toISOString(),
      validTill: new Date(now.getTime() + 245 * DAY).toISOString(),
      qrPayload: "femxo:prime:FXP-000231",
    },
    "cus-expired": {
      memberId: "FXP-000118",
      plan: PRIME_PLANS[0]!,
      startedAt: new Date(now.getTime() - 70 * DAY).toISOString(),
      validTill: new Date(now.getTime() - 40 * DAY).toISOString(),
      qrPayload: "femxo:prime:FXP-000118",
    },
  };
  const referrals: Record<string, Referral> = {
    "cus-prime": { code: "POOJA50", link: "https://shop.femxo.in/join?ref=POOJA50", invited: 9, joined: 4, rewardsEarned: 20000 },
  };

  const orders: Record<string, StoredOrder> = {};
  const buyers = ["cus-regular", "cus-prime", "cus-email", "cus-expired"];
  const buyable = catalog.products.filter((product) => product.variants.some((variant) => variant.stock > 3));
  for (let i = 0; i < 40; i++) {
    const status = STATUSES[i % STATUSES.length]!;
    const customerId = buyers[i % buyers.length]!;
    const member = customerId === "cus-prime";
    const picked = rng.shuffle(buyable).slice(0, rng.int(1, 3));
    const lines = picked.map((product, index) => {
      const seedVariant = product.variants.find((variant) => variant.stock > 3)!;
      const quantity = rng.int(1, 3);
      const unitPrice = member ? seedVariant.primePrice : seedVariant.price;
      return {
        id: `ordline-${i + 1}-${index + 1}`,
        product: toProductSummary(product, catalog),
        variant: toVariant(seedVariant, now),
        quantity,
        unitPrice,
        lineTotal: unitPrice * quantity,
        seedVariant,
      };
    });
    const breakup = priceLines(lines.map((line) => ({ ...line.seedVariant, quantity: line.quantity })), { member });
    const placedMs = now.getTime() - (i + 1) * 20 * HOUR - (status === "placed" ? 0 : 3 * DAY);
    const online = i % 5 !== 0;
    const method: PaymentMethod = online ? METHODS[i % METHODS.length]! : "cod";
    const money = ((): PaymentStatus => {
      if (!online) return status === "refunded" || status === "returned" ? "refunded" : "cod";
      if (status === "placed") return i % 2 === 0 ? "failed" : "pending";
      if (status === "cancelled" || status === "refunded" || status === "returned") return "refunded";
      return "paid";
    })();
    const path = PATHS[status];
    const timeline: TimelineEvent[] = path.map((step, index) => ({
      status: step,
      at: new Date(placedMs + index * 9 * HOUR).toISOString(),
      ...(NOTES[step] ? { note: NOTES[step] } : {}),
    }));
    const deliveredAt = timeline.find((event) => event.status === "delivered")?.at;
    const allReturnable = picked.every((product) => product.returnable);
    const address = addresses[customerId]![0]!;
    orders[`ord-${i + 1}`] = {
      id: `ord-${i + 1}`,
      customerId,
      number: `FX-${58100 + i}`,
      placedAt: new Date(placedMs).toISOString(),
      status,
      paymentStatus: money,
      total: breakup.total,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      thumbnail: lines[0]!.product.image,
      lines: lines.map(({ seedVariant: _seed, ...line }) => line),
      breakup,
      address,
      paymentMethod: method,
      timeline,
      canCancel: status === "placed" || status === "confirmed",
      canReturnUntil: status === "delivered" && deliveredAt && allReturnable ? new Date(Date.parse(deliveredAt) + 7 * DAY).toISOString().slice(0, 10) : null,
      paymentRetryable: online && status === "placed" && (money === "failed" || money === "pending"),
    };
  }

  return {
    customers,
    credentials: { "cus-email": { email: "kiran.s@demo.femxo.test", password: "Demo@12345" } },
    addresses,
    orders,
    memberships,
    referrals,
    coupons: buildCoupons(now),
    pincodes,
    wishlists: {},
    tickets: {},
    stock: {},
    carts: {},
    otp: { challenges: {}, byMobile: {} },
    sessions: {},
    refreshCookie: null,
  };
}
