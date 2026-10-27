import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockBackend } from "../mock/backend";
import type { SeedVariant } from "../mock/domain/types";
import { createAddressApi } from "./address-api";
import { createAuthApi } from "./auth-api";
import { createCartApi } from "./cart-api";
import { createCheckoutApi } from "./checkout-api";
import { createPaymentApi } from "./payment-api";
import { withAuth } from "./with-auth";

const NOW = Date.UTC(2026, 9, 24, 5, 0);

let token: string | undefined;
let backend: ReturnType<typeof createMockBackend>;
let auth: ReturnType<typeof createAuthApi>;
let cart: ReturnType<typeof createCartApi>;
let checkout: ReturnType<typeof createCheckoutApi>;
let payments: ReturnType<typeof createPaymentApi>;
let addresses: ReturnType<typeof createAddressApi>;

beforeEach(() => {
  token = undefined;
  backend = createMockBackend({ storage: "memory", latency: false, realNow: () => NOW });
  const adapter = withAuth(backend.adapter, () => token);
  auth = createAuthApi(adapter);
  cart = createCartApi(adapter);
  checkout = createCheckoutApi(adapter);
  payments = createPaymentApi(adapter);
  addresses = createAddressApi(adapter);
});

/** A regular (non-Prime) customer with an address, so prices and delivery fee are the plain ones. */
async function signIn(mobile = "9000000002") {
  const challenge = await auth.requestOtp(mobile);
  token = (await auth.verifyOtp(challenge.requestId, "123456")).accessToken;
}

const variants = () => backend.catalog.products.flatMap((product) => product.variants).filter((entry) => entry.stock >= 50 && entry.maxPerOrder >= 5);
const priced = (min: number, max = Infinity) => variants().find((entry) => entry.price >= min && entry.price < max)!;

async function stockOf(variant: SeedVariant) {
  return (await backend.store.load()).stock[variant.id] ?? variant.stock;
}

/** A cart worth ordering, a checkout with the default address and delivery chosen. */
async function readyToOrder(variant = priced(20000, 100000), quantity = 2) {
  await signIn();
  await cart.add(variant.id, quantity);
  const session = await checkout.start();
  return { variant, session: await checkout.update(session.id, { deliveryId: "standard" }) };
}

describe("starting a checkout", () => {
  it("is for signed-in customers with something in the cart", async () => {
    await expect(checkout.start()).rejects.toMatchObject({ status: 401 });
    await signIn();
    await expect(checkout.start()).rejects.toMatchObject({ status: 422, code: "VALIDATION_FAILED" });
  });

  it("preselects the default address, and shows the cart's bill", async () => {
    await signIn();
    await cart.add(priced(20000, 100000).id, 2);
    const session = await checkout.start();
    const [home] = await addresses.list();
    expect(session.address).toEqual(home);
    expect(session.delivery).toBeNull();
    expect(session.options).toHaveLength(1);
    expect(session.options[0]).toMatchObject({ id: "standard", fee: session.breakup.delivery });
    expect(session.breakup.total).toBe((await cart.get()).breakup.total);
  });

  it("lets cash on delivery through up to ₹2,000, where the pincode allows it", async () => {
    await signIn();
    await cart.add(priced(20000, 60000).id, 1);
    const small = await checkout.start();
    expect(small.codAllowed).toBe(small.breakup.total <= 200000 && (await backendCodAllowed(small.address!.pincode)));
    await cart.add(priced(60000).id, 5).catch(() => cart.add(priced(60000).id, 1));
    // A big order never goes cash on delivery.
    const bigCart = await cart.get();
    if (bigCart.breakup.total > 200000) expect((await checkout.start()).codAllowed).toBe(false);
  });

  it("changes the address and the delivery, and refuses an address that isn't the customer's", async () => {
    const { session } = await readyToOrder();
    expect(session.delivery).toMatchObject({ id: "standard" });
    await expect(checkout.update(session.id, { addressId: "adr-nope" })).rejects.toMatchObject({ status: 404 });
    const created = await addresses.create({
      name: "Asha Devi",
      mobile: "9111111111",
      line1: "12 Boring Road",
      city: "Patna",
      district: "Patna",
      state: "Bihar",
      pincode: "800001",
      isDefault: false,
    });
    const other = created.find((entry) => entry.line1 === "12 Boring Road")!;
    expect((await checkout.update(session.id, { addressId: other.id })).address).toEqual(other);
  });
});

