import { createHttpAdapter, createProductsApi, createSearchApi, createStoreAdapter } from "@femxo/shared/api";
import type { ApiAdapter } from "@femxo/shared/api";

/*
 * API clients for server components (home, category pages). They call femxo-backend directly at
 * FEMXO_API_ORIGIN; per-shopper data is the browser's job.
 */
let shared: ApiAdapter | undefined;
// One adapter per server process: its catalog snapshot (a minute's cache) is then shared by every page and
// build worker call, instead of each call walking the whole category tree again. Safe to share because the
// public catalog carries no shopper data.
const adapter = (): ApiAdapter =>
  (shared ??= createStoreAdapter(createHttpAdapter({ baseUrl: (process.env.FEMXO_API_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "") })));

export const serverProducts = () => createProductsApi(adapter());
export const serverSearch = () => createSearchApi(adapter());
