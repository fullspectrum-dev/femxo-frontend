import { api } from "@/lib/api";
import type { RecordRow } from "../data/records";
import type { CreateSpec, ViewSpec } from "../modules/types";
import { lastOf, territoryNames } from "./lookups";
import { dayOf, maskPhone, pageOf, stepsOf } from "./shared";
import type { LiveService } from "./types";

/*
 * Dealers and sub-dealers against femxo-backend (/dealer/dealers, /sub-dealers). The API can create a dealer
 * application and submit it; approval, activation and suspension have no route yet, so those
 * prototype actions are not offered live.
 */

const MOBILE = { regex: /^(\+?91[\s-]?|0)?[6-9]\d{9}$/, message: "Enter a 10-digit mobile number." };

/** A name needs 3 letters; an ID or a mobile number works at any length. Shorter text is ignored rather than refused. */
export const usableSearch = (q: string | undefined) => {
  const needle = q?.trim();
  return needle && (needle.length >= 3 || /^\d+$/.test(needle)) ? needle : undefined;
};

// ---------- Dealers ----------

type DealerStatus = "draft" | "submitted" | "rejected" | "approved" | "active" | "suspended";
export interface ApiDealer {
  id: string;
  dealerId: string;
  businessName: string;
  ownerName: string;
  mobile: string;
  territoryPath: string[];
  status: DealerStatus;
  rev: number;
  createdAt: string;
}

export function dealerRow(d: ApiDealer, places: Map<string, string>): RecordRow {
  const district = lastOf(d.territoryPath);
  return {
    id: d.id,
    code: d.dealerId,
    name: d.businessName,
    owner: d.ownerName,
    district: places.get(district) ?? district,
    phone: maskPhone(d.mobile),
    joined: dayOf(d.createdAt),
    rev: d.rev,
    status: d.status,
  };
}

const DEALER_STEPS = ["Application", "Submitted", "Approved", "Active"] as const;
const DEALER_POSITION: Record<DealerStatus, number> = { draft: 0, rejected: 1, submitted: 1, approved: 2, active: 3, suspended: 3 };

/** Every district the caller can pick, labelled with its state ("Patna (Bihar)"): label → territory id. Loaded once. */
let districts: Promise<Map<string, string>> | undefined;
export function districtChoices(): Promise<Map<string, string>> {
  districts ??= (async () => {
    const states = (await api.get<{ territories: { id: string; name: string }[] }>("/territories")).territories;
    const lists = await Promise.all(
      states.map(async (state) => {
        const res = await api.get<{ territories: { id: string; name: string; type: string }[] }>("/territories", { parentId: state.id });
        return res.territories.filter((t) => t.type === "district").map((t) => [`${t.name} (${state.name})`, t.id] as const);
      })
    );
    return new Map(lists.flat().sort(([a], [b]) => a.localeCompare(b)));
  })().catch((error) => {
    districts = undefined;
    throw error;
  });
  return districts;
}

const dealerCreate: CreateSpec = {
  label: "Add dealer",
  title: "Add dealer",
  description: "Creates a draft application in a district. Submit it from the dealer's details when it is complete.",
  fields: [
    { name: "businessName", label: "Business name", kind: "text", required: true, placeholder: "Anand Agencies" },
    { name: "ownerName", label: "Owner name", kind: "text", required: true },
    { name: "districtId", label: "District", kind: "select", required: true, options: [] },
    { name: "mobile", label: "Mobile number", kind: "tel", required: true, placeholder: "10-digit mobile", pattern: MOBILE },
  ],
  status: "draft",
  toRow: (v) => v,
  toast: (v) => `${v.businessName} saved as a draft application.`,
  prepare: async () => ({ districtId: [...(await districtChoices()).keys()] }),
};

const dealerView: Partial<ViewSpec> = {
  searchKeys: ["name", "code", "owner", "district"],
  columns: [
    { key: "name", header: "Dealer", primary: true, sub: "code" },
    { key: "district", header: "District" },
    { key: "owner", header: "Owner", hideOnMobile: true },
    { key: "phone", header: "Mobile", hideOnMobile: true },
    { key: "status", header: "Status", format: "status" },
  ],
  statuses: ["draft", "submitted", "approved", "active", "suspended", "rejected"],
  details: [
    { label: "Dealer ID", key: "code" },
    { label: "Owner", key: "owner" },
    { label: "District", key: "district" },
    { label: "Mobile", key: "phone" },
    { label: "Registered", key: "joined", format: "date" },
  ],
  timeline: {
    label: "Application progress",
    steps: (row) => {
      const status = row.status as DealerStatus;
      if (status === "rejected") return stepsOf(DEALER_STEPS, 1, { failed: true, metas: { 1: "Rejected. Edit and resubmit." } });
      if (status === "suspended") return stepsOf(DEALER_STEPS, 3, { failed: true, metas: { 3: "Suspended" } });
      return stepsOf(DEALER_STEPS, DEALER_POSITION[status] ?? 0);
    },
  },
  note: (row) =>
    row.status === "submitted"
      ? "Waiting for approval. The approval and activation steps are not available from the API yet."
      : row.status === "draft"
        ? "A draft can be edited until it is submitted."
        : null,
  actions: [{ key: "submit", label: "Submit application", from: ["draft"], to: "submitted", variant: "primary", toast: (r) => `${r.name} submitted for review.` }],
};

