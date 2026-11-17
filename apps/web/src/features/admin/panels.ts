import { Banknote, ClipboardCheck, CreditCard, LayoutGrid, Package, RotateCcw, Route, Truck, Wallet, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BookOpen, FileText, Gauge, Landmark, Percent, Scale, ShoppingCart, Star as StarIcon, UserRound as UserIcon } from "lucide-react";
import type { AccessSummary } from "@/features/auth/types/auth";
import { NAV_GROUPS } from "./nav";
import type { ModuleKey, NavGroup, NavItem } from "./nav";

/*
 * One panel per role. Every panel reuses the same module screens (ModulePage,
 * CommandCenter); what differs is the base path, the menu, and who may open
 * it. The API still scopes every record by permission and territory, so a
 * panel only decides what is offered, never what is allowed.
 *
 * Module hrefs are written once as `/admin/<module>` (the Super Admin panel)
 * and rewritten to the panel's base path with `panelHref`.
 */

export type PanelId = "super-admin" | "admin" | "warehouse" | "dealer" | "sub-dealer" | "delivery" | "dispatch" | "field" | "finance";

export interface PanelItem {
  key: ModuleKey;
  label: string;
  icon?: LucideIcon;
  /** Shown when the user holds any of these backend permissions (modules/access/src/permissions.ts). */
  anyOf: readonly string[];
}

export interface PanelConfig {
  id: PanelId;
  /** Shown under the Femxo brand in the sidebar. */
  name: string;
  basePath: string;
  /** Role names (as stored in the backend) that open this panel; compared loosely. */
  roleNames: readonly string[];
  groups: readonly { label: string; items: readonly PanelItem[] }[];
  bottomNav: readonly { label: string; key: ModuleKey; icon: LucideIcon }[];
}

const P = {
  dashboard: ["dashboard.view", "dashboard.view_stock"],
  products: ["product.manage", "catalog.manage", "price_tier.assign"],
  dealers: ["dealer.view", "dealer.manage"],
  subDealers: ["subdealer.view", "subdealer.manage"],
  stock: ["stock.view", "stock.in", "stock.out", "stock.transfer", "stock.adjust", "stock.return"],
  prime: ["membership.view", "membership.manage", "membership.subscribe"],
  customers: ["customer.view", "customer.manage"],
  orders: ["order.view", "order.create", "delivery.view"],
  approvals: ["approval.view", "approval.decide"],
  billing: ["invoice.view", "invoice.issue"],
  finance: ["wallet.view", "finance.payout.view", "finance.payout.request", "cod.view"],
  reports: ["finance.report.view", "report.manage", "dashboard.view"],
  payments: ["payment.view", "payment.refund", "payment.reconcile"],
  reviews: ["review.moderate"],
  users: ["user.view", "user.manage"],
  roles: ["role.view"],
} as const;

