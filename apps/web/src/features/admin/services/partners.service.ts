import { api } from "@/lib/api";
import type { RecordRow } from "../data/records";
import { DealerHistory, RegistrationModeCard } from "../modules/extras/DealerExtras";
import type { CreateSpec, EditSpec, ViewSpec } from "../modules/types";
import { approverOptions, approversFor } from "./approvers";
import { lastOf, territoryNames } from "./lookups";
import { dayOf, maskPhone, pageOf, stepsOf } from "./shared";
import type { LiveService } from "./types";

/*
 * Dealers and sub-dealers against femxo-backend (/dealer/dealers, /sub-dealers). Lifecycle: create (draft), submit with an
 * approver, the approver decides under /approvals, then a Super Admin activates; suspend and reactivate need a reason.
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
    path: d.territoryPath.join(","),
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
      ? "Waiting for the approver. Find the request under Approvals."
      : row.status === "approved"
        ? "Approved. A Super Admin gives the final activation."
      : row.status === "draft"
        ? "A draft can be edited until it is submitted."
        : null,
  actions: [
    {
      key: "submit", label: "Submit application", from: ["draft"], to: "submitted", variant: "primary",
      confirm: {
        kind: "destructive",
        title: "Submit application",
        description: "Opens an approval request. The approver you choose decides it; you can't edit the application while it waits.",
        confirmLabel: "Submit",
        pick: { label: "Who approves this application?", options: approverChoices },
      },
      toast: (r) => `${r.name} submitted for approval.`,
    },
    {
      key: "activate", label: "Activate dealer", from: ["approved"], to: "active", variant: "gold", superAdminOnly: true,
      confirm: { kind: "financial", title: "Activate dealer", description: "Final step (Super Admin only). The dealer can start trading.", confirmLabel: "Activate" },
      toast: (r) => `${r.name} is now active.`,
    },
    {
      key: "suspend", label: "Suspend", from: ["active"], to: "suspended", variant: "danger", superAdminOnly: true,
      confirm: { kind: "destructive", title: "Suspend dealer", description: "No new sub-dealers can be added under a suspended dealer. Super Admin only.", confirmLabel: "Suspend", reason: { label: "Reason for suspending", min: 3 } },
      toast: (r) => `${r.name} suspended.`,
    },
    {
      key: "reactivate", label: "Reactivate", from: ["suspended"], to: "active", variant: "secondary", superAdminOnly: true,
      confirm: { kind: "destructive", title: "Reactivate dealer", description: "The dealer can trade again. Super Admin only.", confirmLabel: "Reactivate", reason: { label: "Reason for reactivating", min: 3 } },
      toast: (r) => `${r.name} reactivated.`,
    },
  ],
  extra: DealerHistory,
  banner: RegistrationModeCard,
};

/** What the edit form was filled from (GET /dealer/dealers/:id), so saving sends only what changed with that `rev`. */
const dealerOriginals = new Map<string, ApiDealer>();

const dealerEdit: EditSpec = {
  label: "Save changes",
  title: "Edit dealer application",
  description: "Only draft and rejected applications can be edited. Editing a rejected one puts it back in draft under the same Dealer ID.",
  when: (row) => row.status === "draft" || row.status === "rejected",
  fields: [
    { name: "businessName", label: "Business name", kind: "text", required: true },
    { name: "ownerName", label: "Owner name", kind: "text", required: true },
    { name: "mobile", label: "Mobile number", kind: "tel", required: true, placeholder: "10-digit mobile", pattern: MOBILE },
    { name: "reason", label: "What changed", kind: "textarea", helper: "Optional. Kept in the application history." },
  ],
  async load(row) {
    const { dealer } = await api.get<{ dealer: ApiDealer }>(`/dealer/dealers/${row.id}`);
    dealerOriginals.set(dealer.id, dealer);
    return { values: { businessName: dealer.businessName, ownerName: dealer.ownerName, mobile: dealer.mobile, reason: "" }, images: [] };
  },
  toast: (values) => `${values.businessName} saved.`,
};

export const dealersService: LiveService = {
  canCreate: true,
  actions: ["submit", "activate", "suspend", "reactivate"],
  searchPlaceholder: "Dealer ID, mobile, or the start of the name (3+ letters)",
  viewPatch: dealerView,
  createSpec: dealerCreate,
  editSpec: dealerEdit,
  async update(row, values) {
    const before = dealerOriginals.get(row.id);
    if (!before) throw new Error("Close and reopen the form, then try again");
    const text = (key: string) => String(values[key] ?? "").trim();
    const digits = (value: string) => value.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
    const patch: Record<string, unknown> = {};
    if (text("businessName") !== before.businessName) patch.businessName = text("businessName");
    if (text("ownerName") !== before.ownerName) patch.ownerName = text("ownerName");
    if (digits(text("mobile")) !== digits(before.mobile)) patch.mobile = text("mobile");
    if (!Object.keys(patch).length) return row;
    const res = await api.patch<{ dealer: ApiDealer }>(`/dealer/dealers/${row.id}`, { rev: before.rev, ...patch, ...(text("reason") ? { reason: text("reason") } : {}) });
    dealerOriginals.delete(row.id);
    return dealerRow(res.dealer, await territoryNames([lastOf(res.dealer.territoryPath)]));
  },
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
  async transition(row, actionKey, _to, context) {
    // Every call carries the revision that was read, so a change made meanwhile is a conflict, not an overwrite.
    const rev = Number(row.rev);
    const body =
      actionKey === "submit"
        ? { rev, approverId: context?.picked }
        : actionKey === "activate"
          ? { rev }
          : { rev, reason: context?.reason ?? "" };
    const res = await api.post<{ dealer: ApiDealer }>(`/dealer/dealers/${row.id}/${actionKey}`, body);
    return dealerRow(res.dealer, await territoryNames([lastOf(res.dealer.territoryPath)]));
  },
};

/** Who can approve this dealer's application: holders of approval.decide in the dealer's district, other than the signed-in user. */
async function approverChoices(row: RecordRow) {
  const path = typeof row.path === "string" && row.path ? row.path.split(",") : [];
  return approverOptions(await approversFor("dealer.application", path));
}

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
