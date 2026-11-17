import { describe, expect, it, vi } from "vitest";
import type { ApiAdapter, ApiRequest, ApiResponse } from "./adapter";
import { createAddressApi } from "./address-api";
import { createCartApi, toCart } from "./cart-api";
import { isApiError } from "./errors";
import { userMessage } from "./error-messages";
import { createOrdersApi } from "./orders-api";
import { createPrimeApi } from "./prime-api";
import { createWishlistApi } from "./wishlist-api";

const reply = (...responses: ApiResponse[]) => {
  const send = vi.fn<(req: ApiRequest) => Promise<ApiResponse>>();
  for (const r of responses) send.mockResolvedValueOnce(r);
  return { adapter: { send } satisfies ApiAdapter, send };
};
const err = (status: number, code: string, message = "m") => ({ status, body: { error: { code, message } } });

const serverLine = (over = {}) => ({
  variantId: "v1",
  productId: "p1",
  quantity: 2,
  unitPricePaise: 5000,
  linePaise: 10000,
  gstRateBp: 500,
  problem: null,
  priceChanged: false,
  previousUnitPricePaise: null,
  inStock: true,
  availableQty: 4,
  sufficient: true,
  ...over,
});
const serverCart = (over = {}) => ({
  rev: 3,
  tier: "selling",
  items: [serverLine()],
  subtotalPaise: 10000,
  deliveryChargePaise: 0,
  totalPaise: 10000,
  hasPriceChange: false,
  hasStockIssue: false,
  canCheckout: true,
  expiresAt: null,
  ...over,
});

describe("toCart", () => {
  it("joins the server cart with catalogue details and keeps the server's prices", () => {
    const lookup = {
      products: [{ id: "p1", name: "Rice" } as never],
      variants: { v1: { productId: "p1", variant: { id: "v1", label: "5 kg", mrp: 6000, price: 5000 } as never } },
    };
    const cart = toCart(serverCart(), lookup);
    expect(cart).toMatchObject({ rev: 3, itemCount: 2, subtotal: 10000, total: 10000, canCheckout: true });
    expect(cart.lines[0]).toMatchObject({ variantId: "v1", unitPrice: 5000, lineTotal: 10000, available: 4, product: { name: "Rice" }, variant: { label: "5 kg" } });
  });

  it("copes with a line the catalogue doesn't know, and carries price-change and stock flags", () => {
    const cart = toCart(serverCart({ items: [serverLine({ priceChanged: true, previousUnitPricePaise: 4500, sufficient: false, availableQty: 1 })], hasPriceChange: true, canCheckout: false }), null);
    expect(cart.lines[0]).toMatchObject({ product: null, variant: null, priceChanged: true, previousUnitPrice: 4500, sufficient: false, available: 1 });
    expect(cart.hasPriceChange).toBe(true);
    expect(cart.canCheckout).toBe(false);
  });
});

describe("CartApi", () => {
  const catalog = { lookup: vi.fn(async () => ({ products: [], variants: {} })) };

  it("PUTs the whole cart with the revision it last saw", async () => {
    const { adapter, send } = reply({ status: 200, body: { cart: serverCart({ rev: 4 }) } });
    const cart = await createCartApi(adapter, catalog).replace([{ variantId: "v1", quantity: 3 }], 3);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ method: "PUT", path: "/store/v1/cart", body: { items: [{ variantId: "v1", quantity: 3 }], rev: 3 } }));
    expect(cart.rev).toBe(4);
  });

  it("still returns the cart when the catalogue lookup fails", async () => {
    const { adapter } = reply({ status: 200, body: { cart: serverCart() } });
    const broken = { lookup: vi.fn(async () => Promise.reject(new Error("down"))) };
    await expect(createCartApi(adapter, broken).get()).resolves.toMatchObject({ itemCount: 2 });
  });

  it("surfaces CART_CHANGED as an ApiError the caller can branch on", async () => {
    const { adapter } = reply(err(409, "CART_CHANGED"));
    const error = await createCartApi(adapter, catalog).replace([], 1).catch((e) => e);
    expect(isApiError(error, "CART_CHANGED")).toBe(true);
  });
});

