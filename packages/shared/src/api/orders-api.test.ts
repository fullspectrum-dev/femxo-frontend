import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockBackend } from "../mock/backend";
import { HOUR, DAY } from "../mock/domain/order-lifecycle";
import type { SeedProduct } from "../mock/domain/types";
import { createAuthApi } from "./auth-api";
import { createCartApi } from "./cart-api";
import { createCheckoutApi } from "./checkout-api";
import { createOrdersApi } from "./orders-api";
import { createPaymentApi } from "./payment-api";
import { withAuth } from "./with-auth";

const NOW = Date.UTC(2026, 9, 24, 5, 0);

let token: string | undefined;
let backend: ReturnType<typeof createMockBackend>;
let auth: ReturnType<typeof createAuthApi>;
let cart: ReturnType<typeof createCartApi>;
let checkout: ReturnType<typeof createCheckoutApi>;
let payments: ReturnType<typeof createPaymentApi>;
let orders: ReturnType<typeof createOrdersApi>;

beforeEach(() => {
  token = undefined;
  backend = createMockBackend({ storage: "memory", latency: false, realNow: () => NOW });
  const adapter = withAuth(backend.adapter, () => token);
  auth = createAuthApi(adapter);
  cart = createCartApi(adapter);
  checkout = createCheckoutApi(adapter);
  payments = createPaymentApi(adapter);
  orders = createOrdersApi(adapter);
});

async function signIn(mobile: string) {
  const challenge = await auth.requestOtp(mobile);
  token = (await auth.verifyOtp(challenge.requestId, "123456")).accessToken;
}

/** Time passes on the demo clock; access tokens last 15 minutes, so the customer has to be signed in again. */
async function later(ms: number) {
  backend.clock.advance(ms);
  await signIn("9000000002");
}

const variantOf = (product: SeedProduct) => product.variants.find((entry) => entry.stock >= 50 && entry.maxPerOrder >= 2)!;
const returnable = () => variantOf(backend.catalog.products.find((product) => product.returnable && product.variants.some((entry) => entry.stock >= 50 && entry.maxPerOrder >= 2 && entry.price < 90000))!);
const notReturnable = () => variantOf(backend.catalog.products.find((product) => !product.returnable && product.variants.some((entry) => entry.stock >= 50 && entry.maxPerOrder >= 2))!);

/** Places an order for the given variants, as a customer with no orders of their own yet. */
async function place(items: { id: string }[], method: "cod" | "upi" = "upi", pay = true) {
  for (const item of items) await cart.add(item.id, 1);
  const session = await checkout.start();
  await checkout.update(session.id, { deliveryId: "standard" });
  const placed = await checkout.placeOrder(session.id, method);
  if (placed.intent && pay) await payments.confirm(placed.intent.id, "success");
  return placed;
}

describe("order history", () => {
  it("is for signed-in customers only", async () => {
    await expect(orders.list()).rejects.toMatchObject({ status: 401 });
    await expect(orders.get("ord-1")).rejects.toMatchObject({ status: 401 });
  });

  it("lists a customer's own orders, newest first, a page at a time", async () => {
    await signIn("9000000002");
    const first = await orders.list({ limit: 3 });
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();
    const dates = first.items.map((order) => order.placedAt);
    expect(dates).toEqual([...dates].sort().reverse());
    const second = await orders.list({ limit: 3, cursor: first.nextCursor! });
    expect(second.items.map((order) => order.id)).not.toContain(first.items[0]!.id);
    const mine = Object.values((await backend.store.load()).orders).filter((order) => order.customerId === "cus-regular");
    const all = await orders.list({ limit: 100 });
    expect(all.items).toHaveLength(mine.length);
  });

  it("filters by status", async () => {
    await signIn("9000000002");
    const delivered = await orders.list({ status: ["delivered"], limit: 100 });
    expect(delivered.items.every((order) => order.status === "delivered")).toBe(true);
    const several = await orders.list({ status: ["cancelled", "refunded", "returned"], limit: 100 });
    expect(several.items.every((order) => ["cancelled", "refunded", "returned"].includes(order.status))).toBe(true);
  });

  it("shows a new order at the top", async () => {
    await signIn("9000000002");
    const placed = await place([returnable()], "upi");
    expect((await orders.list()).items[0]!.id).toBe(placed.order.id);
  });
});

describe("one order", () => {
  it("has the lines, bill, address, payment and tracking timeline", async () => {
    await signIn("9000000002");
    const placed = await place([returnable()]);
    const order = await orders.get(placed.order.id);
    expect(order).toMatchObject({ id: placed.order.id, status: "confirmed", paymentStatus: "paid", paymentMethod: "upi", canCancel: true });
    expect(order.lines).toHaveLength(1);
    expect(order.timeline.map((event) => event.status)).toEqual(["placed", "confirmed"]);
    expect(order.address.line1).toBeTruthy();
  });

  it("is the customer's own: someone else's order is a 404", async () => {
    await signIn("9000000002");
    const placed = await place([returnable()]);
    await signIn("9000000005");
    await expect(orders.get(placed.order.id)).rejects.toMatchObject({ status: 404 });
    await expect(orders.get("ord-nope")).rejects.toMatchObject({ status: 404 });
  });

  it("moves on by itself as the demo clock advances, to delivered", async () => {
    await signIn("9000000002");
    const placed = await place([returnable()], "cod");
    await later(7 * HOUR);
    expect((await orders.get(placed.order.id)).status).toBe("packed");
    await later(60 * HOUR);
    const delivered = await orders.get(placed.order.id);
    expect(delivered).toMatchObject({ status: "delivered", canCancel: false });
    expect(delivered.timeline.map((event) => event.status)).toEqual(["placed", "confirmed", "packed", "shipped", "out_for_delivery", "delivered"]);
    expect(delivered.canReturnUntil).not.toBeNull();
  });
});

