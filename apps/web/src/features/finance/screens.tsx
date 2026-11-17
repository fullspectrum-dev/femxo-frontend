"use client";

import type { ComponentType } from "react";
import type { ModuleKey } from "@/features/admin/nav";
import { CustomersScreen } from "@/features/field/Customers";
import { NewOrderScreen } from "@/features/field/NewOrder";
import { FieldOrdersScreen } from "@/features/field/Orders";
import { SellPrimeScreen } from "@/features/field/Prime";
import { CommissionPlansScreen } from "./CommissionPlans";
import { InvoicesScreen } from "./Invoices";
import { LedgerScreen } from "./Ledger";
import { PayoutsScreen } from "./Payouts";
import { ReconciliationScreen } from "./Reconciliation";
import { ReportsScreen } from "./Reports";
import { SettlementRulesScreen } from "./SettlementRules";
import { StaffHome } from "./StaffHome";

/*
 * The dedicated screens of the Field Staff and Finance panels, by module key, for app/panel/[panel]/[module].
 * A client module, so the server page passes only the key across.
 */
const SCREENS: Partial<Record<ModuleKey, ComponentType>> = {
  "my-customers": CustomersScreen,
  "new-order": NewOrderScreen,
  "my-orders": FieldOrdersScreen,
  "sell-prime": SellPrimeScreen,
  payouts: PayoutsScreen,
  ledger: LedgerScreen,
  "settlement-recon": ReconciliationScreen,
  registers: ReportsScreen,
  invoices: InvoicesScreen,
  "settlement-rules": SettlementRulesScreen,
  "commission-plans": CommissionPlansScreen,
};

const HOMES: Record<string, string> = {
  field: "Customers, orders, Prime and cash collection for your territory. Works offline for orders.",
  finance: "Payouts, ledgers, reconciliation, GST registers, invoices and commission plans.",
};

export function StaffScreen({ panel, moduleKey }: { panel: string; moduleKey: ModuleKey }) {
  if (moduleKey === "dashboard" && Object.hasOwn(HOMES, panel)) return <StaffHome intro={HOMES[panel]!} />;
  const Screen = SCREENS[moduleKey];
  return Screen ? <Screen /> : null;
}