export const dealersService: LiveService = {
  canCreate: true,
  actions: ["submit"],
  searchPlaceholder: "Dealer ID, mobile, or the start of the name (3+ letters)",
  viewPatch: dealerView,
  createSpec: dealerCreate,
  async list({ q, status, cursor, limit }) {
    const res = await api.get<{ items: ApiDealer[]; nextCursor: string | null }>("/dealer/dealers", { q: usableSearch(q), status, cursor, limit });
    const places = await territoryNames(res.items.map((d) => lastOf(d.territoryPath)));
    return pageOf(res.items.map((d) => dealerRow(d, places)), res.nextCursor);
  },
  async create(values) {
    const choices = await districtChoices();
    const districtId = choices.get(String(values.districtId));
    if (!districtId) throw new Error("Choose a district from the list.");
    const res = await api.post<{ dealer: ApiDealer }>("/dealer/dealers", {
      districtId,
      businessName: String(values.businessName).trim(),
      ownerName: String(values.ownerName).trim(),
      mobile: String(values.mobile).trim(),
    });
    return dealerRow(res.dealer, await territoryNames([lastOf(res.dealer.territoryPath)]));
  },
  async transition(row) {
    // The API wants the revision that was read, so a change made meanwhile is a conflict, not an overwrite.
    const res = await api.post<{ dealer: ApiDealer }>(`/dealer/dealers/${row.id}/submit`, { rev: Number(row.rev) });
    return dealerRow(res.dealer, await territoryNames([lastOf(res.dealer.territoryPath)]));
  },
};

// ---------- Sub-dealers ----------

export interface ApiSubDealer {
  id: string;
  subDealerId: string;
  parentDealerId: string;
  name: string;
  mobile: string;
  locationId: string;
  locationType: "village" | "ward";
  territoryPath: string[];
  status: "active" | "inactive";
  createdAt: string;
}

const districtOf = (s: ApiSubDealer) => s.territoryPath.find((id) => id.startsWith("district:")) ?? "";

export function subDealerRow(s: ApiSubDealer, places: Map<string, string>): RecordRow {
  const district = districtOf(s);
  return {
    id: s.id,
    code: s.subDealerId,
    name: s.name,
    parent: s.parentDealerId,
    village: places.get(s.locationId) ?? s.locationId,
    district: places.get(district) ?? district,
    phone: maskPhone(s.mobile),
    joined: dayOf(s.createdAt),
    status: s.status,
  };
}

const subDealerCreate: CreateSpec = {
  label: "Add sub-dealer",
  title: "Add sub-dealer",
  description: "Registers a sub-dealer under an active dealer, in a village or ward inside that dealer's district.",
  fields: [
    { name: "name", label: "Business name", kind: "text", required: true },
    { name: "dealerId", label: "Dealer ID", kind: "text", required: true, uppercase: true, placeholder: "DLR-000012", pattern: { regex: /^DLR-\d{1,12}$/i, message: "A dealer ID looks like DLR-000012." } },
    {
      name: "locationId",
      label: "Village or ward ID",
      kind: "text",
      required: true,
      placeholder: "village:5001",
      helper: "The location's ID, such as village:5001 or ward:7001. One active sub-dealer per location.",
      pattern: { regex: /^[a-z_]{3,20}:[A-Za-z0-9_-]{1,32}$/, message: "Use the form village:5001 or ward:7001." },
    },
    { name: "mobile", label: "Mobile number", kind: "tel", required: true, placeholder: "10-digit mobile", pattern: MOBILE },
  ],
  status: "active",
  toRow: (v) => v,
  toast: (v) => `${v.name} registered.`,
};

export const subDealersService: LiveService = {
  canCreate: true,
  actions: [],
  searchPlaceholder: "Sub-dealer ID, mobile, or the start of the name (3+ letters)",
  createSpec: subDealerCreate,
  viewPatch: {
    searchKeys: ["name", "code", "village", "parent"],
    columns: [
      { key: "name", header: "Sub-dealer", primary: true, sub: "code" },
      { key: "parent", header: "Dealer ID" },
      { key: "village", header: "Village / ward" },
      { key: "district", header: "District", hideOnMobile: true },
      { key: "status", header: "Status", format: "status" },
    ],
    statuses: ["active", "inactive"],
    details: [
      { label: "Sub-dealer ID", key: "code" },
      { label: "Dealer ID", key: "parent" },
      { label: "Village / ward", key: "village" },
      { label: "District", key: "district" },
      { label: "Mobile", key: "phone" },
      { label: "Registered", key: "joined", format: "date" },
    ],
    timeline: undefined,
    note: () => "A sub-dealer's village or ward must lie inside the parent dealer's district.",
    actions: [],
  },
  async list({ q, status, cursor, limit }) {
    const res = await api.get<{ items: ApiSubDealer[]; nextCursor: string | null }>("/sub-dealers", { q: usableSearch(q), status, cursor, limit });
    const places = await territoryNames(res.items.flatMap((s) => [s.locationId, districtOf(s)]));
    return pageOf(res.items.map((s) => subDealerRow(s, places)), res.nextCursor);
  },
  async create(values) {
    const res = await api.post<{ subDealer: ApiSubDealer }>("/sub-dealers", {
      dealerId: String(values.dealerId).trim().toUpperCase(),
      name: String(values.name).trim(),
      mobile: String(values.mobile).trim(),
      locationId: String(values.locationId).trim(),
    });
    const s = res.subDealer;
    return subDealerRow(s, await territoryNames([s.locationId, districtOf(s)]));
  },
};
