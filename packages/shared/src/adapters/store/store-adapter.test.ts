import { describe, expect, it, vi } from "vitest";
import type { ApiAdapter, ApiRequest, ApiResponse } from "../../api/adapter";
import { createStoreAdapter } from "./store-adapter";

/*
 * The store adapter over a fake femxo-backend /store/v1. Only the http
 * adapter is mocked; the mapping under test is the real one.
 */

const variant = (id: string, price: number, mrp: number, label = "1 kg") => ({ id, sku: `SKU-${id}`, barcode: "", label, mrp, price });

const PRODUCTS = [
  {
    id: "p1",
    name: "Basmati Rice",
    slug: "basmati-rice",
    description: "Long grain",
    brandId: "b1",
    categoryId: "c2",
    categoryPath: ["c1", "c2"],
    gstRateBp: 500,
    variants: [variant("v1", 20_000, 25_000, "5 kg"), variant("v2", 5_000, 6_000)],
    images: [{ id: "i1", alt: "", urls: { small: "/s.webp", medium: "/m.webp", large: "/l.webp" } }],
  },
  {
    id: "p2",
    name: "Toor Dal",
    slug: "toor-dal",
    description: "",
    brandId: "b2",
    categoryId: "c2",
    categoryPath: ["c1", "c2"],
    gstRateBp: 0,
    variants: [variant("v3", 15_000, 30_000)],
    images: [],
  },
  { id: "p3", name: "No Variants", slug: "none", description: "", brandId: "b1", categoryId: "c2", categoryPath: ["c1"], gstRateBp: 0, variants: [], images: [] },
];

function fakeBackend(overrides: Partial<Record<string, ApiResponse>> = {}, catalog: typeof PRODUCTS = PRODUCTS) {
  const send = vi.fn(async (req: ApiRequest): Promise<ApiResponse> => {
    const o = overrides[req.path];
    if (o) return o;
    switch (req.path) {
      case "/store/v1/categories":
        return req.query?.parentId
          ? { status: 200, body: { items: [{ id: "c2", name: "Rice", slug: "rice", image: { urls: { small: "/c2s.webp" } }, hasChildren: false }] } }
          : { status: 200, body: { items: [{ id: "c1", name: "Staples", slug: "staples", image: "/c1.webp", hasChildren: true }] } };
      case "/store/v1/brands":
        return { status: 200, body: { items: [{ id: "b1", name: "Femxo Select", slug: "femxo-select" }, { id: "b2", name: "Daily", slug: "daily" }], nextCursor: null } };
      case "/store/v1/products":
        return { status: 200, body: { products: catalog, nextCursor: null } };
      default: {
        const bySlug = /^\/store\/v1\/products\/([^/]+)$/.exec(req.path);
        const found = bySlug && catalog.find((p) => p.slug === bySlug[1]);
        return found ? { status: 200, body: { product: found } } : { status: 404, body: null };
      }
    }
  });
  return { http: { send } satisfies ApiAdapter, send };
}

const get = (adapter: ApiAdapter, path: string, query?: ApiRequest["query"]) => adapter.send({ method: "GET", path, query });

