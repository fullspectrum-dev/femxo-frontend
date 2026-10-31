import type { StatusKey } from "@/components/admin-ui";
import { AuthApiError } from "@/features/auth/services/auth-client";
import type { ActionSpec, FormValues, ViewSpec } from "../modules/types";
import { productsService } from "../services/products.service";
import { rolesService } from "../services/roles.service";
import { transfersService } from "../services/transfers.service";
import type { LiveService } from "../services/types";
import { usersService } from "../services/users.service";
import { isAdminPrototype } from "./data-mode";
import * as mock from "./mock-api";
import type { Page, PreviewState } from "./mock-api";
import type { Cell, DatasetKey, RecordRow } from "./records";

/*
 * The admin screens' one data entry point. Prototype mode (the default)
 * answers from mock-api.ts; live mode (NEXT_PUBLIC_ADMIN_DATA_MODE=live) calls
 * femxo-backend through the services below. A dataset with no service has no
 * backend yet: its view renders <ComingSoon />.
 */

export { MockApiError, readPreviewState } from "./mock-api";
export { PartialSaveError } from "../services/types";
export type { ListQuery, Page, PreviewState } from "./mock-api";

const SERVICES: Partial<Record<DatasetKey, LiveService>> = {
  users: usersService,
  roles: rolesService,
  products: productsService,
  transfers: transfersService,
};

export const isLive = !isAdminPrototype;

/** Whether the view has a backend. Always true in prototype mode. */
export const hasBackend = (dataset: DatasetKey) => !isLive || dataset in SERVICES;

const viewCache = new WeakMap<ViewSpec, ViewSpec>();

/** In live mode, a view minus what its backend can't do (create forms, actions). Same object each call. */
export function forMode(view: ViewSpec): ViewSpec {
  const service = SERVICES[view.dataset];
  if (!isLive || !service) return view;
  let adapted = viewCache.get(view);
  if (!adapted) {
    adapted = {
      ...view,
      // The APIs sort by newest first only; a sort control that does nothing would mislead.
      columns: view.columns.map((column) => (column.sortable ? { ...column, sortable: false } : column)),
      searchPlaceholder: service.searchPlaceholder ?? view.searchPlaceholder,
      create: service.createSpec ?? (service.canCreate ? view.create : undefined),
      edit: service.editSpec,
      actions: view.actions
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
    if (error.status === 403) throw new mock.MockApiError("FORBIDDEN", error.message);
    if (error.status === 404) throw new mock.MockApiError("NOT_FOUND", error.message);
    // The API's own reason (e.g. "Role is assigned to users") is what the user needs to read.
    if (error.status === 409) throw new mock.MockApiError("INVALID_TRANSITION", error.message);
  }
  throw error;
}

export async function listRecords(dataset: DatasetKey, query: mock.ListQuery, preview: PreviewState): Promise<Page> {
  const service = SERVICES[dataset];
  if (!isLive || !service || preview) return mock.listRecords(dataset, query, preview);
  try {
    return await service.list({ q: query.q, status: query.status, cursor: query.cursor, limit: query.limit });
  } catch (error) {
    return translate(error);
  }
}

export async function createRecord(dataset: DatasetKey, values: Record<string, Cell>, status: StatusKey, files: File[] = []): Promise<RecordRow> {
  const service = SERVICES[dataset];
  if (!isLive || !service) return mock.createRecord(dataset, values, status);
  if (!service.create) throw new Error(`${dataset} can't be created from the panel yet`);
  try {
    return await service.create(values, files);
  } catch (error) {
    return translate(error);
  }
}

export async function updateRecord(dataset: DatasetKey, row: RecordRow, values: FormValues, files: File[], removedImageIds: string[]): Promise<RecordRow> {
  const service = SERVICES[dataset];
  if (!isLive || !service?.update) throw new Error(`${dataset} can't be edited from the panel yet`);
  try {
    return await service.update(row, values, files, removedImageIds);
  } catch (error) {
    return translate(error);
  }
}

export async function applyAction(dataset: DatasetKey, row: RecordRow, action: ActionSpec): Promise<RecordRow> {
  const service = SERVICES[dataset];
  if (!action.to) throw new Error("Action has no target state");
  if (!isLive || !service?.transition) return mock.transitionRecord(dataset, row.id, action.from, action.to, action.patch?.(row));
  try {
    return await service.transition(row, action.key, action.to);
  } catch (error) {
    return translate(error);
  }
}
