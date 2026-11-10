import { api } from "@/lib/api";
import type { RecordRow } from "../data/records";
import { dayOf, pageOf, stepsOf } from "./shared";
import type { LiveService } from "./types";

/*
 * Wallets and payouts against femxo-backend (/wallets, /finance/payouts). The prototype's
 * "settlements" view is the payout queue here: a payout is requested, approved by a second
 * person, then paid by the bank.
 */

// ---------- Wallets ----------

interface ApiWallet {
  id: string;
  ownerType: "dealer" | "sub_dealer";
  ownerId: string;
}
interface ApiBalances {
  spendable: number;
  held: number;
  pending: number;
}

const OWNER_LABEL = { dealer: "Dealer", sub_dealer: "Sub-dealer" } as const;

export function walletRow(wallet: ApiWallet, balances: ApiBalances | null): RecordRow {
  return {
    id: wallet.id,
    partner: wallet.ownerId,
    kind: OWNER_LABEL[wallet.ownerType],
    balance: balances?.spendable ?? null,
    held: balances?.held ?? null,
    pending: balances?.pending ?? null,
    status: "active",
  };
}

export const walletsService: LiveService = {
  actions: [],
  searchPlaceholder: "Filter the wallets on this page…",
  viewPatch: {
    searchKeys: ["partner", "kind"],
    columns: [
      { key: "partner", header: "Owner ID", primary: true, sub: "kind" },
      { key: "balance", header: "Spendable", format: "inr" },
      { key: "held", header: "Held", format: "inr" },
      { key: "pending", header: "Pending", format: "inr", hideOnMobile: true },
    ],
    statuses: [],
    details: [
      { label: "Owner type", key: "kind" },
      { label: "Spendable", key: "balance", format: "inr" },
      { label: "Held", key: "held", format: "inr" },
      { label: "Pending", key: "pending", format: "inr" },
    ],
    note: () => "Each balance is the sum of the wallet ledger. Money only moves through ledger entries.",
    readOnly: true,
  },
  async list({ q, cursor, limit }) {
    const res = await api.get<{ items: ApiWallet[]; nextCursor: string | null }>("/wallets", { cursor, limit });
    // The list carries no balances; one read per wallet on the page (a page is small).
    const rows = await Promise.all(
      res.items.map(async (wallet) => {
        const detail = await api.get<{ balances: ApiBalances | null }>(`/wallets/${wallet.id}`).catch(() => null);
        return walletRow(wallet, detail?.balances ?? null);
      })
    );
    const needle = q?.trim().toLowerCase();
    return pageOf(rows.filter((r) => !needle || [r.partner, r.kind].some((v) => String(v).toLowerCase().includes(needle))), res.nextCursor);
  },
};

// ---------- Payouts (the "settlements" view) ----------

type PayoutStatus = "requested" | "approved" | "processing" | "paid" | "rejected" | "failed";
interface ApiPayout {
  id: string;
  ownerType: "dealer" | "sub_dealer";
  ownerId: string;
  amountPaise: number;
  note: string;
  status: PayoutStatus;
  utr: string | null;
  failureReason: string | null;
  createdAt: string;
}

export function payoutRow(p: ApiPayout): RecordRow {
  return {
    id: p.id,
    code: `PO-${p.id.slice(-6).toUpperCase()}`,
    partner: p.ownerId,
    kind: OWNER_LABEL[p.ownerType],
    note: p.note,
    amount: p.amountPaise,
    utr: p.utr,
    problem: p.failureReason,
    created: dayOf(p.createdAt),
    status: p.status,
  };
}

const PAYOUT_STEPS = ["Requested", "Approved", "Paid"] as const;

export const payoutsService: LiveService = {
  actions: ["approve", "reject"],
  searchPlaceholder: "Filter the payouts on this page…",
  viewPatch: {
    label: "Payouts",
    entity: "payout",
    searchKeys: ["code", "partner", "note"],
    columns: [
      { key: "code", header: "Payout", primary: true, sub: "partner" },
      { key: "kind", header: "Owner type", hideOnMobile: true },
      { key: "amount", header: "Amount", format: "inr" },
      { key: "created", header: "Requested", format: "date", hideOnMobile: true },
      { key: "status", header: "Status", format: "status" },
    ],
    statuses: ["requested", "approved", "processing", "paid", "rejected", "failed"],
    details: [
      { label: "Owner", key: "partner" },
      { label: "Owner type", key: "kind" },
      { label: "Amount", key: "amount", format: "inr" },
      { label: "Note", key: "note" },
      { label: "Bank reference (UTR)", key: "utr" },
      { label: "Problem", key: "problem" },
      { label: "Requested", key: "created", format: "date" },
    ],
    recordName: (r) => `${r.code} · ${r.partner}`,
    timeline: {
      label: "Payout progress",
      steps: (r) => {
        if (r.status === "rejected") return stepsOf(PAYOUT_STEPS, 1, { failed: true, metas: { 1: "Rejected. Money went back to the wallet." } });
        if (r.status === "failed") return stepsOf(PAYOUT_STEPS, 2, { failed: true, metas: { 2: "Bank transfer failed" } });
        const at = { requested: 1, approved: 2, processing: 2, paid: 3 } as Partial<Record<string, number>>;
        return stepsOf(PAYOUT_STEPS, at[r.status] ?? 0);
      },
    },
    note: (r) =>
      r.status === "requested"
        ? "The amount already left the wallet's spendable balance. The approver must be a different person from the requester."
        : null,
    actions: [
      {
        key: "approve",
        label: "Approve payout",
        from: ["requested"],
        to: "approved",
        variant: "gold",
        confirm: {
          kind: "financial",
          title: "Approve payout",
          description: "The bank transfer is queued and can't be recalled.",
          amountKey: "amount",
          confirmLabel: "Approve and send",
        },
        toast: (r) => `${r.code} approved. Bank transfer queued.`,
      },
      {
        key: "reject",
        label: "Reject",
        from: ["requested"],
        to: "rejected",
        variant: "danger",
        confirm: {
          kind: "destructive",
          title: "Reject payout",
          description: "Nothing is paid. The money goes back to the wallet.",
          amountKey: "amount",
          confirmLabel: "Reject payout",
          reason: { label: "Reason for rejecting", min: 3 },
        },
        toast: (r) => `${r.code} rejected. Wallet credited.`,
      },
    ],
    empty: { title: "No payouts", message: "Payouts appear when a dealer or sub-dealer asks to withdraw from a wallet." },
  },
  async list({ q, status, cursor, limit }) {
    const res = await api.get<{ items: ApiPayout[]; nextCursor: string | null }>("/finance/payouts", { status, cursor, limit });
    const needle = q?.trim().toLowerCase();
    const rows = res.items
      .map(payoutRow)
      .filter((r) => !needle || [r.code, r.partner, r.note].some((v) => String(v).toLowerCase().includes(needle)));
    return pageOf(rows, res.nextCursor);
  },
  async transition(row, actionKey, _to, context) {
    const body = actionKey === "reject" ? { reason: context?.reason ?? "Rejected from the admin panel" } : {};
    const res = await api.post<{ payout: ApiPayout }>(`/finance/payouts/${row.id}/${actionKey}`, body);
    return payoutRow(res.payout);
  },
};
