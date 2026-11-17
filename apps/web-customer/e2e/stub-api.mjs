// A stand-in for femxo-backend for the storefront's end-to-end tests. Usage: node stub-api.mjs <port>
//
// Without a sign-in cookie it behaves like an empty backend (the catalogue answers, everything else is 401/404), so the smoke specs
// see the plain shell. With the cookie `fx_rt=1` (the specs set it) the customer is signed in, and the commerce routes behave like
// femxo-backend's /store/v1 (ADR 0020, 0021): a revisioned cart that prices on the server, addresses, checkout with Idempotency-Key and
// cartRev, Razorpay-shaped online payments (verify + poll), orders with a timeline, cancelling, Prime plans.
// POST /__reset starts over; POST /__control tunes a scenario (prices, capture, availableQty, capturePending).
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const RAZORPAY_SCRIPT = readFileSync(path.join(here, "fake-razorpay.js"), "utf8");

const PRODUCTS = [
  { id: "p1", name: "Basmati Rice", slug: "basmati-rice", description: "Long grain rice", brandId: "b1", categoryId: "c1", categoryPath: ["c1"], gstRateBp: 500, images: [], variants: [{ id: "v1", sku: "RICE-5", barcode: "", label: "5 kg", mrp: 60000, price: 50000, inStock: true, availableQty: 5 }] },
  { id: "p2", name: "Toor Dal", slug: "toor-dal", description: "Split pigeon peas", brandId: "b1", categoryId: "c1", categoryPath: ["c1"], gstRateBp: 0, images: [], variants: [{ id: "v2", sku: "DAL-1", barcode: "", label: "1 kg", mrp: 20000, price: 15000, inStock: true, availableQty: 10 }] },
];
const LOCATIONS = [{ id: "village:1", type: "village", name: "Bihta", pincode: "801103", breadcrumb: [{ id: "state:10", name: "Bihar" }, { id: "district:230", name: "Patna" }] }];
const PLANS = [{ id: "plan1", name: "Prime 90 days", pricePaise: 29900, durationDays: 90, benefits: ["Member prices on every order"] }];
const NOW = () => new Date().toISOString();