export const PANELS: Record<PanelId, PanelConfig> = {
  "super-admin": {
    id: "super-admin",
    name: "Super Admin",
    basePath: "/admin",
    roleNames: [],
    groups: NAV_GROUPS.map((group) => ({
      label: group.label,
      items: group.items.map((item) => ({ key: item.key, label: item.label, icon: item.icon, anyOf: [] })),
    })),
    bottomNav: [
      { label: "Home", key: "dashboard", icon: LayoutGrid },
      { label: "Orders", key: "orders", icon: Truck },
      { label: "Finance", key: "finance", icon: CreditCard },
    ],
  },
  admin: {
    id: "admin",
    name: "Admin",
    basePath: "/panel/admin",
    roleNames: ["admin", "state admin"],
    groups: [
      { label: "Overview", items: [{ key: "dashboard", label: "Dashboard", anyOf: P.dashboard }] },
      {
        label: "Network",
        items: [
          { key: "dealers", label: "Dealers", anyOf: P.dealers },
          { key: "sub-dealers", label: "Sub-Dealers", anyOf: P.subDealers },
          { key: "customers", label: "Customers", anyOf: P.customers },
          { key: "reviews", label: "Reviews", anyOf: P.reviews },
          { key: "prime", label: "Prime Membership", anyOf: P.prime },
        ],
      },
      {
        label: "Commerce",
        items: [
          { key: "products", label: "Products & Catalog", anyOf: P.products },
          { key: "warehouse", label: "Stock Overview", anyOf: P.stock },
          { key: "orders", label: "Orders & Delivery", anyOf: P.orders },
          { key: "approvals", label: "Approvals", anyOf: P.approvals },
        ],
      },
      {
        label: "Finance",
        items: [
          { key: "billing", label: "Billing & Invoices", anyOf: P.billing },
          { key: "finance", label: "Finance & Wallet", anyOf: P.finance },
          { key: "payments", label: "Payments", anyOf: P.payments },
        ],
      },
      {
        label: "Team & Insights",
        items: [
          { key: "users", label: "Users", anyOf: P.users },
          { key: "roles", label: "Roles", anyOf: P.roles },
          { key: "reports", label: "Reports", anyOf: P.reports },
        ],
      },
    ],
    bottomNav: [
      { label: "Home", key: "dashboard", icon: LayoutGrid },
      { label: "Orders", key: "orders", icon: Truck },
      { label: "Finance", key: "finance", icon: CreditCard },
    ],
  },
  warehouse: {
    id: "warehouse",
    name: "Warehouse",
    basePath: "/panel/warehouse",
    roleNames: ["warehouse manager", "warehouse", "warehouse staff"],
    groups: [
      { label: "Overview", items: [{ key: "dashboard", label: "Dashboard", anyOf: P.dashboard }] },
      {
        label: "Inventory",
        items: [
          { key: "warehouse", label: "Stock & Transfers", anyOf: P.stock },
          { key: "products", label: "Products", anyOf: P.products },
        ],
      },
      {
        label: "Fulfilment",
        items: [
          { key: "orders", label: "Orders & Dispatch", anyOf: P.orders },
          { key: "approvals", label: "Approvals", anyOf: P.approvals },
        ],
      },
      { label: "Insights", items: [{ key: "reports", label: "Reports", anyOf: P.reports }] },
    ],
    bottomNav: [
      { label: "Home", key: "dashboard", icon: LayoutGrid },
      { label: "Stock", key: "warehouse", icon: Warehouse },
      { label: "Orders", key: "orders", icon: Truck },
    ],
  },
  dealer: {
    id: "dealer",
    name: "Dealer",
    basePath: "/panel/dealer",
    roleNames: ["dealer", "distributor"],
    groups: [
      { label: "Overview", items: [{ key: "dashboard", label: "Dashboard", anyOf: P.dashboard }] },
      {
        label: "Business",
        items: [
          { key: "products", label: "Catalog", anyOf: P.products },
          { key: "orders", label: "My Orders", anyOf: P.orders },
          { key: "sub-dealers", label: "My Sub-Dealers", anyOf: P.subDealers },
          { key: "customers", label: "Customers", anyOf: P.customers },
          { key: "approvals", label: "Approvals", anyOf: P.approvals },
        ],
      },
      {
        label: "Money",
        items: [
          { key: "finance", label: "Wallet & Payouts", anyOf: P.finance },
          { key: "billing", label: "Invoices", anyOf: P.billing },
          { key: "reports", label: "Statements & Reports", anyOf: P.reports },
        ],
      },
    ],
    bottomNav: [
      { label: "Home", key: "dashboard", icon: LayoutGrid },
      { label: "Orders", key: "orders", icon: Truck },
      { label: "Wallet", key: "finance", icon: CreditCard },
    ],
  },
  "sub-dealer": {
    id: "sub-dealer",
    name: "Sub-Dealer",
    basePath: "/panel/sub-dealer",
    roleNames: ["sub-dealer", "sub dealer", "subdealer", "retailer"],
    groups: [
      { label: "Overview", items: [{ key: "dashboard", label: "Dashboard", anyOf: P.dashboard }] },
      {
        label: "Business",
        items: [
          { key: "products", label: "Catalog", anyOf: P.products },
          { key: "orders", label: "My Orders", anyOf: P.orders },
          { key: "customers", label: "My Customers", anyOf: P.customers },
          { key: "prime", label: "Prime Membership", anyOf: P.prime },
        ],
      },
      {
        label: "Money",
        items: [
          { key: "finance", label: "Wallet & Commission", anyOf: P.finance },
          { key: "billing", label: "Invoices", anyOf: P.billing },
          { key: "reports", label: "Statements", anyOf: P.reports },
        ],
      },
    ],
    bottomNav: [
      { label: "Home", key: "dashboard", icon: LayoutGrid },
      { label: "Orders", key: "orders", icon: Package },
      { label: "Wallet", key: "finance", icon: CreditCard },
    ],
  },
  delivery: {
    id: "delivery",
    name: "Delivery Partner",
    basePath: "/panel/delivery",
    roleNames: ["delivery partner", "delivery agent", "delivery boy", "rider"],
    groups: [
      {
        label: "My day",
        items: [
          { key: "dashboard", label: "My routes", icon: Route, anyOf: ["delivery.agent"] },
          { key: "delivery-earnings", label: "My earnings", icon: Wallet, anyOf: ["delivery.agent"] },
        ],
      },
    ],
    bottomNav: [
      { label: "Routes", key: "dashboard", icon: Route },
      { label: "Earnings", key: "delivery-earnings", icon: Wallet },
    ],
  },
  dispatch: {
    id: "dispatch",
    name: "Dispatch",
    basePath: "/panel/dispatch",
    roleNames: ["dispatcher", "dispatch manager", "dispatch"],
    groups: [
      {
        label: "Routes",
        items: [
          { key: "dashboard", label: "Delivery routes", icon: Route, anyOf: ["delivery.dispatch"] },
          { key: "dispatch-earnings", label: "Partner earnings", icon: Wallet, anyOf: ["delivery.dispatch"] },
        ],
      },
      {
        label: "Cash",
        items: [
          { key: "cash-handovers", label: "Cash hand-overs", icon: Banknote, anyOf: ["delivery.cash.receive"] },
          { key: "reconciliation", label: "Reconciliation", icon: ClipboardCheck, anyOf: ["delivery.cash.receive"] },
          { key: "cod-tasks", label: "COD tasks", icon: CreditCard, anyOf: ["cod.view"] },
        ],
      },
      { label: "After delivery", items: [{ key: "delivery-returns", label: "Returns", icon: RotateCcw, anyOf: ["delivery.view"] }] },
    ],
    bottomNav: [
      { label: "Routes", key: "dashboard", icon: Route },
      { label: "Cash", key: "cash-handovers", icon: Banknote },
      { label: "Recon", key: "reconciliation", icon: ClipboardCheck },
    ],
  },
  field: {
    id: "field",
    name: "Field Staff",
    basePath: "/panel/field",
    roleNames: ["field staff", "field executive", "field officer", "field sales", "field agent"],
    groups: [
      { label: "Overview", items: [{ key: "dashboard", label: "Home", icon: Gauge, anyOf: [] }] },
      {
        label: "Customers",
        items: [
          { key: "my-customers", label: "My customers", icon: UserIcon, anyOf: ["customer.view", "customer.manage"] },
          { key: "sell-prime", label: "Sell Prime", icon: StarIcon, anyOf: ["membership.subscribe"] },
        ],
      },
      {
        label: "Orders",
        items: [
          { key: "new-order", label: "New order", icon: ShoppingCart, anyOf: ["order.create"] },
          { key: "my-orders", label: "My orders & COD", icon: Truck, anyOf: ["order.view", "cod.collect"] },
        ],
      },
    ],
    bottomNav: [
      { label: "Customers", key: "my-customers", icon: UserIcon },
      { label: "New order", key: "new-order", icon: ShoppingCart },
      { label: "Orders", key: "my-orders", icon: Truck },
    ],
  },
  finance: {
    id: "finance",
    name: "Finance",
    basePath: "/panel/finance",
    roleNames: ["finance", "finance admin", "finance manager", "finance officer", "accounts", "accountant"],
    groups: [
      { label: "Overview", items: [{ key: "dashboard", label: "Home", icon: Gauge, anyOf: [] }] },
      {
        label: "Money out",
        items: [
          { key: "payouts", label: "Payouts", icon: Landmark, anyOf: ["finance.payout.view", "finance.payout.request", "finance.payout.approve", "finance.payout-account.manage"] },
          { key: "ledger", label: "Wallets & ledger", icon: BookOpen, anyOf: ["wallet.view"] },
          { key: "settlement-recon", label: "Reconciliation", icon: Scale, anyOf: ["finance.reconcile"] },
          { key: "payments", label: "Online payments", icon: Banknote, anyOf: P.payments },
        ],
      },
      {
        label: "Books",
        items: [
          { key: "registers", label: "Registers & P&L", icon: FileText, anyOf: ["finance.report.view"] },
          { key: "invoices", label: "Invoices & notes", icon: FileText, anyOf: ["invoice.view"] },
        ],
      },
      {
        label: "Rules",
        items: [
          { key: "commission-plans", label: "Commission plans", icon: Percent, anyOf: ["commission.plan.view", "commission.plan.manage"] },
          { key: "settlement-rules", label: "Settlement rules", icon: Scale, anyOf: ["commission.recovery.manage"] },
        ],
      },
    ],
    bottomNav: [
      { label: "Payouts", key: "payouts", icon: Landmark },
      { label: "Ledger", key: "ledger", icon: BookOpen },
      { label: "Invoices", key: "invoices", icon: FileText },
    ],
  },
};

