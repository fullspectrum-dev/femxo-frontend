import type { Metadata } from "next";
import { CartPage } from "@/features/cart/components/CartPage";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };

export default function Cart() {
  return <CartPage />;
}
