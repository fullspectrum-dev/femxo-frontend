"use client";

import { Price } from "@femxo/ui";
import { useSession } from "@/features/auth/components/SessionProvider";

/** The only part of a product card that depends on who is shopping: Prime members see the Prime price applied. */
export function CardPrice({ price, mrp, primePrice }: { price: number; mrp: number; primePrice: number }) {
  const { user } = useSession();
  return <Price className="mt-auto pt-1" size="md" price={price} mrp={mrp} primePrice={primePrice} member={user?.isPrime ?? false} />;
}