let S;
function reset() {
  S = {
    prices: { v1: 50000, v2: 15000 },
    cart: { rev: 0, items: [] },
    addresses: [{ id: "a1", label: "Home", name: "Asha Devi", phone: "9876543210", line1: "12 Station Road", line2: null, landmark: null, pincode: "801103", locationId: "village:1", isDefault: true, createdAt: NOW() }],
    orders: [],
    payments: {},
    keys: new Map(),
    seq: 0,
    prime: null,
    control: { capture: true },
    lastCheckoutBody: null,
  };
  for (const p of PRODUCTS) for (const v of p.variants) v.availableQty = v.id === "v1" ? 5 : 10;
}
reset();

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const fail = (res, status, code, message = code) => json(res, status, { error: { code, message } });
const readBody = (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

const variantOf = (id) => PRODUCTS.flatMap((p) => p.variants.map((v) => ({ ...v, product: p, ref: v }))).find((v) => v.id === id);

function cartView() {
  const items = S.cart.items.map((i) => {
    const v = variantOf(i.variantId);
    const price = S.prices[i.variantId];
    const have = v.ref.availableQty;
    return {
      variantId: i.variantId, productId: v.product.id, quantity: i.quantity, unitPricePaise: price, linePaise: price * i.quantity, gstRateBp: v.product.gstRateBp,
      problem: null, priceChanged: i.seen !== price, previousUnitPricePaise: i.seen !== price ? i.seen : null,
      inStock: have > 0, availableQty: have, sufficient: have >= i.quantity,
    };
  });
  const subtotal = items.reduce((s, i) => s + i.linePaise, 0);
  const hasPriceChange = items.some((i) => i.priceChanged);
  const hasStockIssue = items.some((i) => !i.sufficient);
  return { cart: { rev: S.cart.rev, tier: "selling", items, subtotalPaise: subtotal, deliveryChargePaise: 0, totalPaise: items.length ? subtotal : 0, hasPriceChange, hasStockIssue, canCheckout: items.length > 0 && !hasPriceChange && !hasStockIssue, expiresAt: null } };
}

function orderView(o) {
  const expired = o.status === "pending_payment" && Date.parse(o.expiresAt) <= Date.now();
  const display = { pending_payment: expired ? "payment_expired" : "awaiting_payment", payment_failed: "payment_failed", placed: "confirmed", completed: "delivered", cancelled: "cancelled" }[o.status];
  return {
    id: o.id, orderNumber: o.orderNumber, status: o.status, displayStatus: display, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
    subtotalPaise: o.totalPaise, deliveryChargePaise: 0, totalPaise: o.totalPaise, itemCount: o.items.reduce((s, i) => s + i.quantity, 0), placedAt: o.placedAt,
    confirmedAt: o.confirmedAt, expiresAt: o.status === "pending_payment" ? o.expiresAt : null, cancelReason: o.cancelReason, shipping: o.shipping,
    providerOrderId: o.status === "pending_payment" ? o.providerOrderId : null,
  };
}
const paymentOf = (o) => (o.paymentMethod === "online" ? { providerOrderId: o.providerOrderId, keyId: "rzp_test_stub", status: o.paymentStatus, amountPaise: o.totalPaise, expiresAt: o.status === "pending_payment" ? o.expiresAt : null } : null);
const itemsOf = (o) => o.items.map((i, n) => ({ lineNo: n + 1, variantId: i.variantId, productId: i.productId, quantity: i.quantity, unitPricePaise: i.unitPricePaise, gstRateBp: 0, linePaise: i.unitPricePaise * i.quantity, units: null }));
const detail = (o) => ({ order: orderView(o), items: itemsOf(o), payment: paymentOf(o), cancellable: o.status === "pending_payment" || o.status === "placed", timeline: o.timeline });

function settle(o) {
  o.status = "placed";
  o.paymentStatus = "captured";
  o.confirmedAt = NOW();
  o.timeline.push({ type: "payment_captured", at: NOW(), actor: "system:payment", detail: null }, { type: "order_confirmed", at: NOW(), actor: "system:payment", detail: null });
  const p = S.payments[o.paymentId];
  if (p) p.status = "captured";
}

const customer = { id: "c1", phone: "9876543210", name: "Asha Devi", email: null, addressLine: null, pincode: null, locationId: null, prime: { status: "none", until: null }, createdAt: NOW() };

async function handle(req, res) {
  const url = new URL(req.url, "http://stub");
  const p = url.pathname;
  const m = req.method;
  if (p === "/") return void res.writeHead(200).end("ok");
  if (p === "/__razorpay.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(RAZORPAY_SCRIPT);
  if (p === "/__reset") {
    reset();
    return json(res, 200, { ok: true });
  }
  if (p === "/__control") {
    const b = await readBody(req);
    if (b.prices) Object.assign(S.prices, b.prices);
    if (b.capture !== undefined) S.control.capture = b.capture;
    if (b.availableQty) for (const [id, q] of Object.entries(b.availableQty)) variantOf(id).ref.availableQty = q;
    if (b.capturePending) for (const o of S.orders) if (o.status === "pending_payment") settle(o);
    return json(res, 200, { ok: true });
  }
  if (p === "/__state") return json(res, 200, { orders: S.orders.map(orderView), cart: S.cart, checkoutBody: S.lastCheckoutBody });

  if (!p.startsWith("/store/v1/")) return fail(res, 404, "NOT_FOUND", "stub");
  const r = p.slice("/store/v1".length);

  // ---- public ----
  if (m === "GET" && r === "/categories") return json(res, 200, { items: url.searchParams.get("parentId") ? [] : [{ id: "c1", name: "Staples", slug: "staples", image: null, hasChildren: false }] });
  if (m === "GET" && r === "/brands") return json(res, 200, { items: [{ id: "b1", name: "Femxo Select", slug: "femxo-select" }], nextCursor: null });
  if (m === "GET" && r === "/products") return json(res, 200, { products: PRODUCTS.map((x) => ({ ...x, variants: x.variants.map((v) => ({ ...v, price: S.prices[v.id] })) })), nextCursor: null });
  const bySlug = /^\/products\/([^/]+)$/.exec(r);
  if (m === "GET" && bySlug) {
    const found = PRODUCTS.find((x) => x.slug === bySlug[1]);
    return found ? json(res, 200, { product: { ...found, variants: found.variants.map((v) => ({ ...v, price: S.prices[v.id] })) } }) : fail(res, 404, "NOT_FOUND");
  }
  if (m === "GET" && /^\/products\/[^/]+\/reviews$/.test(r)) return json(res, 200, { summary: { count: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }, items: [], nextCursor: null });
  if (m === "GET" && r === "/locations") {
    const found = url.searchParams.get("pincode") === "801103" || url.searchParams.get("q");
    return json(res, 200, { mode: url.searchParams.get("pincode") ? "pincode" : "search", items: found ? LOCATIONS : [] });
  }
  if (m === "GET" && r === "/serviceability") {
    const pin = url.searchParams.get("pincode");
    const known = pin === "801103";
    return json(res, 200, { pincode: pin, known, serviceable: known, locations: known ? [{ id: "village:1", type: "village", name: "Bihta", serviceable: true, coverage: "district" }] : [] });
  }
  if (m === "GET" && r === "/auth/config") return json(res, 200, { otp: { enabled: true, length: 6, resendCooldownSeconds: 30, validitySeconds: 300, maxAttempts: 5 } });
  if (m === "GET" && r === "/membership/plans") return json(res, 200, { items: PLANS });

  // ---- session ----
  const signedIn = /(?:^|;\s*)fx_rt=1/.test(req.headers.cookie ?? "");
  if (m === "POST" && r === "/auth/refresh") return signedIn ? json(res, 200, { accessToken: "tok_stub", expiresIn: 900 }) : fail(res, 401, "UNAUTHENTICATED");
  if (req.headers.authorization !== "Bearer tok_stub") return fail(res, 401, "UNAUTHENTICATED", "Sign in");
  if (m === "GET" && r === "/me") return json(res, 200, { customer });
  if (m === "GET" && r === "/me/prices") return json(res, 200, { prices: {} });
  if (r === "/me/wishlist") return json(res, 200, { items: [] });

  // ---- addresses ----
  if (m === "GET" && r === "/addresses") return json(res, 200, { items: S.addresses, max: 10 });
  if (m === "POST" && r === "/addresses") {
    const b = await readBody(req);
    const address = { id: `a${S.addresses.length + 1}`, label: b.label ?? null, name: b.name, phone: b.phone, line1: b.line1, line2: b.line2 ?? null, landmark: b.landmark ?? null, pincode: b.pincode, locationId: b.locationId, isDefault: S.addresses.length === 0, createdAt: NOW() };
    S.addresses.push(address);
    return json(res, 201, { address, replayed: false });
  }

  // ---- cart ----
  if (m === "GET" && r === "/cart") return json(res, 200, cartView());
  if (m === "PUT" && r === "/cart") {
    const b = await readBody(req);
    if (b.rev !== undefined && b.rev !== S.cart.rev) return fail(res, 409, "CART_CHANGED", `The cart changed (now revision ${S.cart.rev})`);
    S.cart = { rev: S.cart.rev + 1, items: b.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, seen: S.prices[i.variantId] })) };
    return json(res, 200, cartView());
  }

  // ---- checkout ----
  if (m === "POST" && r === "/checkout") {
    const b = await readBody(req);
    S.lastCheckoutBody = b;
    const key = req.headers["idempotency-key"];
    if (!key) return fail(res, 400, "IDEMPOTENCY_KEY_REQUIRED");
    const seen = S.keys.get(key);
    if (seen) return json(res, 200, { ...seen, replayed: true });
    const view = cartView().cart;
    if (!view.items.length) return fail(res, 409, "CART_EMPTY");
    if (b.cartRev !== S.cart.rev) return fail(res, 409, "CART_CHANGED");
    if (view.hasPriceChange || (b.expectedTotalPaise !== undefined && b.expectedTotalPaise !== view.totalPaise)) return fail(res, 409, "PRICE_CHANGED");
    if (view.hasStockIssue) return fail(res, 409, "INSUFFICIENT_STOCK");
    const address = S.addresses.find((a) => a.id === b.addressId);
    if (!address) return fail(res, 404, "ADDRESS_NOT_FOUND");
    const online = b.paymentMethod === "online";
    if (!online && view.totalPaise > 500000) return fail(res, 422, "COD_NOT_AVAILABLE");
    const n = ++S.seq;
    const order = {
      id: `o${n}`, orderNumber: `FX-${1000 + n}`, status: online ? "pending_payment" : "placed", paymentMethod: b.paymentMethod, paymentStatus: online ? "pending" : "none", totalPaise: view.totalPaise,
      placedAt: NOW(), confirmedAt: online ? null : NOW(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), cancelReason: null,
      shipping: { name: address.name, phone: address.phone, line1: address.line1, line2: null, landmark: null, pincode: address.pincode, locationId: address.locationId },
      items: view.items.map((i) => ({ variantId: i.variantId, productId: i.productId, quantity: i.quantity, unitPricePaise: i.unitPricePaise })),
      providerOrderId: online ? `order_TEST${n}` : null, paymentId: online ? `pay${n}` : null,
      timeline: [{ type: "order_placed", at: NOW(), actor: "customer:c1", detail: null }, online ? { type: "payment_pending", at: NOW(), actor: "customer:c1", detail: null } : { type: "order_confirmed", at: NOW(), actor: "customer:c1", detail: null }],
    };
    if (online) S.payments[order.paymentId] = { id: order.paymentId, purpose: "order", orderId: order.id, amountPaise: order.totalPaise, currency: "INR", status: "created", providerOrderId: order.providerOrderId, providerPaymentId: null, capturedAt: null, createdAt: NOW() };
    S.orders.unshift(order);
    S.cart = { rev: S.cart.rev + 1, items: [] };
    const result = { order: orderView(order), items: itemsOf(order), payment: paymentOf(order), replayed: false };
    S.keys.set(key, result);
    return json(res, 201, result);
  }

  // ---- orders ----
  if (m === "GET" && r === "/orders") {
    const st = url.searchParams.get("status");
    return json(res, 200, { items: S.orders.filter((o) => !st || o.status === st).map(orderView), nextCursor: null });
  }
  const one = /^\/orders\/([^/]+)(?:\/(timeline|cancel|pay))?$/.exec(r);
  if (one) {
    const o = S.orders.find((x) => x.id === one[1]);
    if (!o) return fail(res, 404, "ORDER_NOT_FOUND");
    if (m === "GET" && !one[2]) return json(res, 200, detail(o));
    if (m === "GET" && one[2] === "timeline") return json(res, 200, { items: o.timeline });
    if (m === "POST" && one[2] === "pay") {
      if (o.paymentMethod !== "online") return fail(res, 409, "NOT_AN_ONLINE_ORDER");
      if (o.status !== "pending_payment") return fail(res, 409, "ORDER_NOT_AWAITING_PAYMENT");
      return json(res, 200, { payment: paymentOf(o) });
    }
    if (m === "POST" && one[2] === "cancel") {
      if (!req.headers["idempotency-key"]) return fail(res, 400, "IDEMPOTENCY_KEY_REQUIRED");
      if (o.status === "cancelled") return json(res, 200, { ...detail(o), replayed: true, cancelled: true });
      if (o.status !== "pending_payment" && o.status !== "placed") return fail(res, 409, "ORDER_NOT_CANCELLABLE");
      o.status = "cancelled";
      o.cancelReason = "Cancelled by the customer";
      o.timeline.push({ type: "order_cancelled", at: NOW(), actor: "customer:c1", detail: { reason: o.cancelReason } });
      return json(res, 200, { ...detail(o), replayed: false, cancelled: true });
    }
  }

  // ---- payments ----
  if (m === "POST" && r === "/payments/verify") {
    const b = await readBody(req);
    const pay = Object.values(S.payments).find((x) => x.providerOrderId === b.razorpay_order_id);
    if (!pay) return fail(res, 404, "PAYMENT_NOT_FOUND");
    if (!String(b.razorpay_signature).startsWith("sig_TEST")) return fail(res, 400, "INVALID_SIGNATURE");
    const o = S.orders.find((x) => x.id === pay.orderId);
    if (S.control.capture && o) settle(o);
    return json(res, 200, { payment: S.payments[pay.id], confirmed: S.control.capture });
  }
  const payOne = /^\/payments\/([^/]+)$/.exec(r);
  if (m === "GET" && payOne) return S.payments[payOne[1]] ? json(res, 200, { payment: S.payments[payOne[1]] }) : fail(res, 404, "PAYMENT_NOT_FOUND");

  // ---- Prime ----
  if (m === "GET" && r === "/membership/current") return json(res, 200, { isPrime: false, subscription: null });

  return fail(res, 404, "NOT_FOUND", "stub");
}

http
  .createServer((req, res) => {
    handle(req, res).catch((error) => fail(res, 500, "INTERNAL_ERROR", String(error)));
  })
  .listen(Number(process.argv[2]), "127.0.0.1");
