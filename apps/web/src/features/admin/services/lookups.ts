import { api } from "@/lib/api";

/*
 * id → name tables for brands, categories and warehouses, which the API
 * returns as ids on products and transfers. Loaded once per page load.
 */

type Names = Map<string, string>;
const cache = new Map<string, Promise<Names>>();

function load(key: string, fetcher: () => Promise<{ id: string; name: string }[]>): Promise<Names> {
  let hit = cache.get(key);
  if (!hit) {
    hit = fetcher()
      .then((list) => new Map(list.map((entry) => [entry.id, entry.name])))
      .catch((error) => {
        cache.delete(key); // Don't keep a failure; the next list retries.
        throw error;
      });
    cache.set(key, hit);
  }
  return hit;
}

/** Follows nextCursor so lists longer than one page (200+ brands) are complete. Capped as a safety stop. */
async function allPages<T extends { id: string; name: string }>(path: string, key: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const res: Record<string, unknown> = await api.get(path, { limit: 100, cursor });
    items.push(...((res[key] as T[] | undefined) ?? []));
    cursor = (res.nextCursor as string | null | undefined) ?? null;
    if (!cursor) break;
  }
  return items;
}

export const brandNames = () => load("brands", () => allPages("/catalog/brands", "brands"));

export const categoryNames = () =>
  load("categories", async () => (await api.get<{ categories: { id: string; name: string }[] }>("/catalog/categories")).categories);

/** Needs user.view; without it the lookup fails and callers show a dash instead of a raw id. */
export const userNames = () => load("users", () => allPages("/users", "items"));

export const warehouseNames = () => load("warehouses", () => allPages("/inventory/warehouses", "warehouses"));

/** What a dropdown shows → the id the API wants. Active brands only. */
export async function brandChoices(): Promise<Map<string, string>> {
  const brands = await allPages<{ id: string; name: string; status?: string }>("/catalog/brands", "brands");
  return new Map(brands.filter((b) => b.status !== "archived").map((b) => [b.name, b.id]));
}

/** Active categories labelled with their parents ("Staples › Pulses"), since a name alone can repeat. */
export async function categoryChoices(): Promise<Map<string, string>> {
  const res = await api.get<{ categories: { id: string; name: string; parentId: string | null; status?: string }[] }>("/catalog/categories");
  const byId = new Map(res.categories.map((c) => [c.id, c]));
  const label = (c: { name: string; parentId: string | null }): string => {
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    return parent ? `${label(parent)} › ${c.name}` : c.name;
  };
  return new Map(res.categories.filter((c) => c.status !== "archived").map((c) => [label(c), c.id]));
}

// ---------- Names for the partner, order and stock screens ----------

const territoryCache = new Map<string, Promise<string>>();

/** "district:230" → "Patna". A failed lookup answers with the id itself, so a list never fails over a name. */
export async function territoryNames(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (id) => {
      let hit = territoryCache.get(id);
      if (!hit) {
        hit = api
          .get<{ territory: { name: string } }>(`/territories/${id}`)
          .then((res) => res.territory.name)
          .catch(() => {
            territoryCache.delete(id);
            return id;
          });
        territoryCache.set(id, hit);
      }
      return [id, await hit] as const;
    })
  );
  return new Map(entries);
}

/** The most specific place a row sits in: the last id of its `territoryPath`. */
export const lastOf = (path: readonly string[] | undefined) => path?.at(-1) ?? "";

interface VariantInfo {
  label: string;
  productName: string;
  sku: string;
}
let variantTable: Promise<Map<string, VariantInfo>> | undefined;

/** variantId → what a person recognises ("Sunflower oil · 1 l (FX-OIL-1L)"). Needs catalog access; callers fall back to a dash. */
export function variantInfo(): Promise<Map<string, VariantInfo>> {
  variantTable ??= (async () => {
    const table = new Map<string, VariantInfo>();
    let cursor: string | null = null;
    for (let page = 0; page < 50; page++) {
      const res: { products?: { name: string; variants: { id: string; sku: string; label?: string }[] }[]; nextCursor?: string | null } =
        await api.get("/catalog/admin/products", { limit: 100, cursor });
      for (const product of res.products ?? []) {
        for (const variant of product.variants) table.set(variant.id, { productName: product.name, sku: variant.sku, label: variant.label ?? "" });
      }
      cursor = res.nextCursor ?? null;
      if (!cursor) break;
    }
    return table;
  })().catch((error) => {
    variantTable = undefined;
    throw error;
  });
  return variantTable;
}

export const variantTitle = (info: VariantInfo | undefined) =>
  info ? `${info.productName}${info.label ? ` · ${info.label}` : ""}` : "—";
