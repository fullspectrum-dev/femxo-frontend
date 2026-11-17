import type { Cart, CartEntry } from "@femxo/shared/contracts";

/** A change to the cart, described by intent, so it can be re-applied to a fresher cart if the first try meets a newer revision. */
export type CartOp =
  | { type: "add"; variantId: string; quantity: number }
  | { type: "set"; variantId: string; quantity: number }
  | { type: "remove"; variantId: string }
  /** Writes the cart back as it is: how a customer accepts the prices they were just shown. */
  | { type: "confirm" }
  /** Sets every line to what can be had (and drops what can't be sold): "fix my cart". */
  | { type: "fit" };

export const toEntries = (cart: Pick<Cart, "lines"> | null): CartEntry[] => (cart ? cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })) : []);

/** The entries after an op. Quantities below 1 drop the line; there is one line per variant. */
export function applyOp(cart: Pick<Cart, "lines"> | null, op: CartOp): CartEntry[] {
  const entries = toEntries(cart);
  switch (op.type) {
    case "confirm":
      return entries;
    case "fit": {
      const out: CartEntry[] = [];
      for (const line of cart?.lines ?? []) {
        if (line.problem !== null) continue;
        const ceiling = line.available ?? line.quantity;
        const quantity = Math.min(line.quantity, ceiling);
        if (quantity >= 1) out.push({ variantId: line.variantId, quantity });
      }
      return out;
    }
    case "remove":
      return entries.filter((e) => e.variantId !== op.variantId);
    case "set":
      if (op.quantity < 1) return entries.filter((e) => e.variantId !== op.variantId);
      return entries.some((e) => e.variantId === op.variantId) ? entries.map((e) => (e.variantId === op.variantId ? { ...e, quantity: op.quantity } : e)) : [...entries, { variantId: op.variantId, quantity: op.quantity }];
    case "add": {
      const have = entries.find((e) => e.variantId === op.variantId);
      return have ? entries.map((e) => (e === have ? { ...e, quantity: e.quantity + op.quantity } : e)) : [...entries, { variantId: op.variantId, quantity: op.quantity }];
    }
  }
}

/**
 * What the screen shows while the server is still answering: the same cart with the quantity changed (or the line gone). Prices
 * stay as the server last gave them; its answer replaces this. Adding a variant that has no line yet can't be shown ahead of the
 * answer (its name and price come from the server), so it returns null and the control shows its own busy state.
 */
export function previewOp(cart: Cart, op: CartOp): Cart | null {
  if (op.type === "confirm" || op.type === "fit") return null;
  const has = cart.lines.some((l) => l.variantId === op.variantId);
  if (op.type === "add" && !has) return null;
  if (op.type === "set" && !has) return null;
  const quantityOf = (current: number) => (op.type === "remove" ? 0 : op.type === "add" ? current + op.quantity : op.quantity);
  const lines = cart.lines
    .map((l) => {
      if (l.variantId !== op.variantId) return l;
      const quantity = quantityOf(l.quantity);
      return { ...l, quantity, lineTotal: l.unitPrice === null ? null : l.unitPrice * quantity };
    })
    .filter((l) => l.quantity > 0);
  const subtotal = lines.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0);
  return {
    ...cart,
    lines,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    subtotal,
    total: lines.length === 0 ? 0 : subtotal + cart.delivery,
  };
}

/** The most of a line that can be asked for: what the server says is available (when it says), and a sane ceiling. */
export const MAX_LINE_QUANTITY = 50;
export const lineCeiling = (line: { available: number | null; variant: { stock: number; maxPerOrder: number } | null }): number => {
  const stock = line.available ?? line.variant?.stock ?? MAX_LINE_QUANTITY;
  return Math.max(Math.min(stock, line.variant?.maxPerOrder ?? MAX_LINE_QUANTITY, MAX_LINE_QUANTITY), 0);
};
