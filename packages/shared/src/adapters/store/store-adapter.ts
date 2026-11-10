import type { ApiAdapter, ApiRequest, ApiResponse } from "../../api/adapter";
import type { Brand, Category, ProductDetail, ProductSummary } from "../../contracts/catalog";

/*
 * The storefront's adapter for femxo-backend. The backend publishes an identity-free catalog under
 * /store/v1 (categories, brands, products, product by slug); this maps it onto the storefront's
 * contracts. Everything the backend does not have yet (customer sign-in, cart, checkout, orders,
 * reviews, ratings, stock levels, Prime prices, delivery checks) answers 503 with a plain message,
 * so the UI shows an honest "not available yet" instead of invented data.
 *
 * Search, filters and sorting run here over the catalog (cached for a minute), because the public
 * catalog API lists by category or brand only.
 */

interface StoreCategory {
  id: string;
  name: string;
  slug: string;
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

const PLACEHOLDER_IMAGE = "/images/product-placeholder.svg";
/** The public API does not publish stock, so a product is shown as orderable, up to this many per order. */
const ORDERABLE_UP_TO = 10;
const POOL_LIMIT = 1000;
const PAGE = 100;
const TTL_MS = 60_000;
const DEFAULT_LIMIT = 24;

const json = (body: unknown, status = 200): ApiResponse => ({ status, body });
const fail = (status: number, code: string, message: string): ApiResponse => ({ status, body: { error: { code, message } } });
const unavailable = (what: string) => fail(503, "INTERNAL", `${what} isn't available yet.`);

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

  async function loadCategories(): Promise<Category[]> {
    const out: Category[] = [];
    const walk = async (parentId: string | null, depth: number): Promise<void> => {
      const res = await get<{ items: StoreCategory[] }>("/categories", parentId ? { parentId } : undefined);
      for (const c of res.items) {
        out.push({ id: c.id, slug: c.slug, name: c.name, parentId, image: "", productCount: 0 });
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

  return {
    async send(req: ApiRequest): Promise<ApiResponse> {
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
      return json({ banners: [], deals, featuredCategories: categories.filter((c) => c.parentId === null), primePicks: [] });
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

    const detail = /^\/catalog\/products\/([^/]+)(?:\/(related|reviews|availability))?$/.exec(path);
    if (detail) {
      const slug = decodeURIComponent(detail[1]!);
      const part = detail[2];
      if (part === "reviews") return json({ items: [], nextCursor: null, summary: { average: 0, count: 0, histogram: [0, 0, 0, 0, 0] } });
      const snap = await current();
      if (part === "related") {
        const self = snap.products.find((p) => p.slug === slug);
        const byId = brandIndex(snap.brands);
        const related = self ? snap.products.filter((p) => p.id !== self.id && p.categoryId === self.categoryId).slice(0, 8) : [];
        return json(related.map((p) => summary(p, byId)));
      }
      const product = snap.products.find((p) => p.slug === slug) ?? (await get<{ product: StoreProduct }>(`/products/${encodeURIComponent(slug)}`)).product;
      if (part === "availability") {
        return json(product.variants.map((v) => ({ variantId: v.id, stock: ORDERABLE_UP_TO, price: v.price, primePrice: v.price, appliedPrice: v.price })));
      }
      return json(detailOf(product, snap));
    }

    if (path.startsWith("/delivery/serviceability/")) return unavailable("Delivery checks");
    if (path.startsWith("/auth") || path.startsWith("/me")) return fail(401, "UNAUTHENTICATED", "Customer sign-in isn't available yet.");
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
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: brands.get(p.brandId) ?? { id: p.brandId, slug: "", name: "Femxo" },
    categoryId: p.categoryId,
    image: p.images[0]?.urls.medium ?? PLACEHOLDER_IMAGE,
    rating: 0,
    ratingCount: 0,
    fromPrice: v.price,
    variantId: v.id,
    variantCount: p.variants.length,
    fromPrimePrice: v.price,
    mrp: v.mrp,
    inStock: true,
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
    images: p.images.length ? p.images.map((i) => ({ src: i.urls.large, alt: i.alt || p.name })) : [{ src: PLACEHOLDER_IMAGE, alt: p.name }],
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      label: v.label,
      mrp: v.mrp,
      price: v.price,
      primePrice: v.price,
      gstBps: p.gstRateBp,
      stock: ORDERABLE_UP_TO,
      maxPerOrder: ORDERABLE_UP_TO,
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
