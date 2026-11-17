import { api } from "@/lib/api";
import type { RecordRow } from "../data/records";
import { UserAccess } from "../modules/extras/UserAccess";
import type { CreateSpec } from "../modules/types";
import { territoryNames } from "./lookups";
import type { LiveService } from "./types";

interface ApiUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  status: "active" | "disabled";
  mustChangePassword: boolean;
  createdAt: string;
  /** In list items since 2026-11 (and `lastLoginAt` on every user object); absent on an older API. */
  roles?: { id: string; name: string }[];
  territoryIds?: string[];
  lastLoginAt?: string | null;
}

/** "Patna", "Patna +2", "3 territories" when nothing is named, "—" when there are none. */
export function territoryText(ids: readonly string[] | undefined, names: ReadonlyMap<string, string> = new Map()): string {
  if (!ids?.length) return "—";
  const first = names.get(ids[0]!);
  if (!first) return `${ids.length} ${ids.length === 1 ? "territory" : "territories"}`;
  return ids.length === 1 ? first : `${first} +${ids.length - 1}`;
}

export const roleText = (u: Pick<ApiUser, "isSuperAdmin" | "roles">) => (u.isSuperAdmin ? "Super Admin" : u.roles?.length ? u.roles.map((r) => r.name).join(", ") : "—");

export const toRow = (u: ApiUser, names: ReadonlyMap<string, string> = new Map()): RecordRow => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: roleText(u),
  scope: u.isSuperAdmin ? "All territories" : territoryText(u.territoryIds, names),
  lastLogin: u.lastLoginAt ?? null,
  status: u.status,
});

/** A 16-character temporary password (the API wants 12+ for staff), from the browser's secure random source. */
export function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

const userCreate: CreateSpec = {
  label: "Add user",
  title: "Add user",
  description: "Creates a staff login with a temporary password. They must change it at first sign-in. Then open the user to give roles, territories, warehouses and a price list.",
  fields: [
    { name: "name", label: "Full name", kind: "text", required: true },
    { name: "email", label: "Work email", kind: "email", required: true, pattern: { regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email address." } },
    {
      name: "temporaryPassword",
      label: "Temporary password",
      kind: "password",
      required: true,
      helper: "At least 12 characters. Share it with them privately.",
      pattern: { regex: /^.{12,128}$/, message: "Use 12 to 128 characters." },
    },
  ],
  status: "active",
  toRow: (v) => v,
  toast: (v) => `${v.name} can now sign in with the temporary password.`,
};

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const usersService: LiveService = {
  canCreate: true,
  createSpec: userCreate,
  actions: ["disable", "enable", "reset"],
  viewPatch: { extra: UserAccess },
  actionOverrides: {
    reset: {
      confirm: { title: "Reset password", description: "Sets a new temporary password and ends nothing else. They must change it at their next sign-in.", confirmLabel: "Reset password" },
      toast: (r) => `Temporary password for ${r.name}: ${r.tempPassword}${r.copied ? " (copied)" : ""}`,
    },
  },
  // The API matches the start of the email address only.
  searchPlaceholder: "Search by email (starts with)…",
  async list({ q, status, cursor, limit }) {
    const res = await api.get<{ items: ApiUser[]; nextCursor: string | null }>("/users", {
      q,
      status,
      cursor,
      limit,
    });
    // Name the first territory of each user; a lookup that fails leaves the count.
    const first = res.items.flatMap((u) => u.territoryIds?.slice(0, 1) ?? []).filter((id) => /^[a-z_]+:\d+$/i.test(id) && !id.startsWith("sales:"));
    const names = await territoryNames(first).catch(() => new Map<string, string>());
    return { items: res.items.map((u) => toRow(u, names)), nextCursor: res.nextCursor, total: null };
  },
  async create(values) {
    const res = await api.post<{ user: ApiUser }>("/users", {
      name: String(values.name).trim(),
      email: String(values.email).trim().toLowerCase(),
      temporaryPassword: String(values.temporaryPassword),
    });
    return toRow(res.user);
  },
  async transition(row, actionKey, to) {
    if (actionKey === "reset") {
      const password = temporaryPassword();
      await api.post(`/users/${row.id}/password-reset`, { temporaryPassword: password });
      return { ...row, tempPassword: password, copied: (await copy(password)) ? 1 : 0 };
    }
    const res = await api.patch<{ user: ApiUser }>(`/users/${row.id}`, { status: to });
    return toRow(res.user);
  },
};
