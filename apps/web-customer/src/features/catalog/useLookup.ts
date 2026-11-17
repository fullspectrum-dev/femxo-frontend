"use client";

import { useEffect, useState } from "react";
import type { CatalogLookup } from "@femxo/shared/contracts";
import { getProductsApi } from "@/lib/api";

const EMPTY: CatalogLookup = { products: [], variants: {} };

/**
 * Names, pictures and packs for the ids an order or wishlist carries. Unknown ids simply have no entry, and a failed lookup
 * leaves the page showing what it has (an order is still right without pictures).
 */
export function useCatalogLookup(ids: { variantIds?: readonly string[]; productIds?: readonly string[] }) {
  const variantKey = [...new Set(ids.variantIds ?? [])].sort().join(",");
  const productKey = [...new Set(ids.productIds ?? [])].sort().join(",");
  const [found, setFound] = useState<{ key: string; data: CatalogLookup } | null>(null);
  const key = `${variantKey}|${productKey}`;

  useEffect(() => {
    if (!variantKey && !productKey) return;
    let cancelled = false;
    getProductsApi()
      .lookup({ variantIds: variantKey ? variantKey.split(",") : [], productIds: productKey ? productKey.split(",") : [] })
      .then((data) => !cancelled && setFound({ key, data }))
      .catch(() => !cancelled && setFound({ key, data: EMPTY }));
    return () => {
      cancelled = true;
    };
  }, [variantKey, productKey, key]);

  const data = found?.key === key ? found.data : EMPTY;
  return {
    ready: (!variantKey && !productKey) || found?.key === key,
    product: (id: string | null | undefined) => (id ? data.products.find((p) => p.id === id) : undefined),
    variant: (id: string) => data.variants[id]?.variant,
    productOfVariant: (variantId: string) => {
      const entry = data.variants[variantId];
      return entry ? data.products.find((p) => p.id === entry.productId) : undefined;
    },
  };
}
