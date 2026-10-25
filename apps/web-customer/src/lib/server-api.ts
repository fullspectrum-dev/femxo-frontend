import { apiMode } from "@femxo/shared";
import { createHttpAdapter, createProductsApi, createSearchApi } from "@femxo/shared/api";
import type { ApiAdapter } from "@femxo/shared/api";
import { createMockBackend } from "@femxo/shared/demo";

/*
 * API clients for server components (home, category pages). The server can't
 * read the browser's IndexedDB, so in mock mode it serves the seeded catalogue
 * from memory, with no delay and no random errors. Per-shopper data (cart,
 * orders, stock after your orders) is the browser's job. In `http` mode this
 * calls the real API.
 */
let backend: ReturnType<typeof createMockBackend> | undefined;

function adapter(): ApiAdapter {
  if (apiMode === "mock") return (backend ??= createMockBackend({ storage: "memory", latency: false })).adapter;
  return createHttpAdapter({ baseUrl: (process.env.FEMXO_API_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "") });
}

export const serverProducts = () => createProductsApi(adapter());
export const serverSearch = () => createSearchApi(adapter());