describe("cancelling", () => {
  it("cancels an order before it is packed, gives the stock back, and refunds an online payment", async () => {
    await signIn("9000000002");
    const variant = returnable();
    const stockBefore = (await backend.store.load()).stock[variant.id] ?? variant.stock;
    const placed = await place([variant], "upi");
    expect((await backend.store.load()).stock[variant.id]).toBe(stockBefore - 1);
    const cancelled = await orders.cancel(placed.order.id);
    expect(cancelled).toMatchObject({ status: "cancelled", paymentStatus: "refunded", canCancel: false });
    expect(cancelled.timeline.at(-1)!.status).toBe("cancelled");
    expect((await backend.store.load()).stock[variant.id]).toBe(stockBefore);
  });

  it("cancels cash on delivery without a refund", async () => {
    await signIn("9000000002");
    const placed = await place([returnable()], "cod");
    expect(await orders.cancel(placed.order.id)).toMatchObject({ status: "cancelled", paymentStatus: "cod" });
  });

  it("refuses once the order is packed, and cancelling twice", async () => {
    await signIn("9000000002");
    const placed = await place([returnable()], "cod");
    await orders.cancel(placed.order.id);
    await expect(orders.cancel(placed.order.id)).rejects.toMatchObject({ status: 409, code: "ORDER_STATE" });
    const second = await place([returnable()], "cod");
    await later(7 * HOUR);
    await expect(orders.cancel(second.order.id)).rejects.toMatchObject({ status: 409, code: "ORDER_STATE" });
  });

  it("can cancel an order still waiting for payment", async () => {
    await signIn("9000000002");
    const placed = await place([returnable()], "upi", false);
    expect(await orders.cancel(placed.order.id)).toMatchObject({ status: "cancelled" });
  });
});

describe("returns", () => {
  async function delivered(items: { id: string }[]) {
    const placed = await place(items, "cod");
    await later(61 * HOUR);
    return orders.get(placed.order.id);
  }

  it("takes a return request within 7 days of delivery", async () => {
    await signIn("9000000002");
    const order = await delivered([returnable()]);
    const result = await orders.requestReturn(order.id, { lineIds: [order.lines[0]!.id], reason: "Damaged on arrival" });
    expect(result.status).toBe("return_requested");
    expect(result.timeline.at(-1)!.status).toBe("return_requested");
  });

  it("isn't possible before delivery", async () => {
    await signIn("9000000002");
    const placed = await place([returnable()], "cod");
    const order = await orders.get(placed.order.id);
    await expect(orders.requestReturn(order.id, { lineIds: [order.lines[0]!.id], reason: "Changed my mind" })).rejects.toMatchObject({ status: 409, code: "ORDER_STATE" });
  });

  it("leaves out items that can't be returned", async () => {
    await signIn("9000000002");
    const order = await delivered([notReturnable()]);
    expect(order.canReturnUntil).toBeNull();
    await expect(orders.requestReturn(order.id, { lineIds: [order.lines[0]!.id], reason: "Changed my mind" })).rejects.toMatchObject({ status: 409 });
    const mixed = await delivered([returnable(), notReturnable()]);
    const keep = mixed.lines.find((line) => !line.returnable)!;
    await expect(orders.requestReturn(mixed.id, { lineIds: [keep.id], reason: "Changed my mind" })).rejects.toMatchObject({ status: 422, code: "VALIDATION_FAILED" });
  });

  it("closes 7 days after delivery", async () => {
    await signIn("9000000002");
    const order = await delivered([returnable()]);
    await later(8 * DAY);
    await expect(orders.requestReturn(order.id, { lineIds: [order.lines[0]!.id], reason: "Damaged on arrival" })).rejects.toMatchObject({ status: 409, code: "ORDER_STATE" });
  });

  it("needs at least one item and a reason", async () => {
    await signIn("9000000002");
    const order = await delivered([returnable()]);
    await expect(orders.requestReturn(order.id, { lineIds: [], reason: "Damaged on arrival" })).rejects.toMatchObject({ status: 422 });
    await expect(orders.requestReturn(order.id, { lineIds: [order.lines[0]!.id], reason: "" })).rejects.toMatchObject({ status: 422 });
  });
});

describe("retrying a failed payment", () => {
  it("shows the order as retryable until it is paid", async () => {
    await signIn("9000000002");
    const placed = await place([returnable()], "upi", false);
    await payments.confirm(placed.intent!.id, "failure");
    expect(await orders.get(placed.order.id)).toMatchObject({ paymentStatus: "failed", paymentRetryable: true, status: "placed" });
    const again = await payments.retry(placed.order.id);
    await payments.confirm(again.id, "success");
    expect(await orders.get(placed.order.id)).toMatchObject({ paymentStatus: "paid", paymentRetryable: false, status: "confirmed" });
  });
});
