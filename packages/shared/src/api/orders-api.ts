import { OrderDetail, OrderStatus, OrderSummary } from "../contracts/commerce";
import { page } from "../contracts/common";
import type { ApiAdapter } from "./adapter";
import { request } from "./request";

export interface OrderQuery {
  /** Only orders in one of these states. */
  status?: readonly OrderStatus[];
  cursor?: string;
  limit?: number;
}

/** OrdersApi: history, one order with its tracking, cancelling and returns. */
export function createOrdersApi(adapter: ApiAdapter) {
  const one = (id: string) => `/orders/${encodeURIComponent(id)}`;
  return {
    /** Newest first, a cursor page at a time. */
    list: ({ status, cursor, limit }: OrderQuery = {}) =>
      request(adapter, { method: "GET", path: "/orders", query: { status: status ? [...status] : undefined, cursor, limit } }, page(OrderSummary)),
    get: (id: string, signal?: AbortSignal) => request(adapter, { method: "GET", path: one(id), signal }, OrderDetail),
    /** Until the order is packed. 409 ORDER_STATE after that. */
    cancel: (id: string) => request(adapter, { method: "POST", path: `${one(id)}/cancel`, body: {} }, OrderDetail),
    /** Within 7 days of delivery, for returnable items. 409 ORDER_STATE outside that; 422 for an item that can't be returned. */
    requestReturn: (id: string, request_: { lineIds: string[]; reason: string }) =>
      request(adapter, { method: "POST", path: `${one(id)}/return`, body: request_ }, OrderDetail),
  };
}

export type OrdersApi = ReturnType<typeof createOrdersApi>;