describe("createStoreAdapter: catalog mapping", () => {
  it("maps categories (tree walk, image shapes, product counts)", async () => {
    const { http } = fakeBackend();
    const res = await get(createStoreAdapter(http), "/catalog/categories");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: "c1", slug: "staples", name: "Staples", parentId: null, image: "/c1.webp", productCount: 2 },
      { id: "c2", slug: "rice", name: "Rice", parentId: "c1", image: "/c2s.webp", productCount: 2 },
    ]);
  });

  it("maps brands", async () => {
    const { http } = fakeBackend();
    const res = await get(createStoreAdapter(http), "/catalog/brands");
    expect(res.body).toEqual([
      { id: "b1", slug: "femxo-select", name: "Femxo Select" },
      { id: "b2", slug: "daily", name: "Daily" },
    ]);
  });

  it("lists products as summaries from the cheapest variant, dropping products without variants", async () => {
    const { http } = fakeBackend();
    const res = await get(createStoreAdapter(http), "/catalog/products");
    const body = res.body as { items: Record<string, unknown>[]; total: number; nextCursor: string | null };
    expect(body.total).toBe(2);
    expect(body.nextCursor).toBeNull();
    expect(body.items[0]).toMatchObject({
      id: "p1",
      slug: "basmati-rice",
      brand: { id: "b1", name: "Femxo Select" },
      image: "/m.webp",
      fromPrice: 5_000,
      mrp: 6_000,
      variantId: "v2",
      variantCount: 2,
      packLabel: "1 kg",
      inStock: true,
    });
    // No own photo: a generated fallback, never empty.
    expect(body.items[1]!.image).toEqual(expect.any(String));
    expect(body.items[1]!.image).not.toBe("");
  });

  it("filters by brand and sorts by price", async () => {
    const { http } = fakeBackend();
    const store = createStoreAdapter(http);
    const byBrand = (await get(store, "/catalog/products", { brand: "daily" })).body as { items: { id: string }[] };
    expect(byBrand.items.map((i) => i.id)).toEqual(["p2"]);
    const desc = (await get(store, "/catalog/products", { sort: "price_desc" })).body as { items: { id: string }[] };
    expect(desc.items.map((i) => i.id)).toEqual(["p2", "p1"]);
    const unknownCategory = (await get(store, "/catalog/products", { category: "nope" })).body as { total: number };
    expect(unknownCategory.total).toBe(0);
  });

  it("maps product detail with variants, breadcrumbs and specs", async () => {
    const { http } = fakeBackend();
    const res = await get(createStoreAdapter(http), "/catalog/products/basmati-rice");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: "p1",
      description: "Long grain",
      images: [{ src: "/l.webp", alt: "Basmati Rice" }],
      variants: [
        { id: "v1", sku: "SKU-v1", price: 20_000, gstBps: 500 },
        { id: "v2", sku: "SKU-v2", price: 5_000, gstBps: 500 },
      ],
      breadcrumbs: [
        { id: "c1", slug: "staples" },
        { id: "c2", slug: "rice" },
      ],
      specs: [
        { label: "Pack", value: "5 kg" },
        { label: "SKU", value: "SKU-v1" },
      ],
    });
  });

  it("caches the catalog between requests", async () => {
    const { http, send } = fakeBackend();
    const store = createStoreAdapter(http);
    await get(store, "/catalog/brands");
    const calls = send.mock.calls.length;
    await get(store, "/catalog/categories");
    expect(send.mock.calls.length).toBe(calls);
  });
});

describe("createStoreAdapter: errors", () => {
  it("answers writes with 503 NOT_AVAILABLE", async () => {
    const { http, send } = fakeBackend();
    const res = await createStoreAdapter(http).send({ method: "POST", path: "/cart/items", body: {} });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: { code: "NOT_AVAILABLE" } });
    expect(send).not.toHaveBeenCalled();
  });

  it("passes /store/v1 requests (sign-in, /me) to the backend untouched", async () => {
    const { http, send } = fakeBackend({ "/store/v1/me": { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "Authentication required" } } } });
    const res = await createStoreAdapter(http).send({ method: "GET", path: "/store/v1/me", accessToken: "t" });
    expect(res).toMatchObject({ status: 401, body: { error: { code: "UNAUTHENTICATED" } } });
    expect(send).toHaveBeenCalledWith({ method: "GET", path: "/store/v1/me", accessToken: "t" });
  });

  it("maps a backend 5xx to 502 INTERNAL and retries on the next request", async () => {
    const { http, send } = fakeBackend({ "/store/v1/brands": { status: 500, body: null } });
    const store = createStoreAdapter(http);
    const res = await get(store, "/catalog/brands");
    expect(res).toMatchObject({ status: 502, body: { error: { code: "INTERNAL" } } });
    const before = send.mock.calls.length;
    await get(store, "/catalog/brands");
    expect(send.mock.calls.length).toBeGreaterThan(before);
  });

  it("maps an unknown product slug to 404 NOT_FOUND", async () => {
    const { http } = fakeBackend();
    const res = await get(createStoreAdapter(http), "/catalog/products/missing");
    expect(res).toMatchObject({ status: 404, body: { error: { code: "NOT_FOUND" } } });
  });

  it("maps a thrown network error to 502", async () => {
    const http: ApiAdapter = { send: vi.fn(async () => Promise.reject(new Error("offline"))) };
    const res = await get(createStoreAdapter(http), "/catalog/categories");
    expect(res.status).toBe(502);
  });
});