async function backendCodAllowed(pincode: string) {
  return (await backend.store.load()).pincodes[pincode]!.codAvailable;
}

describe("placing an order", () => {
  it("needs a delivery option, and an address", async () => {
    await signIn();
    await cart.add(priced(20000, 100000).id, 1);
    const session = await checkout.start();
    await expect(checkout.placeOrder(session.id, "upi")).rejects.toMatchObject({ status: 422, code: "VALIDATION_FAILED" });
  });

  it("places a cash-on-delivery order: confirmed at once, stock taken, cart emptied", async () => {
    const { variant, session } = await readyToOrder(priced(20000, 60000), 1);
    expect(session.codAllowed).toBe(true);
    const before = await stockOf(variant);
    const { order, intent } = await checkout.placeOrder(session.id, "cod");
    expect(intent).toBeNull();
    expect(order).toMatchObject({ status: "confirmed", paymentStatus: "cod", total: session.breakup.total, itemCount: 1 });
    expect(await stockOf(variant)).toBe(before - 1);
    expect((await cart.get()).lines).toEqual([]);
    const stored = (await backend.store.load()).orders[order.id]!;
    expect(stored.lifecycle).toBeDefined();
    expect(stored.lines[0]).toMatchObject({ quantity: 1, returnable: expect.any(Boolean) });
  });

  it("refuses cash on delivery where it isn't allowed", async () => {
    const { session } = await readyToOrder(priced(150000), 2);
    if (session.codAllowed) return;
    await expect(checkout.placeOrder(session.id, "cod")).rejects.toMatchObject({ status: 422, code: "VALIDATION_FAILED" });
  });

  it("places an online order waiting for payment, with a payment intent to pay", async () => {
    const { session } = await readyToOrder();
    const { order, intent } = await checkout.placeOrder(session.id, "upi");
    expect(order).toMatchObject({ status: "placed", paymentStatus: "pending" });
    expect(intent).toMatchObject({ orderId: order.id, amount: order.total, status: "created", attempt: 1 });
  });

  it("answers a repeated place-order (same key) with the same order, and places only one", async () => {
    const { session } = await readyToOrder();
    const first = await checkout.placeOrder(session.id, "upi", "key-1");
    const again = await checkout.placeOrder(session.id, "upi", "key-1");
    expect(again.order.id).toBe(first.order.id);
    expect(Object.values((await backend.store.load()).orders).filter((order) => order.number === first.order.number)).toHaveLength(1);
  });

  it("refuses a second order from the same checkout under a different key", async () => {
    const { session } = await readyToOrder();
    await checkout.placeOrder(session.id, "upi", "key-1");
    await expect(checkout.placeOrder(session.id, "upi", "key-2")).rejects.toMatchObject({ status: 404 });
  });

  it("takes stock off and counts the coupon as used", async () => {
    const { variant } = await readyToOrder(priced(30000, 100000), 2);
    await cart.applyCoupon("FLAT50");
    const session = await checkout.start();
    await checkout.update(session.id, { deliveryId: "standard" });
    const before = await stockOf(variant);
    const { order } = await checkout.placeOrder(session.id, "upi");
    expect(await stockOf(variant)).toBe(before - 2);
    expect((await backend.store.load()).coupons.FLAT50!.used).toBe(1);
    expect((await backend.store.load()).orders[order.id]!.breakup.couponDiscount).toBe(5000);
  });

  it("refuses with a 409 listing what ran short, and changes nothing", async () => {
    const { variant, session } = await readyToOrder(priced(20000, 100000), 3);
    const state = await backend.store.load();
    state.stock[variant.id] = 1;
    await backend.store.save(state);
    backend.adapter.controls.reload();
    await expect(checkout.placeOrder(session.id, "upi")).rejects.toMatchObject({
      status: 409,
      code: "OUT_OF_STOCK",
      details: { lines: [{ variantId: variant.id, available: 1 }] },
    });
    expect((await cart.get()).itemCount).toBe(3);
    expect(await stockOf(variant)).toBe(1);
  });
});

