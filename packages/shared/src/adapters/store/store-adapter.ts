import type { ApiAdapter, ApiRequest, ApiResponse } from "../../api/adapter";
import type { Banner, Brand, Category, ProductDetail, ProductSummary } from "../../contracts/catalog";
import { packArtUrl } from "../../lib/pack-art";

/*
 * The storefront's adapter for femxo-backend. The backend publishes an identity-free catalog under
 * /store/v1 (categories, brands, products, product by slug); this maps it onto the storefront's
 * contracts. Requests that already address /store/v1 (customer sign-in, /me, /me/location) go to the
 * backend untouched: the domain clients speak its shapes directly. A signed-in customer's own prices
 * come from GET /store/v1/me/prices. Cart, addresses, checkout, orders, payments, Prime, wishlist and reviews are
 * /store/v1 routes the domain clients call directly. What is still missing on the backend (support tickets, ratings
 * on product cards) answers 503 NOT_AVAILABLE with a plain message, so the UI shows an honest "not available yet".
 * One adapter route is ours: GET /catalog/lookup?variantIds=&productIds= joins ids (cart, orders, wishlist carry ids
 * only) with names, pictures and packs from the cached catalogue.
 *
 * Search, filters and sorting run here over the catalog (cached for a minute), because the public
 * catalog API lists by category or brand only (no `q`, no price filter).
 */

interface StoreCategory {
  id: string;
  name: string;
  slug: string;
  /** Null until the admin uploads a picture; a URL string or an image set, depending on the backend version. */
  image?: string | { urls?: { small?: string; medium?: string } } | null;
  hasChildren: boolean;
}
interface StoreBrand {
  id: string;
  name: string;
  slug: string;
}
interface StoreVariant {
  id: string;
  sku: string;
  barcode: string;
  label: string;
  mrp: number;
  price: number;
  /** Added by the stock work (ADR 0016): absent when the stock lookup failed on the backend. */
  inStock?: boolean;
  /** 0 up to the backend's display cap (STORE_STOCK_DISPLAY_CAP); the exact stock is never published. */
  availableQty?: number;
}
interface CustomerPrice {
  pricePaise: number;
  regularPricePaise: number;
  tier: string;
}
interface StoreProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  brandId: string;
  categoryId: string;
  categoryPath: string[];
  gstRateBp: number;
  variants: StoreVariant[];
  images: { id: string; alt: string; urls: { small: string; medium: string; large: string } }[];
}

/*
 * A product's own photo always wins. Until one is uploaded, drawn pack art carries the product's real
 * name and brand (a plainly drawn placeholder, never a photo of something else).
 */
function fallbackImage(p: StoreProduct, brandName: string): string {
  return packArtUrl({ name: p.name, brand: brandName, toneKey: p.categoryPath[0] ?? p.categoryId });
}

/** Offers shown while the backend has no banners of its own: flat Femxo artwork, claims the store can stand behind. */
export const STORE_BANNERS: Banner[] = [
  { id: "store-groceries", title: "Fresh groceries at your doorstep", subtitle: "Daily needs delivered across Bihar", image: "/banners/groceries.webp", href: "/search" },
  { id: "store-dairy", title: "Pure goodness dairy", subtitle: "Milk, curd, ghee and more", image: "/banners/dairy.webp", href: "/search?q=dairy" },
  { id: "store-vegetables", title: "Fresh vegetables, farm to home", subtitle: "Picked fresh and delivered fast", image: "/banners/vegetables.webp", href: "/search?q=vegetables" },
  { id: "store-drinks-snacks", title: "Chill drinks and snack feast", subtitle: "Cold drinks and snacks for every mood", image: "/banners/drinks-snacks.webp", href: "/search?q=snacks" },
  { id: "store-beauty", title: "Beauty and personal care essentials", subtitle: "Everyday care at honest prices", image: "/banners/beauty.webp", href: "/search?q=beauty" },
  { id: "store-home-care", title: "Home care essentials", subtitle: "Cleaning and household basics", image: "/banners/home-care.webp", href: "/search?q=home+care" },
  { id: "store-electronics", title: "Modern electronics, smarter living", subtitle: "Smart picks for your home", image: "/banners/electronics.webp", href: "/search?q=electronics" },
];

/** The category picture as a URL, or "" when there is none (the storefront then draws a lettered tile). */
function categoryImage(image: StoreCategory["image"]): string {
  if (!image) return "";
  if (typeof image === "string") return image;
  return image.urls?.medium ?? image.urls?.small ?? "";
}
/** When the backend sends no stock for a variant (lookup failed), it is treated as orderable up to this many (and says `stockKnown: false`). */
const ORDERABLE_UP_TO = 10;
/** The most one cart line may hold on the storefront; the backend's own limit (CART_MAX_LINE_QUANTITY) has the last word. */
const MAX_PER_ORDER = 50;
const STORE_PREFIX = "/store/v1";
const POOL_LIMIT = 1000;
const PAGE = 100;
const TTL_MS = 60_000;
const DEFAULT_LIMIT = 24;

