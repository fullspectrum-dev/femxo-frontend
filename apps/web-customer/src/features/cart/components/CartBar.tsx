"use client";

import { ChevronRight, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useContext } from "react";
import { formatINR } from "@femxo/shared";
import { CartContext } from "./CartProvider";

const HIDDEN_ON = ["/cart", "/checkout", "/login", "/signup"];

/**
 * Floating basket summary: items, total, one tap to the cart. Sits above the phone
 * bottom bar and bottom-right on desktop; appears only once something is in the cart.
 */
export function CartBar() {
  const cart = useContext(CartContext)?.cart;
  const pathname = usePathname();
  if (!cart || cart.itemCount === 0 || HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  // Product pages have their own add bar on phones; there the basket shows on larger screens only.
  const onProduct = pathname.startsWith("/p/");
  return (
    <div className={`${onProduct ? "hidden md:flex" : "flex"} pointer-events-none fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.5rem)] z-20 justify-center px-3 md:bottom-6 md:justify-end md:px-6`}>
      <Link
        href="/cart"
        className="pointer-events-auto flex w-full max-w-md touch-manipulation items-center justify-between gap-3 rounded-card bg-primary px-4 py-3 text-on-primary shadow-float transition-transform motion-safe:animate-rise active:scale-[0.99] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:w-auto md:min-w-72"
      >
        <span className="flex items-center gap-3">
          <ShoppingBag size={22} aria-hidden="true" />
          <span className="flex flex-col leading-tight">
            <span className="text-xs font-medium opacity-90">
              {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
            </span>
            <span className="text-base font-bold tabular-nums">{formatINR(cart.breakup.total)}</span>
          </span>
        </span>
        <span className="flex items-center gap-1 text-sm font-bold">
          View cart
          <ChevronRight size={18} aria-hidden="true" />
        </span>
      </Link>
    </div>
  );
}
