import { api } from "@/lib/api";
import type { RecordRow } from "../data/records";
import type { CreateSpec } from "../modules/types";
import type { LiveService } from "./types";

interface ApiUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  status: "active" | "disabled";
  mustChangePassword: boolean;
  createdAt: string;
}

// The API's user carries no role, territory or last-login yet; those columns show a dash.
const toRow = (u: ApiUser): RecordRow => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.isSuperAdmin ? "Super Admin" : "—",
  scope: "—",
  lastLogin: null,
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
  description: "Creates a staff login with a temporary password. They must change it at first sign-in. Give roles and territories from Roles & Permissions.",
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
    return { items: res.items.map(toRow), nextCursor: res.nextCursor, total: null };
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
