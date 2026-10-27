import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  Address,
  ApiErrorBody,
  Cart,
  CheckoutSession,
  Customer,
  OrderDetail,
  OtpChallenge,
  page,
  ProductDetail,
  ProductSummary,
  SearchQuery,
  Session,
  Variant,
} from "./index";

/** Paths of the issues a schema reports for `value` ("" for the root). */
function issuePaths(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

const brand = { id: "brd-1", slug: "femxo-select", name: "Femxo Select" };
const variant = {
  id: "var-1",
  sku: "FX-OIL-1L",
  label: "1 L",
  mrp: 19900,
  price: 18500,
  primePrice: 17200,
  gstBps: 500,
  stock: 18,
  maxPerOrder: 5,
  bestBefore: "2027-03-31",
};
const summary = {
  id: "prd-1",
  slug: "edible-oil-1l",
  name: "Edible oil 1 L",
  brand,
  categoryId: "cat-oil",
  image: "/products/prd-1.webp",
  rating: 4.3,
  ratingCount: 1284,
  fromPrice: 18500,
  variantId: "var-1",
  variantCount: 1,
  fromPrimePrice: 17200,
  mrp: 19900,
  inStock: true,
  primeExclusive: false,
  badges: ["Bestseller"],
};
const address = {
  id: "adr-1",
  name: "Pooja Kumari",
  mobile: "9876543210",
  line1: "House 12, Boring Road",
  city: "Patna",
  district: "Patna",
  state: "Bihar",
  pincode: "800001",
  isDefault: true,
};
const breakup = {
  mrpTotal: 19900,
  discount: 1400,
  primeSavings: 0,
  couponDiscount: 0,
  delivery: 4000,
  total: 22500,
  gstIncluded: { cgst: 440, sgst: 440 },
  youSave: 1400,
};
const line = { id: "line-1", product: summary, variant, quantity: 1, unitPrice: 18500, lineTotal: 18500, available: 18 };

describe("catalog contracts", () => {
  it("accept a valid variant, summary and detail", () => {
    expect(issuePaths(Variant, variant)).toEqual([]);
    expect(issuePaths(ProductSummary, summary)).toEqual([]);
    expect(
      issuePaths(ProductDetail, {
        ...summary,
        description: "Refined oil.",
        highlights: ["Cholesterol free"],
        images: [{ src: "/products/prd-1.webp", alt: "Edible oil 1 L bottle" }],
        variants: [variant],
        returnable: false,
        specs: [{ label: "Pack", value: "1 L bottle" }],
        breadcrumbs: [{ id: "cat-oil", slug: "edible-oil", name: "Edible oil" }],
      })
    ).toEqual([]);
  });

  it("reject a price above MRP, and a Prime price above the price", () => {
    expect(issuePaths(Variant, { ...variant, price: 20000 })).toContain("price");
    expect(issuePaths(Variant, { ...variant, primePrice: 19000 })).toContain("primePrice");
  });

  it("reject money that isn't integer paise", () => {
    expect(issuePaths(Variant, { ...variant, price: 185.5 })).toContain("price");
  });

  it("require at least one image and one variant", () => {
    const detail = { ...summary, description: "", highlights: [], images: [], variants: [], returnable: true, specs: [], breadcrumbs: [] };
    expect(issuePaths(ProductDetail, detail)).toEqual(expect.arrayContaining(["images", "variants"]));
  });
});

describe("search contract", () => {
  it("defaults the query and caps pages at 100", () => {
    const parsed = SearchQuery.parse({});
    expect(parsed).toMatchObject({ q: "", sort: "relevance", limit: 24, brand: [] });
    expect(issuePaths(SearchQuery, { limit: 101 })).toContain("limit");
  });
});

describe("pages", () => {
  it("wrap items with a nullable cursor", () => {
    const Products = page(ProductSummary);
    expect(issuePaths(Products, { items: [summary], nextCursor: null })).toEqual([]);
    expect(issuePaths(Products, { items: [summary] })).toContain("nextCursor");
  });
});

describe("account contracts", () => {
  it("accept a Bihar address and reject bad mobiles, pincodes and other states", () => {
    expect(issuePaths(Address, address)).toEqual([]);
    expect(issuePaths(Address, { ...address, mobile: "12345" })).toContain("mobile");
    expect(issuePaths(Address, { ...address, pincode: "80001" })).toContain("pincode");
    expect(issuePaths(Address, { ...address, state: "Delhi" })).toContain("state");
  });
});

describe("cart, checkout and order contracts", () => {
  it("accept a cart with lines and a price breakup", () => {
    expect(
      issuePaths(Cart, { id: "cart-1", lines: [line], coupon: null, breakup, itemCount: 1, expiresAt: "2026-10-31T10:00:00.000Z" })
    ).toEqual([]);
  });

  it("accept a checkout session before an address is chosen", () => {
    expect(
      issuePaths(CheckoutSession, { id: "chk-1", cartId: "cart-1", address: null, delivery: null, options: [], breakup, codAllowed: true })
    ).toEqual([]);
  });

  it("accept an order with its tracking timeline, and reject unknown statuses", () => {
    const order = {
      id: "ord-1",
      number: "FX-58231",
      placedAt: "2026-10-23T10:20:00.000Z",
      status: "shipped",
      paymentStatus: "paid",
      total: 22500,
      itemCount: 1,
      thumbnail: "/products/prd-1.webp",
      lines: [{ id: "line-1", product: summary, variant, quantity: 1, unitPrice: 18500, lineTotal: 18500, returnable: true }],
      breakup,
      address,
      paymentMethod: "upi",
      timeline: [
        { status: "placed", at: "2026-10-23T10:20:00.000Z" },
        { status: "shipped", at: "2026-10-24T08:00:00.000Z", note: "Left Patna WH" },
      ],
      canCancel: false,
      canReturnUntil: null,
      paymentRetryable: false,
    };
    expect(issuePaths(OrderDetail, order)).toEqual([]);
    expect(issuePaths(OrderDetail, { ...order, status: "teleported" })).toContain("status");
  });
});

describe("auth contracts", () => {
  it("accept an OTP challenge and a session", () => {
    expect(issuePaths(OtpChallenge, { requestId: "otp-1", resendAfterSeconds: 30, expiresInSeconds: 300 })).toEqual([]);
    const customer = { id: "cus-1", name: "Pooja Kumari", mobile: "9876543210", email: null, birthday: null, isPrime: false };
    expect(issuePaths(Customer, customer)).toEqual([]);
    expect(issuePaths(Session, { accessToken: "token", expiresIn: 900, user: customer, isNewUser: false })).toEqual([]);
  });
});

describe("error envelope", () => {
  it("matches the backend's { error: { code, message, details? } }", () => {
    expect(issuePaths(ApiErrorBody, { error: { code: "OUT_OF_STOCK", message: "Only 2 left", details: { available: 2 } } })).toEqual([]);
    expect(issuePaths(ApiErrorBody, { error: { code: "SOMETHING_ELSE", message: "x" } })).toContain("error.code");
  });
});
