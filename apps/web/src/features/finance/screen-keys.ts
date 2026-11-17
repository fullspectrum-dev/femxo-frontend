/*
 * Which module keys and panels have their own Field Staff / Finance screens (see screens.tsx). Plain data, so the
 * server page can decide which screen to render without importing the client components.
 */
export const STAFF_SCREEN_KEYS: ReadonlySet<string> = new Set([
  "my-customers",
  "new-order",
  "my-orders",
  "sell-prime",
  "payouts",
  "ledger",
  "settlement-recon",
  "registers",
  "invoices",
  "settlement-rules",
  "commission-plans",
]);

/** Panels whose dashboard is a tile home instead of the Command Center. */
export const STAFF_HOME_PANELS: ReadonlySet<string> = new Set(["field", "finance"]);
