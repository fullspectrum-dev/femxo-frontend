import { api } from "@/lib/api";
import type { RecordRow } from "../data/records";
import type { CreateSpec } from "../modules/types";
import { territoryNames } from "./lookups";
import { dayOf, pageOf } from "./shared";
import type { LiveService } from "./types";

/*
 * The set-up data the rest of the panel leans on: brands and categories (/catalog), warehouses
 * (/inventory/warehouses) and commission plans (/commission). Archive and restore are the only
 * state changes; nothing is ever deleted.
 */

const needleOf = (q: string | undefined) => q?.trim().toLowerCase() || "";
const matches = (needle: string, ...values: unknown[]) => !needle || values.some((v) => String(v ?? "").toLowerCase().includes(needle));

// ---------- Brands ----------

interface ApiBrand {
  id: string;
  name: string;
  slug: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

const brandRow = (b: ApiBrand): RecordRow => ({ id: b.id, name: b.name, slug: b.slug, created: dayOf(b.createdAt), updated: dayOf(b.updatedAt), status: b.status });

const brandCreate: CreateSpec = {
  label: "Add brand",
  title: "Add brand",
  description: "A brand products can be filed under. The web address is made from the name unless you give one.",
  fields: [
    { name: "name", label: "Brand name", kind: "text", required: true, placeholder: "Fortune" },
    { name: "slug", label: "Web address (slug)", kind: "text", helper: "Optional. Lower-case letters, digits and dashes.", pattern: { regex: /^[a-z0-9]+(-[a-z0-9]+)*$/, message: "Use lower-case letters, digits and dashes." } },
  ],
  status: "active",
  toRow: (v) => v,
  toast: (v) => `${v.name} added.`,
};

export const brandsService: LiveService = {
  canCreate: true,
  actions: ["archive", "restore"],
  searchPlaceholder: "Filter the brands on this page…",
  createSpec: brandCreate,
  async list({ q, status, cursor, limit }) {
    const res = await api.get<{ brands: ApiBrand[]; nextCursor: string | null }>("/catalog/brands", { includeArchived: true, cursor, limit });
    const needle = needleOf(q);
    return pageOf(res.brands.map(brandRow).filter((r) => (!status || r.status === status) && matches(needle, r.name, r.slug)), res.nextCursor);
  },
  async create(values) {
    const slug = String(values.slug ?? "").trim();
    const res = await api.post<{ brand: ApiBrand }>("/catalog/brands", { name: String(values.name).trim(), ...(slug ? { slug } : {}) });
    return brandRow(res.brand);
  },
  async transition(row, actionKey) {
    const res = await api.post<{ brand: ApiBrand }>(`/catalog/brands/${row.id}/${actionKey === "restore" ? "restore" : "archive"}`, {});
    return brandRow(res.brand);
  },
};

// ---------- Categories ----------

interface ApiCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  depth: number;
  sortOrder: number;
  status: "active" | "archived";
  createdAt: string;
}

async function allCategories(): Promise<ApiCategory[]> {
  return (await api.get<{ categories: ApiCategory[] }>("/catalog/categories", { includeArchived: true })).categories;
}

function categoryRows(list: ApiCategory[]): RecordRow[] {
  const byId = new Map(list.map((c) => [c.id, c]));
  const path = (c: ApiCategory): string => {
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    return parent ? `${path(parent)} › ${c.name}` : c.name;
  };
  return list.map((c) => ({
    id: c.id,
    name: c.name,
    path: path(c),
    parent: c.parentId ? (byId.get(c.parentId)?.name ?? "—") : "Top level",
    level: c.depth + 1,
    order: c.sortOrder,
    slug: c.slug,
    status: c.status,
  }));
}

const TOP_LEVEL = "Top level (no parent)";

const categoryCreate: CreateSpec = {
  label: "Add category",
  title: "Add category",
  description: "A shelf in the catalogue. Put it under a parent to build the aisle tree.",
  fields: [
    { name: "name", label: "Category name", kind: "text", required: true, placeholder: "Pulses" },
    { name: "parent", label: "Parent category", kind: "select", required: true, options: [] },
    { name: "sortOrder", label: "Position", kind: "number", min: 0, helper: "Optional. Lower numbers show first." },
  ],
  status: "active",
  toRow: (v) => v,
  toast: (v) => `${v.name} added.`,
  prepare: async () => ({ parent: [TOP_LEVEL, ...categoryRows(await allCategories()).filter((r) => r.status === "active").map((r) => String(r.path))] }),
};

export const categoriesService: LiveService = {
  canCreate: true,
  actions: ["archive", "restore"],
  searchPlaceholder: "Search categories by name",
  createSpec: categoryCreate,
  async list({ q, status }) {
    const needle = needleOf(q);
    const rows = categoryRows(await allCategories()).filter((r) => (!status || r.status === status) && matches(needle, r.path, r.slug));
    return pageOf(rows, null);
  },
  async create(values) {
    const parentLabel = String(values.parent ?? TOP_LEVEL);
    const parentId = parentLabel === TOP_LEVEL ? null : (categoryRows(await allCategories()).find((r) => r.path === parentLabel)?.id ?? null);
    const sortOrder = String(values.sortOrder ?? "").trim();
    const res = await api.post<{ category: ApiCategory }>("/catalog/categories", {
      name: String(values.name).trim(),
      parentId,
      ...(sortOrder ? { sortOrder: Number(sortOrder) } : {}),
    });
    return categoryRows([res.category])[0]!;
  },
  async transition(row, actionKey) {
    await api.post(`/catalog/categories/${row.id}/${actionKey === "restore" ? "restore" : "archive"}`, {});
    return categoryRows(await allCategories()).find((r) => r.id === row.id) ?? row;
  },
};

