import { describe, expect, it } from "vitest";
import type { Cart, CartLine } from "@femxo/shared/contracts";
import { applyOp, lineCeiling, previewOp, toEntries } from "./cart-ops";

const line = (variantId: string, quantity: number, over: Partial<CartLine> = {}): CartLine => ({
  id: variantId,
  variantId,
  productId: "p",
  product: null,
  variant: null,
  quantity,
  unitPrice: 1000,
  lineTotal: 1000 * quantity,
  priceChanged: false,
  previousUnitPrice: null,
  problem: null,
  available: 10,
  inStock: true,
  sufficient: true,
  ...over,
});
const cartOf = (lines: CartLine[], delivery = 0): Cart => ({
  rev: 5,
  tier: "selling",
  lines,
  itemCount: lines.reduce((s, l) => s + l.quantity, 0),
  subtotal: lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0),
  delivery,
  total: lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0) + delivery,
  hasPriceChange: false,
  hasStockIssue: false,
  canCheckout: true,
  expiresAt: null,
});

describe("applyOp", () => {
  const cart = cartOf([line("a", 2), line("b", 1)]);

  it("adds to an existing line and appends a new one", () => {
    expect(applyOp(cart, { type: "add", variantId: "a", quantity: 3 })).toEqual([
      { variantId: "a", quantity: 5 },
      { variantId: "b", quantity: 1 },
    ]);
    expect(applyOp(cart, { type: "add", variantId: "c", quantity: 1 })).toEqual([...toEntries(cart), { variantId: "c", quantity: 1 }]);
  });

  it("sets a quantity, and a quantity below one removes the line", () => {
    expect(applyOp(cart, { type: "set", variantId: "b", quantity: 4 })).toEqual([
      { variantId: "a", quantity: 2 },
      { variantId: "b", quantity: 4 },
    ]);
    expect(applyOp(cart, { type: "set", variantId: "b", quantity: 0 })).toEqual([{ variantId: "a", quantity: 2 }]);
  });

  it("removes a line, and starts a cart from nothing", () => {
    expect(applyOp(cart, { type: "remove", variantId: "a" })).toEqual([{ variantId: "b", quantity: 1 }]);
    expect(applyOp(null, { type: "add", variantId: "z", quantity: 2 })).toEqual([{ variantId: "z", quantity: 2 }]);
  });

  it("confirm writes the cart back unchanged (accepting the prices shown)", () => {
    expect(applyOp(cart, { type: "confirm" })).toEqual(toEntries(cart));
  });

  it("fit cuts lines to what is available and drops what can't be sold", () => {
    const messy = cartOf([
      line("a", 5, { available: 2, sufficient: false }),
      line("b", 1, { problem: "VARIANT_UNAVAILABLE", unitPrice: null, lineTotal: null }),
      line("c", 1, { available: 0, sufficient: false }),
      line("d", 3),
    ]);
    expect(applyOp(messy, { type: "fit" })).toEqual([
      { variantId: "a", quantity: 2 },
      { variantId: "d", quantity: 3 },
    ]);
  });

  it("re-applies the same intent to a newer cart (a CART_CHANGED retry)", () => {
    const fresher = cartOf([line("a", 7)]);
    expect(applyOp(fresher, { type: "add", variantId: "a", quantity: 1 })).toEqual([{ variantId: "a", quantity: 8 }]);
  });
});

describe("previewOp", () => {
  const cart = cartOf([line("a", 2), line("b", 1)], 4000);

  it("shows a new quantity and total before the server answers", () => {
    const next = previewOp(cart, { type: "set", variantId: "a", quantity: 3 })!;
    expect(next.itemCount).toBe(4);
    expect(next.lines[0]).toMatchObject({ quantity: 3, lineTotal: 3000 });
    expect(next.subtotal).toBe(4000);
    expect(next.total).toBe(8000);
  });

  it("drops a removed line, and zeroes the total of an emptied cart", () => {
    expect(previewOp(cart, { type: "remove", variantId: "a" })!.lines.map((l) => l.variantId)).toEqual(["b"]);
    expect(previewOp(cartOf([line("a", 1)], 4000), { type: "remove", variantId: "a" })!.total).toBe(0);
  });

  it("can't preview a line it has no details for, or the whole-cart operations", () => {
    expect(previewOp(cart, { type: "add", variantId: "new", quantity: 1 })).toBeNull();
    expect(previewOp(cart, { type: "confirm" })).toBeNull();
    expect(previewOp(cart, { type: "fit" })).toBeNull();
  });
});

describe("lineCeiling", () => {
  it("is the server's availability, capped by the per-order limit", () => {
    expect(lineCeiling({ available: 4, variant: { stock: 10, maxPerOrder: 50 } })).toBe(4);
    expect(lineCeiling({ available: 100, variant: { stock: 100, maxPerOrder: 20 } })).toBe(20);
  });
  it("falls back to the catalogue's stock, then to a sane ceiling", () => {
    expect(lineCeiling({ available: null, variant: { stock: 6, maxPerOrder: 50 } })).toBe(6);
    expect(lineCeiling({ available: null, variant: null })).toBe(50);
    expect(lineCeiling({ available: 0, variant: null })).toBe(0);
  });
});