const order = {
  id: "o1",
  orderNumber: "FX-1",
  status: "pending_payment",
  displayStatus: "awaiting_payment",
  paymentMethod: "online",
  paymentStatus: "pending",
  subtotalPaise: 10000,
  deliveryChargePaise: 0,
  totalPaise: 10000,
  itemCount: 2,
  placedAt: "2026-11-17T10:00:00.000Z",
  confirmedAt: null,
  expiresAt: "2026-11-17T10:30:00.000Z",
  cancelReason: null,
  shipping: { name: "A", phone: "9876543210", line1: "x", line2: null, landmark: null, pincode: "801103", locationId: "village:1", territoryPath: ["state:10"] },
  providerOrderId: "order_X",
};

describe("OrdersApi", () => {
  it("checks out with exactly the fields the server accepts, and the caller's Idempotency-Key", async () => {
    const { adapter, send } = reply({ status: 201, body: { order, items: [], payment: { providerOrderId: "order_X", keyId: "rzp_test_x", status: "pending", amountPaise: 10000, expiresAt: order.expiresAt }, replayed: false } });
    const result = await createOrdersApi(adapter).checkout({ addressId: "a1", paymentMethod: "online", cartRev: 3, expectedTotalPaise: 10000 }, "key-123456");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST", path: "/store/v1/checkout", idempotencyKey: "key-123456", body: { addressId: "a1", paymentMethod: "online", cartRev: 3, expectedTotalPaise: 10000 } })
    );
    expect(result.payment?.keyId).toBe("rzp_test_x");
    expect(result.replayed).toBe(false);
  });

  it("treats a replayed checkout (same key) as the same order", async () => {
    const { adapter } = reply({ status: 200, body: { order, items: [], payment: null, replayed: true } });
    await expect(createOrdersApi(adapter).checkout({ addressId: "a1", paymentMethod: "cod", cartRev: 3 }, "key-123456")).resolves.toMatchObject({ replayed: true });
  });

  it("verifies a payment with the three Razorpay fields and reads it back by id", async () => {
    const pay = { id: "pay1", purpose: "order", amountPaise: 10000, status: "captured", providerOrderId: "order_X" };
    const { adapter, send } = reply({ status: 200, body: { payment: pay, confirmed: true } }, { status: 200, body: { payment: pay } });
    const api = createOrdersApi(adapter);
    const success = { razorpay_order_id: "order_X", razorpay_payment_id: "pay_Y", razorpay_signature: "sig" };
    await expect(api.verifyPayment(success)).resolves.toMatchObject({ confirmed: true });
    expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ path: "/store/v1/payments/verify", body: success }));
    await expect(api.payment("pay1")).resolves.toMatchObject({ status: "captured" });
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ method: "GET", path: "/store/v1/payments/pay1" }));
  });

  it("asks to pay again through /orders/:id/pay", async () => {
    const { adapter, send } = reply({ status: 200, body: { payment: { providerOrderId: "order_X", keyId: "rzp_test_x", status: "pending", amountPaise: 10000, expiresAt: null } } });
    await expect(createOrdersApi(adapter).pay("o1")).resolves.toMatchObject({ providerOrderId: "order_X" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/store/v1/orders/o1/pay" }));
  });

  it("cancels with a key and reads the page of orders with a status filter", async () => {
    const { adapter, send } = reply({ status: 200, body: { order: { ...order, status: "cancelled", displayStatus: "cancelled" }, cancelled: true, replayed: false } }, { status: 200, body: { items: [order], nextCursor: null } });
    const api = createOrdersApi(adapter);
    await api.cancel("o1", "cancel-key-1", "changed my mind");
    expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ path: "/store/v1/orders/o1/cancel", idempotencyKey: "cancel-key-1", body: { reason: "changed my mind" } }));
    await api.list({ status: "pending_payment" });
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ path: "/store/v1/orders", query: expect.objectContaining({ status: "pending_payment" }) }));
  });

  it("rejects a response that breaks the contract instead of showing it", async () => {
    const { adapter } = reply({ status: 200, body: { order: { id: "o1" }, items: [], payment: null, replayed: false } });
    await expect(createOrdersApi(adapter).checkout({ addressId: "a1", paymentMethod: "cod", cartRev: 1 }, "key-123456")).rejects.toMatchObject({ code: "INTERNAL" });
  });
});

