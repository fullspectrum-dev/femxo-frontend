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
