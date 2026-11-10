import { cacheLife } from "next/cache";
import { serverProducts } from "@/lib/server-api";

export interface NavCategory {
  slug: string;
  name: string;
}

/**
 * The top-level categories from the catalog, for the header and the phone bottom bar. If the catalog can't be
 * reached the nav is empty (the page still works) and the answer is kept only briefly.
 */
export async function loadTopCategories(): Promise<readonly NavCategory[]> {
  "use cache";
  try {
    const all = await serverProducts().categories();
    cacheLife("minutes");
    return all.filter((c) => c.parentId === null).map(({ slug, name }) => ({ slug, name }));
  } catch {
    cacheLife("seconds");
    return [];
  }
}
