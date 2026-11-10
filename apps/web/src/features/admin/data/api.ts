import { AuthApiError } from "@/features/auth/services/auth-client";
import type { ActionSpec, FormValues, ViewSpec } from "../modules/types";
import { customersService, invoicesService, ordersService } from "../services/sales.service";
import { payoutsService, walletsService } from "../services/finance.service";
import { subscriptionsService, plansService } from "../services/membership.service";
import { deadLettersService, reportsService, templatesService } from "../services/ops.service";
import { dealersService, subDealersService } from "../services/partners.service";
import { adjustmentsService, stockService } from "../services/stock.service";
import { productsService } from "../services/products.service";
import { rolesService } from "../services/roles.service";
import { transfersService } from "../services/transfers.service";
import type { LiveService } from "../services/types";
import { usersService } from "../services/users.service";
import { ApiRefusal } from "./errors";
import type { ListQuery, Page } from "./errors";
import type { Cell, DatasetKey, RecordRow } from "./records";

/*
 * The admin screens' one data entry point: every list, create and action calls
 * femxo-backend through the services in ../services. A dataset with no service
 * has no backend yet: its view renders <ComingSoon />.
 */

export { ApiRefusal } from "./errors";
export { PartialSaveError } from "../services/types";
export type { ListQuery, Page } from "./errors";

const SERVICES: Partial<Record<DatasetKey, LiveService>> = {
  users: usersService,
  roles: rolesService,
  products: productsService,
  transfers: transfersService,
  dealers: dealersService,
  subDealers: subDealersService,
  customers: customersService,
  orders: ordersService,
  invoices: invoicesService,
  wallets: walletsService,
  settlements: payoutsService,
  stock: stockService,
  adjustments: adjustmentsService,
  primeSubscriptions: subscriptionsService,
  primePlans: plansService,
  reports: reportsService,
  templates: templatesService,
  deadLetters: deadLettersService,
};

/** Whether the view has a backend route. */
export const hasBackend = (dataset: DatasetKey) => dataset in SERVICES;

const viewCache = new WeakMap<ViewSpec, ViewSpec>();

/** A view minus what its backend can't do (create forms, actions). Same object each call. */
export function forMode(view: ViewSpec): ViewSpec {
  const service = SERVICES[view.dataset];
  if (!service) return view;
  let adapted = viewCache.get(view);
  if (!adapted) {
    const base: ViewSpec = { ...view, ...service.viewPatch };
    adapted = {
      ...base,
      // The APIs sort by newest first only; a sort control that does nothing would mislead.
      columns: base.columns.map((column) => (column.sortable ? { ...column, sortable: false } : column)),
      searchPlaceholder: service.searchPlaceholder ?? base.searchPlaceholder,
      create: service.createSpec ?? (service.canCreate ? base.create : undefined),
      edit: service.editSpec,
      actions: base.actions
        ?.filter((action) => service.actions?.includes(action.key))
        .map((action) => {
          const override = service.actionOverrides?.[action.key];
          if (!override) return action;
          return {
            ...action,
            label: override.label ?? action.label,
            toast: override.toast ?? action.toast,
            confirm: action.confirm && override.confirm ? { ...action.confirm, ...override.confirm } : action.confirm,
          };
        }),
    };
    viewCache.set(view, adapted);
  }
  return adapted;
}

// A refused call surfaces like the mock's errors, so screens handle one shape.
function translate(error: unknown): never {
  if (error instanceof AuthApiError) {
    if (error.status === 403) throw new ApiRefusal("FORBIDDEN", error.message);
    if (error.status === 404) throw new ApiRefusal("NOT_FOUND", error.message);
    // The API's own reason (e.g. "Role is assigned to users") is what the user needs to read.
    if (error.status === 409 || error.status === 422 || error.status === 400) throw new ApiRefusal("INVALID_TRANSITION", error.message);
  }
  throw error;
}

export async function listRecords(dataset: DatasetKey, query: ListQuery): Promise<Page> {
  const service = SERVICES[dataset];
  if (!service) throw new Error(`${dataset} has no backend yet`);
  try {
    return await service.list({ q: query.q, status: query.status, cursor: query.cursor, limit: query.limit });
  } catch (error) {
    return translate(error);
  }
}

export async function createRecord(dataset: DatasetKey, values: Record<string, Cell>, files: File[] = []): Promise<RecordRow> {
  const service = SERVICES[dataset];
  if (!service?.create) throw new Error(`${dataset} can't be created from the panel yet`);
  try {
    return await service.create(values, files);
  } catch (error) {
    return translate(error);
  }
}

export async function updateRecord(dataset: DatasetKey, row: RecordRow, values: FormValues, files: File[], removedImageIds: string[]): Promise<RecordRow> {
  const service = SERVICES[dataset];
  if (!service?.update) throw new Error(`${dataset} can't be edited from the panel yet`);
  try {
    return await service.update(row, values, files, removedImageIds);
  } catch (error) {
    return translate(error);
  }
}

/** Actions without a target state (e.g. a report download) still call the API; the row's state is kept. */
export async function applyAction(dataset: DatasetKey, row: RecordRow, action: ActionSpec, reason?: string): Promise<RecordRow> {
  const service = SERVICES[dataset];
  if (!service?.transition) throw new Error(`${dataset} has no actions yet`);
  try {
    return await service.transition(row, action.key, action.to ?? row.status, { reason });
  } catch (error) {
    return translate(error);
  }
}