/** Role panels in the order a multi-role user is sent to them (widest reach first). */
export const ROLE_PANEL_ORDER: readonly PanelId[] = ["admin", "warehouse", "dealer", "sub-dealer", "finance", "dispatch", "field", "delivery"];

export function isPanelId(value: string): value is PanelId {
  return Object.hasOwn(PANELS, value);
}

const normalise = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");

/** True if the user may open this panel. The Super Admin may open every panel (to preview it). */
export function canOpenPanel(panel: PanelConfig, access: AccessSummary): boolean {
  if (access.isSuperAdmin) return true;
  if (panel.id === "super-admin") return false;
  const held = new Set(access.roles.map(normalise));
  return panel.roleNames.some((name) => held.has(normalise(name)));
}

/** The panels this user may open, best first. */
export function panelsFor(access: AccessSummary): PanelConfig[] {
  if (access.isSuperAdmin) return [PANELS["super-admin"]];
  return ROLE_PANEL_ORDER.map((id) => PANELS[id]).filter((panel) => canOpenPanel(panel, access));
}

/** Where a signed-in user lands: their panel's dashboard, or null when no panel fits their roles. */
export function homeFor(access: AccessSummary): string | null {
  const panel = panelsFor(access)[0];
  return panel ? `${panel.basePath}/dashboard` : null;
}

