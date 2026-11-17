import { api } from "@/lib/api";

/*
 * Field Staff endpoints of femxo-backend: /customers, /territories (drill-down picker), /catalog (buyer search and
 * barcodes, at the staff user's own price tier), /dealer/dealers and /sub-dealers (order owners), /orders,
 * /membership, /cod and /sync/actions (offline queue).
 */

export interface Customer {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  addressLine: string | null;
  pincode: string | null;
  locationId: string;
  territoryPath: string[];
  status: "active" | "blocked";
  prime: { status: "none" | "active" | "expired"; subscriptionId: string | null; until: string | null };
  createdAt: string;
  rev?: number;
}
export interface Territory {
  id: string;
  type: string;
  name: string;
}
export interface CatalogVariant {
  id: string;
  sku: string;
  barcode: string;
  label: string;
  mrp: number;
  price: number;
}
export interface CatalogProduct {
  id: string;
  name: string;
  categoryId: string;
  gstRateBp: number;
  variants: CatalogVariant[];
  images: { urls: Record<string, string> }[];
}
export interface Dealer {
  dealerId: string;
  businessName: string;
  status: string;
}
export interface SubDealer {
  subDealerId: string;
  parentDealerId: string;
  name: string;
  status: string;
}
export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  placedAt: string;
  status: "pending_approval" | "pending_payment" | "payment_failed" | "placed" | "cancelled" | "completed";
  ownerDealerId: string | null;
  ownerSubDealerId: string | null;
  deliveryChargePaise: number;
  itemCount: number;
}
export interface OrderLine {
  productId: string;
  variantId: string;
  categoryId: string;
  quantity: number;
  unitPricePaise: number;
  gstRateBp: number;
}
export interface PlaceOrder {
  customerId: string;
  ownerDealerId?: string;
  ownerSubDealerId?: string;
  deliveryChargePaise: number;
  items: OrderLine[];
}
export interface PrimePlan {
  id: string;
  name: string;
  pricePaise: number;
  durationDays: number;
  benefits: string[];
  status: string;
}
export interface PaymentSummary {
  payablePaise: number;
  collectedPaise: number;
  outstandingPaise: number;
  status: string;
  payments: { id: string; amountPaise: number; method: "cash" | "upi"; reference: string; recordedAt: string }[];
}
export interface SyncResult {
  key: string;
  status: "synced" | "failed" | "conflict";
  code?: string;
  message?: string;
  replayed?: boolean;
}

type Page<T> = { items: T[]; nextCursor: string | null };
const usable = (q: string) => {
  const needle = q.trim();
  return needle && (needle.length >= 3 || /^\d+$/.test(needle)) ? needle : undefined;
};

export const fieldApi = {
  customers: (phone: string | undefined, cursor: string | null) => api.get<Page<Customer>>("/customers", { phone, cursor, limit: 20 }),
  customer: (id: string) => api.get<{ customer: Customer }>(`/customers/${id}`).then((r) => r.customer),
  createCustomer: (body: { phone: string; name: string; email?: string; addressLine?: string; pincode?: string; locationId: string }) =>
    api.post<{ customer: Customer }>("/customers", body).then((r) => r.customer),
  updateCustomer: (id: string, body: { rev: number; name?: string; email?: string | null; addressLine?: string | null; pincode?: string | null; locationId?: string }) =>
    api.patch<{ customer: Customer }>(`/customers/${id}`, body).then((r) => r.customer),

  territories: (parentId?: string) => api.get<{ territories: Territory[] }>("/territories", { parentId }).then((r) => r.territories),
  trail: (id: string) => api.get<{ territory: Territory; ancestors: Territory[] }>(`/territories/${encodeURIComponent(id)}`),

  search: (q: string) => api.get<{ products: CatalogProduct[]; nextCursor: string | null }>("/catalog/search", { q, limit: 20 }).then((r) => r.products),
  barcode: (code: string) => api.get<{ product: CatalogProduct; variantId: string }>(`/catalog/barcodes/${encodeURIComponent(code)}`),

  dealers: (q: string) => api.get<Page<Dealer>>("/dealer/dealers", { q: usable(q), status: "active", limit: 20 }).then((r) => r.items),
  subDealers: (q: string) => api.get<Page<SubDealer>>("/sub-dealers", { q: usable(q), status: "active", limit: 20 }).then((r) => r.items),

  placeOrder: (body: PlaceOrder & { idempotencyKey: string }) => api.post<{ order: Order; replayed: boolean }>("/orders", body),
  orders: (orderNumber: string | undefined, cursor: string | null) => api.get<Page<Order>>("/orders", { orderNumber, cursor, limit: 20 }),

  plans: () => api.get<{ items: PrimePlan[] }>("/membership/plans", { status: "active" }).then((r) => r.items),
  subscribe: (body: { customerId: string; planId: string; paymentRef: string; idempotencyKey: string }) =>
    api.post<{ subscription: { id: string; endsAt?: string }; replayed: boolean }>("/membership/subscriptions", body),

  payments: (orderId: string) => api.get<PaymentSummary>(`/cod/orders/${orderId}/payments`),
  collect: (orderId: string, body: { amountPaise: number; method: "cash" | "upi"; reference: string; collectionKey: string }) =>
    api.post<{ summary: PaymentSummary }>(`/cod/orders/${orderId}/payments`, body),

  sync: (actions: { key: string; type: string; payload: unknown }[]) => api.post<{ results: SyncResult[] }>("/sync/actions", { actions }).then((r) => r.results),
};
