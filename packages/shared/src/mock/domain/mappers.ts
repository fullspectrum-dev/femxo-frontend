import type { ProductDetail, ProductSummary, Variant } from "../../contracts/catalog";
import type { Catalog, MockState, SeedProduct, SeedVariant } from "./types";

const IST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

/** Today in India as YYYY-MM-DD (dates compare as strings). */
export const istDate = (now: Date) => IST_DATE.format(now);

/** Current stock: the browser's override after orders, else the seed value. */
export type StockLookup = (variant: SeedVariant) => number;
const seedStock: StockLookup = (variant) => variant.stock;

/** Stock as this browser sees it: the seed, less what its orders took. */
export const stockFor =
  (state: MockState): StockLookup =>
  (variant) =>
    state.stock[variant.id] ?? variant.stock;

/** The nearest batch that hasn't expired yet; null when none is dated. */
export function bestBefore(variant: SeedVariant, now: Date) {
  const today = istDate(now);
  return variant.batches.map((batch) => batch.expiry).filter((expiry) => expiry >= today).sort()[0] ?? null;
}

export function toVariant(variant: SeedVariant, now: Date, stock: StockLookup = seedStock): Variant {
  return {
    id: variant.id,
    sku: variant.sku,
    label: variant.label,
    mrp: variant.mrp,
    price: variant.price,
    primePrice: variant.primePrice,
    gstBps: variant.gstBps,
    stock: stock(variant),
    maxPerOrder: variant.maxPerOrder,
    bestBefore: bestBefore(variant, now),
  };
}

export function toProductSummary(product: SeedProduct, catalog: Catalog, stock: StockLookup = seedStock): ProductSummary {
  const brand = catalog.brands.find((entry) => entry.id === product.brandId)!;
  const inStock = product.variants.filter((variant) => stock(variant) > 0);
  // "From" price: the cheapest variant you can buy now (or any, when all are out).
  const cheapest = [...(inStock.length ? inStock : product.variants)].sort((a, b) => a.price - b.price)[0]!;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    brand,
    categoryId: product.categoryId,
    image: product.image,
    rating: product.rating,
    ratingCount: product.ratingCount,
    fromPrice: cheapest.price,
    variantId: cheapest.id,
    variantCount: product.variants.length,
    fromPrimePrice: cheapest.primePrice,
    mrp: cheapest.mrp,
    inStock: inStock.length > 0,
    primeExclusive: product.primeExclusive,
    badges: product.badges,
  };
}

export function toProductDetail(product: SeedProduct, catalog: Catalog, now: Date, stock: StockLookup = seedStock): ProductDetail {
  const sub = catalog.categories.find((category) => category.id === product.categoryId)!;
  const top = catalog.categories.find((category) => category.id === product.topCategoryId)!;
  return {
    ...toProductSummary(product, catalog, stock),
    description: product.description,
    highlights: product.highlights,
    images: [{ src: product.image, alt: product.name }, ...product.gallery],
    variants: product.variants.map((variant) => toVariant(variant, now, stock)),
    returnable: product.returnable,
    specs: product.specs,
    breadcrumbs: [top, sub].map(({ id, slug, name }) => ({ id, slug, name })),
  };
}
