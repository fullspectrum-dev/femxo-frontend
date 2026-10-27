import type { Metadata } from "next";
import { CheckoutPage } from "@/features/checkout/components/CheckoutPage";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function Checkout() {
  return <CheckoutPage />;
}