// ---------- Warehouses ----------

interface ApiWarehouse {
  id: string;
  name: string;
  code: string;
  address: string;
  status: "active" | "archived";
  createdAt: string;
}

const warehouseRow = (w: ApiWarehouse): RecordRow => ({ id: w.id, name: w.name, code: w.code, address: w.address || "—", created: dayOf(w.createdAt), status: w.status });

const warehouseCreate: CreateSpec = {
  label: "Add warehouse",
  title: "Add warehouse",
  description: "A dark store or depot that holds stock. Its code appears on transfers and pick lists.",
  fields: [
    { name: "name", label: "Name", kind: "text", required: true, placeholder: "Patna Dark Store 1" },
    { name: "code", label: "Code", kind: "text", required: true, uppercase: true, placeholder: "PAT-DS1" },
    { name: "address", label: "Address", kind: "textarea", helper: "Optional." },
  ],
  status: "active",
  toRow: (v) => v,
  toast: (v) => `${v.name} added.`,
};

export const warehousesService: LiveService = {
  canCreate: true,
  actions: ["archive", "restore"],
  searchPlaceholder: "Filter the warehouses on this page…",
  createSpec: warehouseCreate,
  async list({ q, status, cursor, limit }) {
    const res = await api.get<{ warehouses: ApiWarehouse[]; nextCursor: string | null }>("/inventory/warehouses", { includeArchived: true, cursor, limit });
    const needle = needleOf(q);
    return pageOf(res.warehouses.map(warehouseRow).filter((r) => (!status || r.status === status) && matches(needle, r.name, r.code, r.address)), res.nextCursor);
  },
  async create(values) {
    const address = String(values.address ?? "").trim();
    const res = await api.post<{ warehouse: ApiWarehouse }>("/inventory/warehouses", {
      name: String(values.name).trim(),
      code: String(values.code).trim().toUpperCase(),
      ...(address ? { address } : {}),
    });
    return warehouseRow(res.warehouse);
  },
  async transition(row, actionKey) {
    const res = await api.post<{ warehouse: ApiWarehouse }>(`/inventory/warehouses/${row.id}/${actionKey === "restore" ? "restore" : "archive"}`, {});
    return warehouseRow(res.warehouse);
  },
};

// ---------- Commission plans ----------

interface ApiPlan {
  id: string;
  name: string;
  scope: { stateId: string | null; dealerId: string | null; categoryId: string | null };
  lastVersion: number;
  createdAt: string;
}
interface ApiVersion {
  id: string;
  version: number;
  status: "draft" | "validated" | "published";
  model: "stacked" | "pool";
  priority: number;
  dealerRateBp: number | null;
  subDealerRateBp: number | null;
  poolRateBp: number | null;
  effectiveFrom: string | null;
  rev: number;
  effective?: boolean;
}

/** Basis points → "2.5%". */
const pct = (bp: number | null) => (bp === null ? "—" : `${(bp / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`);

async function planRow(p: ApiPlan): Promise<RecordRow> {
  const detail = await api.get<{ versions: ApiVersion[] }>(`/commission/plans/${p.id}`).catch(() => ({ versions: [] as ApiVersion[] }));
  const latest = [...detail.versions].sort((a, b) => b.version - a.version)[0];
  const effective = detail.versions.find((v) => v.effective);
  const places = await territoryNames(p.scope.stateId ? [p.scope.stateId] : []);
  const scope = [p.scope.stateId ? places.get(p.scope.stateId) : "All states", p.scope.dealerId ?? null].filter(Boolean).join(" · ");
  return {
    id: p.id,
    name: p.name,
    scope: scope || "Everywhere",
    version: latest ? `v${latest.version}` : "—",
    live: effective ? `v${effective.version}` : "None yet",
    model: latest ? (latest.model === "pool" ? "Pool split" : "Stacked rates") : "—",
    dealerRate: pct(latest?.model === "pool" ? (latest?.poolRateBp ?? null) : (latest?.dealerRateBp ?? null)),
    subDealerRate: pct(latest?.model === "pool" ? null : (latest?.subDealerRateBp ?? null)),
    from: latest?.effectiveFrom ?? null,
    versionId: latest?.id ?? null,
    rev: latest?.rev ?? null,
    created: dayOf(p.createdAt),
    status: latest?.status ?? "draft",
  };
}

export const commissionService: LiveService = {
  actions: ["validate", "publish"],
  searchPlaceholder: "Filter the plans on this page…",
  async list({ q, status, cursor, limit }) {
    const res = await api.get<{ items: ApiPlan[]; nextCursor: string | null }>("/commission/plans", { cursor, limit });
    const needle = needleOf(q);
    const rows = (await Promise.all(res.items.map(planRow))).filter((r) => (!status || r.status === status) && matches(needle, r.name, r.scope));
    return pageOf(rows, res.nextCursor);
  },
  async transition(row, actionKey, _to, context) {
    if (!row.versionId) throw new Error("This plan has no version to change.");
    await api.post(`/commission/versions/${row.versionId}/${actionKey}`, { rev: Number(row.rev), ...(context?.reason ? { reason: context.reason } : {}) });
    const res = await api.get<{ plan: ApiPlan }>(`/commission/plans/${row.id}`);
    return planRow(res.plan);
  },
};
