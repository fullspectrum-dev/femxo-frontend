"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OrderLine } from "@femxo/shared/contracts";
import { Button, useToast } from "@femxo/ui";
import { useCart } from "@/features/cart/components/CartProvider";

/**
 * "Order again": puts every item of a past order back in the cart in the same
 * quantities, then opens the cart. The most-used shortcut in quick commerce, where
 * baskets repeat week to week. Items the cart refuses (out of stock, limits) are
 * counted and named in one message rather than failing the whole reorder.
 */
export function OrderAgainButton({ lines }: { lines: readonly OrderLine[] }) {
  const { add } = useCart();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function reorder() {
    setBusy(true);
    let added = 0;
    const skipped: string[] = [];
    // One at a time, in order: the cart applies changes in sequence anyway.
    for (const line of lines) {
      const result = await add(line.variant.id, line.quantity);
      if (result.ok) added += 1;
      else skipped.push(line.product.name);
    }
    setBusy(false);
    if (added === 0) {
      toast("None of these items can be added right now.");
      return;
    }
    toast(skipped.length ? `Added ${added} of ${lines.length} items. Not available: ${skipped.join(", ")}.` : `Added ${added} ${added === 1 ? "item" : "items"} to your cart.`);
    router.push("/cart");
  }

  return (
    <Button busy={busy} onClick={() => void reorder()}>
      <RotateCcw size={16} aria-hidden="true" />
      Order again
    </Button>
  );
}