/** `/admin/orders?x=1` → `/panel/dealer/orders?x=1`. Other paths are returned as they are. */
export function panelHref(panel: PanelConfig, href: string): string {
  if (panel.basePath === "/admin") return href;
  if (href === "/admin") return panel.basePath;
  return href.startsWith("/admin/") ? `${panel.basePath}${href.slice("/admin".length)}` : href;
}

/** The menu as the shell renders it, with the items this user lacks permissions for left out. */
export function panelNav(panel: PanelConfig, access: AccessSummary | null): NavGroup[] {
  const icons = new Map(NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.key, i.icon] as const));
  const allowed = (item: PanelItem) =>
    item.key === "dashboard" ||
    panel.id === "super-admin" ||
    access?.isSuperAdmin === true ||
    item.anyOf.some((name) => access?.permissions.includes(name));
  return panel.groups
    .map((group) => ({
      label: group.label,
      items: group.items.filter(allowed).map(
        (item): NavItem => ({
          key: item.key,
          label: item.label,
          icon: item.icon ?? icons.get(item.key) ?? LayoutGrid,
          href: `/admin/${item.key}`,
        })
      ),
    }))
    .filter((group) => group.items.length > 0);
}

/** Every module a panel can show (whatever the user's permissions), for route checks. */
export function panelModules(panel: PanelConfig): ModuleKey[] {
  return panel.groups.flatMap((group) => group.items.map((item) => item.key));
}
