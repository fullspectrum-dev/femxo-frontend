import { api, idempotencyKey } from "@/lib/api";
import type { RecordRow } from "../data/records";
import { userNames, warehouseNames } from "./lookups";
import type { LiveService } from "./types";

interface ApiTransfer {
  id: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: "draft" | "in_transit" | "received" | "cancelled";
  reference: string | null;
  lines: { variantId: string; quantity: number; legs: { batchId: string | null; outstanding: number }[] }[];
  createdBy: string;
  createdAt: string;
}

// A "draft" transfer is created and waiting to be sent: the panel's "approved" state (dispatch or cancel).
const STATUS = { draft: "approved", in_transit: "in_transit", received: "received", cancelled: "cancelled" } as const;

function toRow(t: ApiTransfer, names: Map<string, string>, people: Map<string, string>): RecordRow {
  return {
    id: t.id,
    code: t.reference ?? `TR-${t.id.slice(-6).toUpperCase()}`,
    from: names.get(t.fromWarehouseId) ?? "—",
    to: names.get(t.toWarehouseId) ?? "—",
    lines: t.lines.length,
    units: t.lines.reduce((sum, line) => sum + line.quantity, 0),
    requestedBy: people.get(t.createdBy) ?? "—",
    date: t.createdAt.slice(0, 10),
    status: STATUS[t.status],
  };
}

const warehouses = () => warehouseNames().catch(() => new Map<string, string>());
const people = () => userNames().catch(() => new Map<string, string>());

export const transfersService: LiveService = {
  actions: ["dispatch", "receive", "cancel"],
  searchPlaceholder: "Filter the transfers on this page…",
  async list({ q, status, cursor, limit }) {
    const res = await api.get<{ transfers: ApiTransfer[]; nextCursor: string | null }>("/inventory/transfers", { cursor, limit });
    const [names, who] = await Promise.all([warehouses(), people()]);
    const needle = q?.trim().toLowerCase();
    // Narrows the loaded page only: this list has no search or status filter yet.
    const items = res.transfers
      .map((t) => toRow(t, names, who))
      .filter(
        (row) =>
          (!status || row.status === status) &&
          (!needle || [row.code, row.from, row.to, row.requestedBy].some((v) => String(v).toLowerCase().includes(needle)))
      );
    return { items, nextCursor: res.nextCursor, total: null };
  },
  async transition(row, actionKey) {
    const key = { "Idempotency-Key": idempotencyKey() };
    let res: { transfer: ApiTransfer };
    if (actionKey === "dispatch") {
      res = await api.post(`/inventory/transfers/${row.id}/dispatch`, {}, key);
    } else if (actionKey === "cancel") {
      res = await api.post(`/inventory/transfers/${row.id}/cancel`, { reason: "Cancelled from the admin panel" }, key);
    } else {
      // Receive everything still on the road, batch by batch.
      const { transfer } = await api.get<{ transfer: ApiTransfer }>(`/inventory/transfers/${row.id}`);
      const receipts = transfer.lines.flatMap((line) =>
        line.legs
          .filter((leg) => leg.outstanding > 0)
          .map((leg) => ({ variantId: line.variantId, ...(leg.batchId ? { batchId: leg.batchId } : {}), quantity: leg.outstanding }))
      );
      res = await api.post(`/inventory/transfers/${row.id}/receive`, { receipts }, key);
    }
    return toRow(res.transfer, await warehouses(), await people());
  },
};