describe("PrimeApi, WishlistApi, AddressApi", () => {
  it("lists plans, reads the membership and buys with the idempotency key in the body", async () => {
    const plan = { id: "pl1", name: "Prime", pricePaise: 29900, durationDays: 90, benefits: ["Member prices"] };
    const payment = { id: "pay1", purpose: "membership", amountPaise: 29900, status: "created", providerOrderId: "order_P", keyId: "rzp_test_x" };
    const { adapter, send } = reply({ status: 200, body: { items: [plan] } }, { status: 200, body: { isPrime: false, subscription: null } }, { status: 201, body: { payment, plan } });
    const api = createPrimeApi(adapter);
    await expect(api.plans()).resolves.toHaveLength(1);
    await expect(api.membership()).resolves.toMatchObject({ isPrime: false });
    const purchase = await api.purchase("pl1", "buy-key-0001");
    expect(send).toHaveBeenNthCalledWith(3, expect.objectContaining({ path: "/store/v1/membership/purchase", body: { planId: "pl1", idempotencyKey: "buy-key-0001" } }));
    expect(purchase.payment.keyId).toBe("rzp_test_x");
  });

  it("replaces and removes wishlist entries", async () => {
    const entry = { productId: "p1", variantId: null, addedAt: "2026-11-17T10:00:00.000Z" };
    const { adapter, send } = reply({ status: 200, body: { items: [entry] } }, { status: 200, body: { items: [] } });
    const api = createWishlistApi(adapter);
    await api.replace([{ productId: "p1" }]);
    expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ method: "PUT", path: "/store/v1/me/wishlist", body: { items: [{ productId: "p1" }] } }));
    await api.remove("p1");
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ method: "DELETE", query: { productId: "p1" } }));
  });

  it("creates an address with its key and looks up a pincode", async () => {
    const address = { id: "a1", label: null, name: "A", phone: "9876543210", line1: "x", line2: null, landmark: null, pincode: "801103", locationId: "village:1", isDefault: true, createdAt: "2026-11-17T10:00:00.000Z" };
    const { adapter, send } = reply({ status: 201, body: { address, replayed: false } }, { status: 200, body: { pincode: "801103", known: true, serviceable: true, locations: [{ id: "village:1", type: "village", name: "Bihta", serviceable: true, coverage: "district" }] } });
    const api = createAddressApi(adapter);
    await expect(api.create({ name: "A", phone: "9876543210", line1: "x", pincode: "801103", locationId: "village:1" }, "addr-key-001")).resolves.toMatchObject({ id: "a1" });
    expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ idempotencyKey: "addr-key-001", path: "/store/v1/addresses" }));
    await expect(api.serviceability("801103")).resolves.toMatchObject({ serviceable: true });
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ path: "/store/v1/serviceability", query: { pincode: "801103" } }));
  });
});

describe("userMessage for the checkout and payment codes", () => {
  it.each([
    ["CART_CHANGED", /cart changed/i],
    ["PRICE_CHANGED", /price changed/i],
    ["INSUFFICIENT_STOCK", /enough stock/i],
    ["ADDRESS_NOT_SERVICEABLE", /don't deliver/i],
    ["COD_NOT_AVAILABLE", /cash on delivery/i],
    ["COD_NOT_ELIGIBLE", /cash-on-delivery/i],
    ["PAYMENT_WINDOW_LAPSED", /run out/i],
    ["PAYMENT_PROVIDER_UNAVAILABLE", /try paying again/i],
    ["ORDER_NOT_CANCELLABLE", /can't be cancelled/i],
    ["NOT_A_BUYER", /received/i],
    ["CHECKOUT_NOT_CONFIGURED", /isn't switched on/i],
  ])("%s has our own wording", async (code, pattern) => {
    const { adapter } = reply(err(code === "PAYMENT_PROVIDER_UNAVAILABLE" ? 502 : 409, code, "developer text"));
    const error = await createCartApi(adapter, { lookup: async () => ({ products: [], variants: {} }) }).get().catch((e) => e);
    expect(userMessage(error)).toMatch(pattern);
    expect(userMessage(error)).not.toMatch(/developer text/);
  });
});
