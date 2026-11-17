import {
  Activity,
  Bell,
  Banknote,
  MessageSquareText,
  Building,
  ClipboardCheck,
  ChartColumn,
  CreditCard,
  LayoutGrid,
  Lock,
  MapPin,
  Package,
  Plug,
  ReceiptText,
  Shield,
  Star,
  Store,
  Truck,
  UserRound,
  Warehouse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** The 18 admin modules, in sidebar order. */
export type ModuleKey =
  | "dashboard"
  | "company"
  | "users"
  | "roles"
  | "security"
  | "products"
  | "dealers"
  | "sub-dealers"
  | "warehouse"
  | "prime"
  | "customers"
  | "approvals"
  | "payments"
  | "reviews"
  | "orders"
  | "billing"
  | "finance"
  | "reports"
  | "notifications"
  | "integrations"
  // Delivery Partner and Dispatch panels (src/features/delivery, src/features/dispatch).
  | "delivery-earnings"
  | "dispatch-earnings"
  | "cash-handovers"
  | "reconciliation"
  | "cod-tasks"
  | "delivery-returns"
  // Field Staff and Finance panels (src/features/field, src/features/finance).
  | "my-customers"
  | "new-order"
  | "my-orders"
  | "sell-prime"
  | "payouts"
  | "ledger"
  | "settlement-recon"
  | "registers"
  | "invoices"
  | "settlement-rules"
  | "commission-plans";

export interface NavItem {
  key: ModuleKey;
  label: string;
  href: `/admin/${string}`;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

const item = (key: ModuleKey, label: string, icon: LucideIcon): NavItem => ({
  key,
  label,
  href: `/admin/${key}`,
  icon,
});

// Sidebar groups (Super Admin panel; role panels filter by real permissions in panels.ts). The gold "waiting" counts are not set here: they come from the API (see shell/useNavBadges.ts).
export const NAV_GROUPS: readonly NavGroup[] = [
  { label: "Overview", items: [item("dashboard", "Dashboard", LayoutGrid)] },
  {
    label: "Organization & Access",
    items: [
      item("company", "Company Overview", Building),
      item("users", "User Management", UserRound),
      item("roles", "Roles & Permissions", Lock),
      item("security", "Security & Audit Logs", Shield),
    ],
  },
  {
    label: "Commerce & Network",
    items: [
      item("products", "Products & Catalog", Package),
      item("dealers", "Dealers", Store),
      item("sub-dealers", "Sub-Dealers", MapPin),
      item("warehouse", "Warehouse & Inventory", Warehouse),
      item("prime", "Prime Membership", Star),
      item("customers", "Customers", UserRound),
      item("reviews", "Reviews", MessageSquareText),
    ],
  },
  {
    label: "Operations & Finance",
    items: [
      item("orders", "Orders & Delivery", Truck),
      item("approvals", "Approvals", ClipboardCheck),
      item("billing", "Billing & Invoices", ReceiptText),
      item("finance", "Finance & Wallet", CreditCard),
      item("payments", "Payments", Banknote),
    ],
  },
  {
    label: "Insights & Integrations",
    items: [
      item("reports", "Reports & Analytics", ChartColumn),
      item("notifications", "Notifications", Bell),
      item("integrations", "API & Integrations", Plug),
    ],
  },
];

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export const MORE_ICON = Activity;
