import type { Brand, Category } from "../../contracts/catalog";
import type { Review } from "../../contracts/people";
import { createRng, type Rng } from "../../lib/rng";
import type { Catalog, SeedProduct, SeedVariant } from "../domain/types";
import { BRANDS, CATEGORY_TEMPLATES, type ItemTemplate, type TopCategoryTemplate } from "./catalog-data";

const SEED = 20261024;
/** Fixed "today" for the seed, so batches and review dates never drift between builds. */
const BASE = Date.UTC(2026, 9, 24, 4, 30);
const DAY = 86_400_000;

const AUTHORS = [
  "Pooja K.", "Rahul V.", "Sunita D.", "Md. Arif", "Kiran S.", "Anjali M.", "Deepak P.", "Ritu K.", "Manoj J.", "Kavita J.",
  "Sanjeev M.", "Imran A.", "Nitin G.", "Sudha D.", "Ajay T.", "Rajesh P.", "Neha K.", "Vikash A.", "Priya S.", "Amit R.",
];
const PRAISE = ["Good quality", "Value for money", "Fresh and well packed", "Works as described", "Will buy again", "Arrived on time"];
const COMPLAINT = ["Packaging could be better", "A little expensive", "Not as fresh as expected", "Average quality"];
const BODIES: Record<number, readonly string[]> = {
  5: ["Exactly what I wanted. Fresh and well packed.", "Very happy with the quality. Delivery was quick too.", "Great value, I order this every month."],
  4: ["Good product overall, packing was fine.", "Quality is good for the price.", "Happy with it; delivery took a day longer than I hoped."],
  3: ["Okay for the price. Nothing special.", "Product is fine but the pack was a bit damaged."],
  2: ["Quality was below what I expected.", "Not as fresh as I hoped. Disappointed."],
  1: ["Not happy with this one.", "Poor quality; asked for a return."],
};

export const slugify = (text: string) =>
  text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const iso = (ms: number) => new Date(ms).toISOString();
const dateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function buildReviews(rng: Rng, productId: string, count: number): Review[] {
  return Array.from({ length: count }, (_, index) => {
    const roll = rng.next();
    const rating = roll < 0.5 ? 5 : roll < 0.78 ? 4 : roll < 0.9 ? 3 : roll < 0.96 ? 2 : 1;
    return {
      id: `rev-${productId}-${index + 1}`,
      author: rng.pick(AUTHORS),
      rating,
      title: rating >= 4 ? rng.pick(PRAISE) : rng.pick(COMPLAINT),
      body: rng.pick(BODIES[rating]!),
      createdAt: iso(BASE - rng.int(1, 180) * DAY - rng.int(0, 86_000) * 1000),
      verifiedPurchase: rng.chance(0.8),
    };
  });
}

function buildVariants(rng: Rng, item: ItemTemplate, top: TopCategoryTemplate, skuBase: string): SeedVariant[] {
  const gstBps = item.gstBps ?? top.gstBps;
  return item.sizes.map(([label, mrpRupees], index) => {
    const mrp = mrpRupees * 100;
    // Whole-rupee prices: price 0–14% under MRP, Prime a further 3–8% under that.
    const price = Math.max(100, Math.round((mrp * (1 - rng.int(0, 14) / 100)) / 100) * 100);
    const primePrice = Math.min(price, Math.max(100, Math.round((price * (1 - rng.int(3, 8) / 100)) / 100) * 100));
    const roll = rng.next();
    const stock = roll < 0.06 ? 0 : roll < 0.11 ? rng.int(1, 3) : rng.int(20, 800);
    const batchCount = rng.int(1, 2);
    return {
      id: `${skuBase}-v${index + 1}`,
      sku: `${skuBase}-${slugify(label).toUpperCase()}`,
      label,
      mrp,
      price,
      primePrice,
      gstBps,
      stock,
      maxPerOrder: rng.pick([5, 10]),
      batches: Array.from({ length: batchCount }, (_, batch) => ({
        code: `B-${rng.int(2100, 2299)}`,
        expiry: dateOnly(BASE + Math.max(30, top.shelfLifeDays - rng.int(0, 60) - batch * 30) * DAY),
      })),
    };
  });
}

/** The read-only demo catalogue: identical on every build and machine. */
export function buildCatalog(): Catalog {
  const rng = createRng(SEED);
  const categories: Category[] = [];
  const brands: Brand[] = BRANDS.map((name) => ({ id: `brd-${slugify(name)}`, slug: slugify(name), name }));
  const products: SeedProduct[] = [];
  const reviews: Record<string, Review[]> = {};

  for (const top of CATEGORY_TEMPLATES) {
    const topId = `cat-${top.slug}`;
    categories.push({ id: topId, slug: top.slug, name: top.name, parentId: null, image: `/categories/${top.slug}.webp`, productCount: 0 });

    for (const sub of top.subcategories) {
      const subId = `cat-${sub.slug}`;
      categories.push({ id: subId, slug: sub.slug, name: sub.name, parentId: topId, image: `/categories/${top.slug}.webp`, productCount: 0 });

      for (const item of sub.items) {
        for (const brandName of rng.shuffle(sub.brands).slice(0, 2)) {
          const slug = slugify(`${brandName} ${item.name}`);
          const id = `prd-${slug}`;
          const name = `${brandName} ${item.name}`;
          const reviewCount = rng.int(2, 13);
          const list = buildReviews(rng, id, reviewCount);
          reviews[id] = list;
          const average = list.reduce((sum, review) => sum + review.rating, 0) / list.length;
          products.push({
            id,
            slug,
            name,
            brandId: brands.find((brand) => brand.name === brandName)!.id,
            categoryId: subId,
            topCategoryId: topId,
            description: `${name} is ${top.blurb}. Sold by Femxo and delivered across Bihar.`,
            highlights: [...top.highlights],
            specs: [
              { label: "Brand", value: brandName },
              { label: "Category", value: sub.name },
              { label: "Pack sizes", value: item.sizes.map(([label]) => label).join(", ") },
            ],
            returnable: top.returnable,
            primeExclusive: rng.chance(0.06),
            badges: rng.chance(0.15) ? ["Bestseller"] : rng.chance(0.1) ? ["New"] : [],
            createdAt: iso(BASE - rng.int(10, 400) * DAY),
            image: `/products/${slug}.webp`,
            gallery: [],
            rating: Math.round(average * 10) / 10,
            ratingCount: reviewCount,
            variants: buildVariants(rng, item, top, `FX-${slug.toUpperCase()}`),
          });
        }
      }
    }
  }

  for (const category of categories) {
    category.productCount = products.filter((product) => product.categoryId === category.id || product.topCategoryId === category.id).length;
  }

  const banners = [
    { id: "ban-1", title: "Groceries for your family", subtitle: "Fresh food, daily essentials, better living", image: "/banners/groceries.webp", href: "/c/staples" },
    { id: "ban-2", title: "Cold drinks & beverages", subtitle: "Stay refreshed, stay energized", image: "/banners/beverages.webp", href: "/c/beverages" },
    { id: "ban-3", title: "Snacks & namkeen", subtitle: "Chips, kurkure, namkeen, biscuits and more", image: "/banners/snacks.webp", href: "/c/snacks" },
    { id: "ban-4", title: "Electronics & gadgets", subtitle: "Top brands, best prices, next-gen tech", image: "/banners/electronics.webp", href: "/search?q=electronics" },
  ];

  return { categories, brands, products, banners, reviews };
}
