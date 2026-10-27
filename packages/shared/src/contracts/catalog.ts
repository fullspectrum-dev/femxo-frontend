import { z } from "zod";
import { IsoDate, Paise } from "./common";

export const Category = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  image: z.string(),
  productCount: z.number().int().nonnegative(),
});
export type Category = z.infer<typeof Category>;

export const Brand = z.object({ id: z.string(), slug: z.string(), name: z.string() });
export type Brand = z.infer<typeof Brand>;

/** Without cross-field rules, so other schemas can reuse its shape (zod can't .pick a refined object). */
export const VariantBase = z.object({
  id: z.string(),
  sku: z.string(),
  /** "1 kg", "Pack of 2". */
  label: z.string(),
  mrp: Paise,
  price: Paise,
  primePrice: Paise,
  gstBps: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
  maxPerOrder: z.number().int().positive(),
  /** Nearest unexpired batch; null for non-perishables. */
  bestBefore: IsoDate.nullable(),
});

/** mrp ≥ price ≥ primePrice: no price may exceed MRP (Module 5 rule). */
export const Variant = VariantBase.superRefine((variant, ctx) => {
  if (variant.price > variant.mrp) ctx.addIssue({ code: "custom", path: ["price"], message: "Price can't exceed MRP" });
  if (variant.primePrice > variant.price) ctx.addIssue({ code: "custom", path: ["primePrice"], message: "Prime price can't exceed the price" });
});
export type Variant = z.infer<typeof Variant>;

/** What cards, lists and search results need. */
export const ProductSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  brand: Brand,
  categoryId: z.string(),
  image: z.string(),
  rating: z.number().min(0).max(5),
  ratingCount: z.number().int().nonnegative(),
  fromPrice: Paise,
  /** The variant whose price is shown ("from"): what a card's quick-add puts in the cart. */
  variantId: z.string(),
  variantCount: z.number().int().positive(),
  fromPrimePrice: Paise,
  mrp: Paise,
  inStock: z.boolean(),
  primeExclusive: z.boolean(),
  badges: z.array(z.string()),
});
export type ProductSummary = z.infer<typeof ProductSummary>;

export const ProductDetail = ProductSummary.extend({
  description: z.string(),
  highlights: z.array(z.string()),
  images: z.array(z.object({ src: z.string(), alt: z.string() })).min(1),
  variants: z.array(Variant).min(1),
  returnable: z.boolean(),
  specs: z.array(z.object({ label: z.string(), value: z.string() })),
  breadcrumbs: z.array(Category.pick({ id: true, slug: true, name: true })),
});
export type ProductDetail = z.infer<typeof ProductDetail>;

export const Banner = z.object({ id: z.string(), title: z.string(), subtitle: z.string(), image: z.string(), href: z.string() });
export type Banner = z.infer<typeof Banner>;

export const HomeContent = z.object({
  banners: z.array(Banner),
  deals: z.array(ProductSummary),
  featuredCategories: z.array(Category),
  primePicks: z.array(ProductSummary),
});
export type HomeContent = z.infer<typeof HomeContent>;

/** Live stock and the price for this shopper's tier, refreshed over prerendered pages. */
export const Availability = z.object({
  variantId: z.string(),
  stock: z.number().int().nonnegative(),
  price: Paise,
  primePrice: Paise,
  appliedPrice: Paise,
});
export type Availability = z.infer<typeof Availability>;

/** A customer's saved products, newest first. */
export const Wishlist = z.object({ items: z.array(ProductSummary).max(200) });
export type Wishlist = z.infer<typeof Wishlist>;