const json = (body: unknown, status = 200): ApiResponse => ({ status, body });
const fail = (status: number, code: string, message: string): ApiResponse => ({ status, body: { error: { code, message } } });
const unavailable = (what: string) => fail(503, "NOT_AVAILABLE", `${what} isn't available yet.`);

interface Snapshot {
  at: number;
  categories: Category[];
  brands: Brand[];
  products: StoreProduct[];
}

export function createStoreAdapter(http: ApiAdapter): ApiAdapter {
  let snapshot: Promise<Snapshot> | undefined;
  let builtAt = 0;

  async function get<T>(path: string, query?: ApiRequest["query"]): Promise<T> {
    const res = await http.send({ method: "GET", path: `/store/v1${path}`, query });
    if (res.status < 200 || res.status >= 300) throw new StoreError(res.status);
    return res.body as T;
  }

  /** The signed-in customer's prices (GET /me/prices). Any failure means "no overlay": the public price is still right to show. */
  async function customerPrices(accessToken: string | undefined, variantIds: string[]): Promise<Record<string, CustomerPrice>> {
    if (!accessToken || variantIds.length === 0) return {};
    try {
      const res = await http.send({ method: "GET", path: `${STORE_PREFIX}/me/prices`, query: { variantIds: variantIds.slice(0, 50).join(",") }, accessToken });
      const prices = (res.body as { prices?: Record<string, CustomerPrice> } | null)?.prices;
      return res.status === 200 && prices ? prices : {};
    } catch {
      return {};
    }
  }

  async function loadCategories(): Promise<Category[]> {
    const out: Category[] = [];
    const walk = async (parentId: string | null, depth: number): Promise<void> => {
      const res = await get<{ items: StoreCategory[] }>("/categories", parentId ? { parentId } : undefined);
      for (const c of res.items) {
        out.push({ id: c.id, slug: c.slug, name: c.name, parentId, image: categoryImage(c.image) || packArtUrl({ name: c.name, brand: "Femxo", toneKey: c.id }), productCount: 0 });
        if (c.hasChildren && depth < 3) await walk(c.id, depth + 1);
      }
    };
    await walk(null, 0);
    return out;
  }

  async function loadBrands(): Promise<Brand[]> {
    const out: Brand[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i++) {
      const res: { items: StoreBrand[]; nextCursor: string | null } = await get("/brands", { limit: PAGE, cursor });
      out.push(...res.items.map((b) => ({ id: b.id, slug: b.slug, name: b.name })));
      cursor = res.nextCursor;
      if (!cursor) break;
    }
    return out;
  }

  async function loadProducts(): Promise<StoreProduct[]> {
    const out: StoreProduct[] = [];
    let cursor: string | null = null;
    while (out.length < POOL_LIMIT) {
      const res: { products: StoreProduct[]; nextCursor: string | null } = await get("/products", { limit: PAGE, cursor });
      out.push(...res.products.filter((p) => p.variants.length > 0));
      cursor = res.nextCursor;
      if (!cursor) break;
    }
    return out;
  }

  function current(): Promise<Snapshot> {
    if (!snapshot || Date.now() - builtAt > TTL_MS) {
      builtAt = Date.now();
      const next = Promise.all([loadCategories(), loadBrands(), loadProducts()]).then(([categories, brands, products]) => {
        const counts = new Map<string, number>();
        for (const p of products) for (const id of p.categoryPath) counts.set(id, (counts.get(id) ?? 0) + 1);
        return { at: Date.now(), categories: categories.map((c) => ({ ...c, productCount: counts.get(c.id) ?? 0 })), brands, products };
      });
      // A failed load is not kept: the next request tries again.
      next.catch(() => {
        if (snapshot === next) snapshot = undefined;
      });
      snapshot = next;
    }
    return snapshot;
  }

  /** Products and variants for ids, from the cached catalogue; ids the catalogue (up to 1000 products) does not hold are left out. */
  async function lookup(variantIds: unknown, productIds: unknown) {
    const split = (value: unknown) => asList(value).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean).slice(0, 100);
    const wantedVariants = new Set(split(variantIds));
    const wantedProducts = new Set(split(productIds));
    const snap = await current();
    const byId = brandIndex(snap.brands);
    const products: ProductSummary[] = [];
    const variants: Record<string, { productId: string; variant: ProductDetail["variants"][number] }> = {};
    for (const p of snap.products) {
      const hits = p.variants.filter((v) => wantedVariants.has(v.id));
      if (hits.length === 0 && !wantedProducts.has(p.id)) continue;
      const detail = detailOf(p, snap);
      products.push(summary(p, byId));
      for (const v of detail.variants) if (wantedVariants.has(v.id)) variants[v.id] = { productId: p.id, variant: v };
    }
    return { products, variants };
  }

  return {
    async send(req: ApiRequest): Promise<ApiResponse> {
      // Customer sign-in, /me and the rest of /store/v1 already speak the backend's own shapes.
      if (req.path === STORE_PREFIX || req.path.startsWith(`${STORE_PREFIX}/`)) return http.send(req);
      if (req.method !== "GET") return unavailable("This");
      try {
        return await route(req);
      } catch (error) {
        if (error instanceof StoreError) {
          if (error.status === 404) return fail(404, "NOT_FOUND", "Not found.");
          return fail(error.status === 0 ? 503 : 502, "INTERNAL", "The catalog is not reachable right now. Please try again.");
        }
        return fail(502, "INTERNAL", "The catalog is not reachable right now. Please try again.");
      }
    },
  };

  async function route(req: ApiRequest): Promise<ApiResponse> {
    const path = req.path;
    const q = req.query ?? {};

    if (path === "/storefront/home") {
      const { categories, brands, products } = await current();
      const byId = brandIndex(brands);
      const deals = [...products].sort((a, b) => discountOf(b) - discountOf(a)).slice(0, 12).map((p) => summary(p, byId));
      return json({ banners: STORE_BANNERS, deals, featuredCategories: categories.filter((c) => c.parentId === null), primePicks: [] });
    }
    if (path === "/catalog/categories") return json((await current()).categories);
    if (path === "/catalog/brands") return json((await current()).brands);

    if (path === "/catalog/products" || path === "/search") {
      const snap = await current();
      return json(listing(snap, q));
    }

    if (path === "/search/suggest") {
      const snap = await current();
      const needle = String(q.q ?? "").trim().toLowerCase();
      if (needle.length < 2) return json([]);
      const products = snap.products.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 5).map((p) => ({ kind: "product", label: p.name, href: `/p/${p.slug}` }));
      const categories = snap.categories.filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 2).map((c) => ({ kind: "category", label: c.name, href: `/c/${c.slug}` }));
      const brands = snap.brands.filter((b) => b.name.toLowerCase().includes(needle)).slice(0, 2).map((b) => ({ kind: "brand", label: b.name, href: `/search?brand=${b.id}` }));
      return json([...categories, ...brands, ...products]);
    }

    if (path === "/catalog/lookup") return json(await lookup(q.variantIds, q.productIds));

    const detail = /^\/catalog\/products\/([^/]+)(?:\/(related|availability))?$/.exec(path);
    if (detail) {
      const slug = decodeURIComponent(detail[1]!);
      const part = detail[2];
      const snap = await current();
      if (part === "related") {
        const self = snap.products.find((p) => p.slug === slug);
        const byId = brandIndex(snap.brands);
        const related = self ? snap.products.filter((p) => p.id !== self.id && p.categoryId === self.categoryId).slice(0, 8) : [];
        return json(related.map((p) => summary(p, byId)));
      }
      let product = snap.products.find((p) => p.slug === slug) ?? (await get<{ product: StoreProduct }>(`/products/${encodeURIComponent(slug)}`)).product;
      if (part === "availability") {
        // Live numbers: the cached catalogue can be a minute old, and stock moves faster than that.
        product = (await get<{ product: StoreProduct }>(`/products/${encodeURIComponent(slug)}`)).product;
        const own = await customerPrices(req.accessToken, product.variants.map((v) => v.id));
        return json(
          product.variants.map((v) => {
            const mine = own[v.id];
            // The public price is the selling price; a Prime member's overlay is lower, and says what they'd pay without it.
            const regular = mine?.regularPricePaise ?? v.price;
            const applied = mine?.pricePaise ?? v.price;
            return { variantId: v.id, stock: v.availableQty ?? ORDERABLE_UP_TO, price: regular, primePrice: mine?.tier === "prime" ? applied : regular, appliedPrice: applied };
          })
        );
      }
      return json(detailOf(product, snap));
    }

    return unavailable("This part of the store");
  }
}

