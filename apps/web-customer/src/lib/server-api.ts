import { createHttpAdapter, createProductsApi, createSearchApi, createStoreAdapter } from "@femxo/shared/api";
import type { ApiAdapter } from "@femxo/shared/api";

/*
 * API clients for server components (home, category pages). They call femxo-backend directly at
 * FEMXO_API_ORIGIN; per-shopper data is the browser's job.
 */
const adapter = (): ApiAdapter =>
  createStoreAdapter(createHttpAdapter({ baseUrl: (process.env.FEMXO_API_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "") }));

export const serverProducts = () => createProductsApi(adapter());
export const serverSearch = () => createSearchApi(adapter());
