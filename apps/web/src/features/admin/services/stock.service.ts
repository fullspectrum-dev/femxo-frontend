import { api, idempotencyKey } from "@/lib/api";
import type { RecordRow } from "../data/records";
import type { CreateSpec } from "../modules/types";
import { userNames, variantInfo, variantTitle, warehouseNames } from "./lookups";
import { pageOf } from "./shared";
import type { LiveService } from "./types";

/*
 * Stock balances and the stock ledger against femxo-backend (/inventory). The API lists balances
 * and ledger rows one warehouse at a time, so the panel walks the caller's warehouses in order and
 * keeps "which warehouse, which cursor" in its own cursor ("2|abc").
 */

type Fetched<T> = { rows: T[]; nextCursor: string | null };

/** Pages through every warehouse in turn, returning the first page that has rows. */
export async function acrossWarehouses<T>(
  warehouseIds: readonly string[],
  cursor: string | null | undefined,
  fetchOne: (warehouseId: string, cursor: string | null) => Promise<Fetched<T>>
): Promise<Fetched<T>> {
  let index = 0;
  let inner: string | null = null;
  if (cursor) {
    const [i, ...rest] = cursor.split("|");
    index = Number(i) || 0;
    inner = rest.join("|") || null;
  }
  while (index < warehouseIds.length) {
    const page = await fetchOne(warehouseIds[index]!, inner);
    const hasMoreHere = page.nextCursor !== null;
    const next = hasMoreHere ? `${index}|${page.nextCursor}` : index + 1 < warehouseIds.length ? `${index + 1}|` : null;
    if (page.rows.length > 0 || hasMoreHere) return { rows: page.rows, nextCursor: next };
    index += 1;
    inner = null;
  }
  return { rows: [], nextCursor: null };
}

const safe = <T>(promise: Promise<Map<string, T>>) => promise.catch(() => new Map<string, T>());

// ---------- Stock (balances) ----------

interface ApiBalance {
  id: string;
  warehouseId: string;
  variantId: string;
  batchId: string | null;
  bucket: "available" | "quarantine";
  quantity: number;
}

const BUCKET_LABEL = { available: "Available", quarantine: "Quarantine" } as const;

export function balanceRow(b: ApiBalance, warehouses: Map<string, string>, variants: Awaited<ReturnType<typeof variantInfo>>): RecordRow {
  const info = variants.get(b.variantId);
  return {
    id: b.id,
    product: variantTitle(info),
    sku: info?.sku ?? "—",
    warehouse: warehouses.get(b.warehouseId) ?? "—",
    batch: b.batchId ? `…${b.batchId.slice(-6)}` : "Not batch-tracked",
    bucket: BUCKET_LABEL[b.bucket],
    qty: b.quantity,
    status: b.quantity <= 0 ? "out_of_stock" : b.bucket === "quarantine" ? "expiring" : "healthy",
  };
}

export const stockService: LiveService = {
  actions: [],
  searchPlaceholder: "Filter the stock on this page…",
  viewPatch: {
    searchKeys: ["product", "sku", "warehouse"],
    columns: [
      { key: "product", header: "Product", primary: true, sub: "sku" },
      { key: "warehouse", header: "Warehouse" },
      { key: "bucket", header: "Bucket", hideOnMobile: true },
      { key: "qty", header: "Units", format: "count" },
      { key: "status", header: "Status", format: "status" },
    ],
    statuses: ["healthy", "expiring", "out_of_stock"],
    details: [
      { label: "SKU", key: "sku" },
      { label: "Warehouse", key: "warehouse" },
      { label: "Batch", key: "batch" },
      { label: "Bucket", key: "bucket" },
      { label: "Units", key: "qty", format: "count" },
    ],
    recordName: (r) => `${r.product} · ${r.warehouse}`,
    note: () => "Quarantined stock is shown as 'Expiring' until the API reports expiry dates. Balances come from the stock ledger.",
  },
  async list({ q, status, cursor, limit }) {
    const [warehouses, variants] = await Promise.all([warehouseNames(), safe(variantInfo())]);
    const page = await acrossWarehouses([...warehouses.keys()], cursor, async (warehouseId, inner) => {
      const res = await api.get<{ balances: ApiBalance[]; nextCursor: string | null }>("/inventory/balances", { warehouseId, cursor: inner, limit });
      return { rows: res.balances, nextCursor: res.nextCursor };
    });
    const needle = q?.trim().toLowerCase();
    const rows = page.rows
      .map((b) => balanceRow(b, warehouses, variants))
      .filter((r) => (!status || r.status === status) && (!needle || [r.product, r.sku, r.warehouse].some((v) => String(v).toLowerCase().includes(needle))));
    return pageOf(rows, page.nextCursor);
  },
};

// ---------- Adjustments (the ledger, plus "record an adjustment") ----------

interface ApiLedgerEntry {
  id: string;
  movementId: string;
  type: string;
  warehouseId: string;
  variantId: string;
  bucket: "available" | "quarantine";
  quantity: number;
  balanceAfter: number;
  reason: string | null;
  actorId: string;
  at: string;
}

const MOVEMENT_LABEL: Record<string, string> = {
  stock_in: "Stock in",
  stock_out: "Stock out",
  damage: "Damage",
  write_off: "Write-off",
  quarantine: "Quarantine",
  quarantine_release: "Quarantine release",
  disposal: "Disposal",
  return_in: "Return in",
  return_out: "Return out",
  adjustment: "Count adjustment",
  reversal: "Reversal",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
  transfer_cancel: "Transfer cancelled",
};

