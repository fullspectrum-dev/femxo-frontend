import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@femxo/ui";
import { OrderDetailPage } from "@/features/orders/components/OrderDetailPage";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

// The order id and ?placed=1 are read in the browser (orders are per customer), so the page itself is a static shell.
export default function Order() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-6 h-64 w-full max-w-5xl" />}>
      <OrderDetailPage />
    </Suspense>
  );
}
