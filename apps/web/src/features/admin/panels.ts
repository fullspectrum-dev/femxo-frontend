import { CreditCard, LayoutGrid, Package, Truck, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

export type PanelId = "super-admin" | "admin" | "warehouse" | "dealer" | "sub-dealer";

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
};

/** Role panels in the order a multi-role user is sent to them (widest reach first). */
export const ROLE_PANEL_ORDER: readonly PanelId[] = ["admin", "warehouse", "dealer", "sub-dealer"];

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
          permission: item.anyOf[0] ?? "",
        })
      ),
    }))
    .filter((group) => group.items.length > 0);
}

/** Every module a panel can show (whatever the user's permissions), for route checks. */
export function panelModules(panel: PanelConfig): ModuleKey[] {
  return panel.groups.flatMap((group) => group.items.map((item) => item.key));
}
