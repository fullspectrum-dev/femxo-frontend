"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OrderItem } from "@femxo/shared/contracts";
import { Button, useToast } from "@femxo/ui";
import { useCart } from "@/features/cart/components/CartProvider";

/** Puts every item of an earlier order back in the cart (the server re-prices and re-checks stock) and opens the cart. */
export function OrderAgainButton({ items }: { items: readonly Pick<OrderItem, "variantId" | "quantity">[] }) {
  const { add } = useCart();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function again() {
    setBusy(true);
    let failed = 0;
    for (const item of items) {
      const result = await add(item.variantId, item.quantity);
      if (!result.ok) failed += 1;
    }
    setBusy(false);
    if (failed < items.length) {
      if (failed > 0) toast(`${failed} ${failed === 1 ? "item" : "items"} couldn't be added.`, { tone: "error" });
      router.push("/cart");
    }
  }

  return (
    <Button variant="secondary" busy={busy} onClick={() => void again()}>
      Order again
    </Button>
  );
}