describe("createStoreAdapter: prices for a signed-in customer", () => {
  const prices = { v1: { pricePaise: 18_000, regularPricePaise: 20_000, tier: "prime" }, v2: { pricePaise: 5_000, regularPricePaise: 5_000, tier: "prime" } };

  it("overlays /me/prices with the token, as the applied price", async () => {
    const { http, send } = fakeBackend({ "/store/v1/me/prices": { status: 200, body: { prices } } });
    const res = await createStoreAdapter(http).send({ method: "GET", path: "/catalog/products/basmati-rice/availability", accessToken: "tok" });
    expect(res.body).toEqual([
      { variantId: "v1", stock: 10, price: 20_000, primePrice: 18_000, appliedPrice: 18_000 },
      { variantId: "v2", stock: 10, price: 5_000, primePrice: 5_000, appliedPrice: 5_000 },
    ]);
    const call = send.mock.calls.find(([r]) => r.path === "/store/v1/me/prices")![0];
    expect(call).toMatchObject({ accessToken: "tok", query: { variantIds: "v1,v2" } });
  });

  it("shows the public selling price when signed out or when the overlay fails", async () => {
    const out = fakeBackend();
    const anon = await createStoreAdapter(out.http).send({ method: "GET", path: "/catalog/products/basmati-rice/availability" });
    expect((anon.body as { appliedPrice: number }[]).map((v) => v.appliedPrice)).toEqual([20_000, 5_000]);
    expect(out.send.mock.calls.some(([r]) => r.path === "/store/v1/me/prices")).toBe(false);
    const failing = fakeBackend({ "/store/v1/me/prices": { status: 401, body: null } });
    const res = await createStoreAdapter(failing.http).send({ method: "GET", path: "/catalog/products/basmati-rice/availability", accessToken: "old" });
    expect((res.body as { appliedPrice: number }[]).map((v) => v.appliedPrice)).toEqual([20_000, 5_000]);
  });
});

describe("createStoreAdapter: stock and lookup", () => {
  const withStock = () => {
    const stocked = PRODUCTS.map((p) => ({ ...p, variants: p.variants.map((v) => ({ ...v, inStock: v.id !== "v2", availableQty: v.id === "v1" ? 3 : v.id === "v2" ? 0 : 10 })) }));
    return fakeBackend({}, stocked);
  };

  it("uses the backend's availableQty for a variant's stock and says it is known", async () => {
    const { http } = withStock();
    const res = await get(createStoreAdapter(http), "/catalog/products/basmati-rice");
    const body = res.body as { variants: { id: string; stock: number; stockKnown: boolean }[]; inStock: boolean };
    expect(body.variants.find((v) => v.id === "v1")).toMatchObject({ stock: 3, stockKnown: true });
    expect(body.variants.find((v) => v.id === "v2")).toMatchObject({ stock: 0, stockKnown: true });
    expect(body.inStock).toBe(true);
  });

  it("falls back to an ordering ceiling with stockKnown false when the backend sends no stock", async () => {
    const { http } = fakeBackend();
    const res = await get(createStoreAdapter(http), "/catalog/products/toor-dal");
    expect((res.body as { variants: { stock: number; stockKnown: boolean }[] }).variants[0]).toMatchObject({ stock: 10, stockKnown: false });
  });

  it("marks a product out of stock when every variant is", async () => {
    const out = PRODUCTS.map((p) => ({ ...p, variants: p.variants.map((v) => ({ ...v, inStock: false, availableQty: 0 })) }));
    const { http } = fakeBackend({}, out);
    const res = await get(createStoreAdapter(http), "/catalog/products/toor-dal");
    expect((res.body as { inStock: boolean }).inStock).toBe(false);
  });

  it("answers live stock for availability from the product's own endpoint", async () => {
    const { http, send } = withStock();
    const res = await get(createStoreAdapter(http), "/catalog/products/basmati-rice/availability");
    expect(res.body).toMatchObject([{ variantId: "v1", stock: 3 }, { variantId: "v2", stock: 0 }]);
    expect(send.mock.calls.some(([r]) => r.path === "/store/v1/products/basmati-rice")).toBe(true);
  });

  it("looks up products and variants by id, ignoring unknown ids", async () => {
    const { http } = withStock();
    const res = await get(createStoreAdapter(http), "/catalog/lookup", { variantIds: "v2,v3,nope", productIds: "p1" });
    const body = res.body as { products: { id: string }[]; variants: Record<string, { productId: string; variant: { label: string } }> };
    expect(body.products.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
    expect(Object.keys(body.variants).sort()).toEqual(["v2", "v3"]);
    expect(body.variants.v2).toMatchObject({ productId: "p1", variant: { label: "1 kg" } });
  });

  it("passes /store/v1 requests (cart, orders, payments) straight to the backend", async () => {
    const { http, send } = fakeBackend({ "/store/v1/cart": { status: 200, body: { cart: {} } } });
    const res = await createStoreAdapter(http).send({ method: "PUT", path: "/store/v1/cart", body: { items: [] } });
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ method: "PUT", path: "/store/v1/cart" }));
  });
});