export function ledgerRow(e: ApiLedgerEntry, warehouses: Map<string, string>, variants: Awaited<ReturnType<typeof variantInfo>>, people: Map<string, string>): RecordRow {
  return {
    id: e.id,
    code: `MV-${e.movementId.slice(-6).toUpperCase()}`,
    warehouse: warehouses.get(e.warehouseId) ?? "—",
    product: variantTitle(variants.get(e.variantId)),
    type: MOVEMENT_LABEL[e.type] ?? e.type,
    units: e.quantity,
    after: e.balanceAfter,
    reason: e.reason,
    requestedBy: people.get(e.actorId) ?? "—",
    at: e.at,
    status: "posted",
  };
}

const adjustmentCreate: CreateSpec = {
  label: "Record adjustment",
  title: "Record stock adjustment",
  description: "Corrects a balance to what a count found. It adds a ledger row; the history is kept.",
  fields: [
    { name: "warehouse", label: "Warehouse", kind: "select", required: true, options: [] },
    { name: "variant", label: "Product pack", kind: "select", required: true, options: [] },
    { name: "quantity", label: "Difference (negative for a shortage)", kind: "number", required: true },
    { name: "reason", label: "Reason", kind: "textarea", required: true, pattern: { regex: /^[\s\S]{3,200}$/, message: "3 to 200 characters." } },
  ],
  validate: (v) => (Number(v.quantity) === 0 ? { quantity: "A count that found no difference needs no adjustment." } : {}),
  status: "posted",
  toRow: (v) => v,
  toast: () => "Adjustment posted to the stock ledger.",
  prepare: async () => ({
    warehouse: [...(await warehouseNames()).values()],
    variant: [...(await variantChoices()).keys()],
  }),
};

/** "Sunflower oil · 1 l (FX-OIL-1L)" → variant id. */
async function variantChoices(): Promise<Map<string, string>> {
  const variants = await variantInfo();
  return new Map([...variants].map(([id, info]) => [`${variantTitle(info)} (${info.sku})`, id]));
}

export const adjustmentsService: LiveService = {
  canCreate: true,
  actions: [],
  searchPlaceholder: "Filter the ledger on this page…",
  createSpec: adjustmentCreate,
  viewPatch: {
    label: "Ledger",
    entity: "ledger entry",
    searchKeys: ["code", "product", "warehouse", "type", "reason"],
    columns: [
      { key: "code", header: "Movement", primary: true, sub: "type" },
      { key: "product", header: "Product" },
      { key: "warehouse", header: "Warehouse", hideOnMobile: true },
      { key: "units", header: "Units", format: "units" },
      { key: "at", header: "When", format: "datetime", hideOnMobile: true },
    ],
    statuses: [],
    details: [
      { label: "Type", key: "type" },
      { label: "Product", key: "product" },
      { label: "Warehouse", key: "warehouse" },
      { label: "Units", key: "units", format: "units" },
      { label: "Balance after", key: "after", format: "count" },
      { label: "Reason", key: "reason" },
      { label: "Made by", key: "requestedBy" },
      { label: "When", key: "at", format: "datetime" },
    ],
    recordName: (r) => `${r.code} · ${r.type}`,
    note: () => "The ledger is append-only. A mistake is fixed with a new adjustment, never an edit.",
    empty: { title: "No stock movements", message: "Receive stock or record an adjustment to start the ledger." },
  },
  async list({ q, cursor, limit }) {
    const [warehouses, variants, people] = await Promise.all([warehouseNames(), safe(variantInfo()), safe(userNames())]);
    const page = await acrossWarehouses([...warehouses.keys()], cursor, async (warehouseId, inner) => {
      const res = await api.get<{ entries: ApiLedgerEntry[]; nextCursor: string | null }>("/inventory/ledger", { warehouseId, cursor: inner, limit });
      return { rows: res.entries, nextCursor: res.nextCursor };
    });
    const needle = q?.trim().toLowerCase();
    const rows = page.rows
      .map((e) => ledgerRow(e, warehouses, variants, people))
      .filter((r) => !needle || [r.code, r.product, r.warehouse, r.type, r.reason].some((v) => String(v ?? "").toLowerCase().includes(needle)));
    return pageOf(rows, page.nextCursor);
  },
  async create(values) {
    const [warehouses, variants] = await Promise.all([warehouseNames(), variantChoices()]);
    const warehouseId = [...warehouses].find(([, name]) => name === values.warehouse)?.[0];
    const variantId = variants.get(String(values.variant));
    if (!warehouseId || !variantId) throw new Error("Choose a warehouse and a product pack from the lists.");
    const res = await api.post<{ movement: { id?: string; movementId?: string } }>(
      "/inventory/adjustments",
      { warehouseId, variantId, quantity: Number(values.quantity), reason: String(values.reason).trim() },
      { "Idempotency-Key": idempotencyKey() }
    );
    return {
      id: res.movement.id ?? res.movement.movementId ?? idempotencyKey(),
      code: "New",
      warehouse: String(values.warehouse),
      product: String(values.variant),
      type: "Count adjustment",
      units: Number(values.quantity),
      reason: String(values.reason),
      at: new Date().toISOString(),
      status: "posted",
    };
  },
};
