import type { StatusKey } from "@/components/admin-ui";

/* Shapes shared by every admin list. The data itself comes from femxo-backend (see ../services). */

export type Cell = string | number | null;

export interface RecordRow {
  id: string;
  status: StatusKey;
  [field: string]: Cell;
}

export type DatasetKey =
  | "users"
  | "roles"
  | "securityEvents"
  | "auditLog"
  | "products"
  | "dealers"
  | "subDealers"
  | "stock"
  | "transfers"
  | "adjustments"
  | "primeSubscriptions"
  | "primePlans"
  | "customers"
  | "orders"
  | "invoices"
  | "settlements"
  | "wallets"
  | "reports"
  | "deliveries"
  | "templates"
  | "integrations"
  | "deadLetters"
  | "gstins"
  | "approvals"
  | "returns"
  | "deliveryRoutes"
  | "codTasks"
  | "commissionPlans"
  | "warehouses"
  | "brands"
  | "categories";
