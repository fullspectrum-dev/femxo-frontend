import { createRouter } from "../adapters/mock/router";
import { registerAddressRoutes } from "./handlers/addresses";
import { registerAuthRoutes } from "./handlers/auth";
import { registerCartRoutes } from "./handlers/cart";
import { registerCatalogRoutes } from "./handlers/catalog";
import { registerCheckoutRoutes } from "./handlers/checkout";
import { registerOrderRoutes } from "./handlers/orders";
import { registerPaymentRoutes } from "./handlers/payments";
import type { PaymentControls } from "./handlers/payments";
import { registerPrimeRoutes } from "./handlers/prime";
import { registerSupportRoutes } from "./handlers/support";
import { registerWishlistRoutes } from "./handlers/wishlist";
import type { Catalog, MockState } from "./domain/types";

/** Every mock endpoint. Each module adds its handlers here as the storefront grows. */
export function buildMockRouter(catalog: Catalog, controls: PaymentControls) {
  const router = createRouter<MockState>();
  registerAuthRoutes(router);
  registerCatalogRoutes(router, catalog);
  registerCartRoutes(router, catalog);
  registerAddressRoutes(router);
  registerCheckoutRoutes(router, catalog);
  registerPaymentRoutes(router, controls);
  registerOrderRoutes(router);
  registerSupportRoutes(router);
  registerPrimeRoutes(router);
  registerWishlistRoutes(router, catalog);
  return router;
}