describe("paying", () => {
  async function placed() {
    const { session } = await readyToOrder();
    return checkout.placeOrder(session.id, "upi");
  }
  const stored = async (orderId: string) => (await backend.store.load()).orders[orderId]!;

  it("a successful payment confirms the order", async () => {
    const { order, intent } = await placed();
    expect(await payments.confirm(intent!.id, "success")).toMatchObject({ status: "succeeded", attempt: 1 });
    expect(await stored(order.id)).toMatchObject({ status: "confirmed", paymentStatus: "paid", paymentRetryable: false });
  });

  it("paying again for an order already paid changes nothing", async () => {
    const { intent } = await placed();
    await payments.confirm(intent!.id, "success");
    expect(await payments.confirm(intent!.id, "failure")).toMatchObject({ status: "succeeded" });
  });

  it("a failed payment leaves the order waiting, and a retry starts attempt 2 on the same order", async () => {
    const { order, intent } = await placed();
    expect(await payments.confirm(intent!.id, "failure")).toMatchObject({ status: "failed" });
    expect(await stored(order.id)).toMatchObject({ status: "placed", paymentStatus: "failed", paymentRetryable: true });
    const second = await payments.retry(order.id);
    expect(second).toMatchObject({ orderId: order.id, attempt: 2, status: "created" });
    expect(await payments.confirm(second.id, "success")).toMatchObject({ status: "succeeded", attempt: 2 });
    expect(await stored(order.id)).toMatchObject({ status: "confirmed", paymentStatus: "paid" });
  });

  it("an order whose sheet was closed unpaid can be paid again; one paid or being paid can't", async () => {
    const { order, intent } = await placed();
    const again = await payments.retry(order.id);
    expect(again).toMatchObject({ attempt: 2, status: "created" });
    await payments.confirm(again.id, "pending");
    await expect(payments.retry(order.id)).rejects.toMatchObject({ status: 409, code: "ORDER_STATE" });
    backend.clock.advance(10_000);
    await expect(payments.retry(order.id)).rejects.toMatchObject({ status: 409 });
    expect(await payments.get(intent!.id)).toMatchObject({ status: "failed" });
  });

  it("a pending payment settles by itself a few seconds later", async () => {
    const { order, intent } = await placed();
    expect(await payments.confirm(intent!.id, "pending")).toMatchObject({ status: "pending" });
    expect(await payments.get(intent!.id)).toMatchObject({ status: "pending" });
    expect(await stored(order.id)).toMatchObject({ paymentStatus: "pending" });
    backend.clock.advance(10_000);
    expect(await payments.get(intent!.id)).toMatchObject({ status: "succeeded" });
    expect(await stored(order.id)).toMatchObject({ status: "confirmed", paymentStatus: "paid" });
  });

  it("follows the outcome chosen in the demo panel, once", async () => {
    const first = await placed();
    backend.controls.setNextPayment("failure");
    expect(await payments.confirm(first.intent!.id, "success")).toMatchObject({ status: "failed" });
    const second = await payments.retry(first.order.id);
    expect(await payments.confirm(second.id, "success")).toMatchObject({ status: "succeeded" });
  });

  it("belongs to the customer who placed the order", async () => {
    const { intent } = await placed();
    await signIn("9000000005");
    await expect(payments.confirm(intent!.id, "success")).rejects.toMatchObject({ status: 404 });
  });
});

describe("the demo panel's stock lever", () => {
  it("makes the items in a cart run short, so placing the order is refused with a 409", async () => {
    const { variant, session } = await readyToOrder(priced(20000, 100000), 3);
    await backend.controls.shortStockInCarts();
    await expect(checkout.placeOrder(session.id, "upi")).rejects.toMatchObject({
      status: 409,
      code: "OUT_OF_STOCK",
      details: { lines: [{ variantId: variant.id, available: 2 }] },
    });
    expect((await cart.get()).lines[0]).toMatchObject({ quantity: 3, available: 2 });
  });
});