class StoreError extends Error {
  constructor(readonly status: number) {
    super(`Catalog request failed with ${status}`);
  }
}

const brandIndex = (brands: Brand[]) => new Map(brands.map((b) => [b.id, b]));
const cheapest = (p: StoreProduct) => p.variants.reduce((a, b) => (b.price < a.price ? b : a));
const discountOf = (p: StoreProduct) => {
  const v = cheapest(p);
  return v.mrp > 0 ? (v.mrp - v.price) / v.mrp : 0;
};

function summary(p: StoreProduct, brands: Map<string, Brand>): ProductSummary {
  const v = cheapest(p);
  const brand = brands.get(p.brandId) ?? { id: p.brandId, slug: "", name: "Femxo" };
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand,
    categoryId: p.categoryId,
    image: p.images[0]?.urls.medium ?? fallbackImage(p, brand.name),
    rating: 0,
    ratingCount: 0,
    fromPrice: v.price,
    variantId: v.id,
    variantCount: p.variants.length,
    packLabel: v.label,
    fromPrimePrice: v.price,
    mrp: v.mrp,
    inStock: p.variants.some((variant) => variant.inStock !== false),
    primeExclusive: false,
    badges: [],
  };
}

function detailOf(p: StoreProduct, snap: Snapshot): ProductDetail {
  const byId = brandIndex(snap.brands);
  const categories = new Map(snap.categories.map((c) => [c.id, c]));
  const base = summary(p, byId);
  const first = p.variants[0]!;
  return {
    ...base,
    description: p.description,
    highlights: [],
    images: p.images.length ? p.images.map((i) => ({ src: i.urls.large, alt: i.alt || p.name })) : [{ src: base.image, alt: `${base.brand.name} ${p.name}` }],
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      label: v.label,
      mrp: v.mrp,
      price: v.price,
      primePrice: v.price,
      gstBps: p.gstRateBp,
      stock: v.availableQty ?? ORDERABLE_UP_TO,
      stockKnown: v.availableQty !== undefined,
      maxPerOrder: MAX_PER_ORDER,
      bestBefore: null,
    })),
    returnable: false,
    specs: [
      { label: "Pack", value: first.label },
      { label: "SKU", value: first.sku },
      ...(first.barcode ? [{ label: "Barcode", value: first.barcode }] : []),
    ],
    breadcrumbs: p.categoryPath.flatMap((id) => {
      const c = categories.get(id);
      return c ? [{ id: c.id, slug: c.slug, name: c.name }] : [];
    }),
  };
}

