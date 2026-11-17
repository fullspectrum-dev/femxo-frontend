"use client";

import { Minus, Plus } from "lucide-react";
import { useContext, useState } from "react";
import { cn, useToast } from "@femxo/ui";
import { lineCeiling } from "../cart-ops";
import { CartContext } from "./CartProvider";

const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/**
 * The quick-commerce add control. "ADD" turns into − qty + in place, so a shopper
 * builds a basket without leaving the list. Quantity comes from the shared cart;
 * changes are optimistic (CartProvider rolls back on refusal).
 *
 * `pill` is the card version that sits on the picture's corner; `block` fills its
 * container (the product page's sticky bar). Both keep a 44px touch target.
 */
export function CardAction({ variantId, itemName, variant = "block", className }: { variantId: string; itemName: string; variant?: "block" | "pill"; className?: string }) {
  const ctx = useContext(CartContext);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!ctx) return null;
  const { add, setQuantity, remove } = ctx;
  const line = ctx.cart?.lines.find((l) => l.variantId === variantId);
  const pill = variant === "pill";

  async function onAdd() {
    setBusy(true);
    const result = await add(variantId, 1);
    setBusy(false);
    if (!result.ok) toast(result.message);
  }

  if (!line) {
    return (
      <button
        type="button"
        onClick={() => void onAdd()}
        disabled={busy}
        aria-label={`Add ${itemName} to cart`}
        className={cn(
          "h-11 cursor-pointer touch-manipulation rounded-control border-[1.5px] border-primary bg-surface font-display text-sm font-bold uppercase tracking-wide text-primary transition-[background-color,color,transform] duration-150 hover:bg-primary hover:text-on-primary active:scale-95 disabled:opacity-60 motion-reduce:transition-none",
          pill ? "min-w-[4.75rem] px-4 shadow-raised" : "w-full",
          ring,
          className,
        )}
      >
        {busy ? "…" : "Add"}
      </button>
    );
  }

  // The same ceiling as the cart page: what the server says is available, and the per-order limit.
  const atMax = line.quantity >= lineCeiling(line);
  const step = `grid h-11 flex-none cursor-pointer place-items-center text-on-primary transition-colors duration-150 active:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 ${pill ? "w-9" : "w-11"} ${ring}`;
  return (
    <div
      role="group"
      aria-label={`${itemName} quantity`}
      className={cn("flex h-11 items-center justify-between overflow-hidden rounded-control bg-primary motion-safe:animate-pop", pill ? "min-w-[6.5rem] shadow-raised" : "w-full", className)}
    >
      <button
        type="button"
        className={step}
        aria-label={line.quantity <= 1 ? `Remove ${itemName}` : `Decrease quantity of ${itemName}`}
        onClick={() => void (line.quantity <= 1 ? remove(line.variantId) : setQuantity(line.variantId, line.quantity - 1))}
      >
        <Minus size={16} strokeWidth={2.5} aria-hidden="true" />
      </button>
      <output aria-live="polite" className="min-w-6 text-center font-display text-[15px] font-bold tabular-nums text-on-primary">
        {line.quantity}
      </output>
      <button type="button" className={step} disabled={atMax} aria-label={`Increase quantity of ${itemName}`} onClick={() => void setQuantity(line.variantId, line.quantity + 1)}>
        <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  );
}
