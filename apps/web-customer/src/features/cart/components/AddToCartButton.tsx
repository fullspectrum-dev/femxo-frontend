"use client";

import { ShoppingCart } from "lucide-react";
import { useState } from "react";
import { Button, useToast } from "@femxo/ui";
import type { ButtonProps } from "@femxo/ui";
import { useCart } from "./CartProvider";

/** Puts a variant in the cart and says so. A refusal (out of stock, over the limit) is announced by the cart itself. */
export function AddToCartButton({
  variantId,
  quantity = 1,
  itemName,
  label = "Add to cart",
  ...props
}: { variantId: string; quantity?: number; itemName: string; label?: string } & Omit<ButtonProps, "onClick" | "children">) {
  const { add } = useCart();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    const result = await add(variantId, quantity);
    setBusy(false);
    if (result.ok) toast("Added to cart");
  }

  return (
    <Button {...props} busy={busy} aria-label={`${label}: ${itemName}`} onClick={() => void onClick()}>
      <ShoppingCart size={18} aria-hidden="true" />
      {label}
    </Button>
  );
}
