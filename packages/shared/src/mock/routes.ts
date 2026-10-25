import { createRouter } from "../adapters/mock/router";
import { registerAuthRoutes } from "./handlers/auth";
import { registerCatalogRoutes } from "./handlers/catalog";
import type { Catalog, MockState } from "./domain/types";

/** Every mock endpoint. Each module adds its handlers here as the storefront grows. */
export function buildMockRouter(catalog: Catalog) {
  const router = createRouter<MockState>();
  registerAuthRoutes(router);
  registerCatalogRoutes(router, catalog);
  return router;
}
