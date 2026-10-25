import type { ProductDetail } from "@femxo/shared/contracts";

const rupees = (paise: number) => (paise / 100).toFixed(2);

/** schema.org Product for search engines: one Offer per variant, priced as a guest (the public price). */
export function productJsonLd(product: ProductDetail) {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const url = `${origin}/p/${product.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images.map((image) => `${origin}${image.src}`),
    brand: { "@type": "Brand", name: product.brand.name },
    sku: product.variants[0]!.sku,
    ...(product.ratingCount > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating.toFixed(1), reviewCount: product.ratingCount } }
      : {}),
    offers: product.variants.map((variant) => ({
      "@type": "Offer",
      sku: variant.sku,
      url,
      priceCurrency: "INR",
      price: rupees(variant.price),
      ...(variant.bestBefore ? { priceValidUntil: variant.bestBefore } : {}),
      availability: variant.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    })),
  };
}
