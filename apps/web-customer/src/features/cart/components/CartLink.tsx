"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useContext } from "react";
import { cn } from "@femxo/ui";
import { t, tn } from "@/i18n";
import { CartContext } from "./CartProvider";

/**
 * The header's cart link with the item count. Outside a CartProvider (or
 * before the cart has loaded) it simply shows no badge.
 */
export function CartLink({ className }: { className?: string }) {
  const count = useContext(CartContext)?.cart?.itemCount ?? 0;
  return (
    <Link href="/cart" className={cn(className, "relative")}>
      <ShoppingCart size={20} aria-hidden="true" />
      {/* The name comes from this text, so it always matches what is on screen. */}
      <span className="sr-only">{tn("cart.link", count)}</span>
      <span aria-hidden="true" className="hidden lg:inline">
        {t("shell.header.cart")}
      </span>
      {count > 0 ? (
        <span aria-hidden="true" className="absolute right-0.5 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-on-primary">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
