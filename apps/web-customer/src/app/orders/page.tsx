import type { Metadata } from "next";
import { OrdersPage } from "@/features/orders/components/OrdersPage";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

export default function Orders() {
  return <OrdersPage />;
}