const BUCKETS: { min: number; max: number | null }[] = [
  { min: 0, max: 10_000 },
  { min: 10_000, max: 25_000 },
  { min: 25_000, max: 50_000 },
  { min: 50_000, max: 100_000 },
  { min: 100_000, max: null },
];

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value === undefined || value === null || value === "" ? [] : [String(value)];
}

function listing(snap: Snapshot, q: NonNullable<ApiRequest["query"]>) {
  const byId = brandIndex(snap.brands);
  const words = String(q.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const categoryKey = q.category ? String(q.category) : "";
  const category = categoryKey ? snap.categories.find((c) => c.slug === categoryKey || c.id === categoryKey) : undefined;
  if (categoryKey && !category) return empty();

  let pool = snap.products.filter((p) => {
    if (category && !p.categoryPath.includes(category.id)) return false;
    const hay = `${p.name} ${byId.get(p.brandId)?.name ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const forFacets = pool;

  const brandKeys = asList(q.brand);
  if (brandKeys.length) {
    const ids = new Set(snap.brands.filter((b) => brandKeys.includes(b.id) || brandKeys.includes(b.slug)).map((b) => b.id));
    pool = pool.filter((p) => ids.has(p.brandId));
  }
  const min = q.minPrice === undefined ? undefined : Number(q.minPrice);
  const max = q.maxPrice === undefined ? undefined : Number(q.maxPrice);
  pool = pool.filter((p) => {
    const price = cheapest(p).price;
    return (min === undefined || price >= min) && (max === undefined || price < max);
  });

  const sort = String(q.sort ?? "relevance");
  if (sort === "price_asc") pool = [...pool].sort((a, b) => cheapest(a).price - cheapest(b).price);
  else if (sort === "price_desc") pool = [...pool].sort((a, b) => cheapest(b).price - cheapest(a).price);
  else if (sort === "discount") pool = [...pool].sort((a, b) => discountOf(b) - discountOf(a));

  const limit = Math.min(Math.max(Number(q.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1), 100);
  const offset = q.cursor ? Math.max(Number(String(q.cursor).replace(/^o:/, "")) || 0, 0) : 0;
  const items = pool.slice(offset, offset + limit).map((p) => summary(p, byId));
  const nextCursor = offset + limit < pool.length ? `o:${offset + limit}` : null;

  const facets = {
    brands: snap.brands
      .map((b) => ({ id: b.id, name: b.name, count: forFacets.filter((p) => p.brandId === b.id).length }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.count - a.count),
    priceBuckets: BUCKETS.map((b) => ({ ...b, count: forFacets.filter((p) => cheapest(p).price >= b.min && (b.max === null || cheapest(p).price < b.max)).length })),
    ratings: [],
    primeCount: 0,
  };
  return { items, nextCursor, total: pool.length, facets, correctedQuery: null };

  function empty() {
    return { items: [], nextCursor: null, total: 0, facets: { brands: [], priceBuckets: [], ratings: [], primeCount: 0 }, correctedQuery: null };
  }
}
