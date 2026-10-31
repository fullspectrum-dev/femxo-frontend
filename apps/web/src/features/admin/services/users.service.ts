import { api } from "@/lib/api";
import type { RecordRow } from "../data/records";
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

export const usersService: LiveService = {
  actions: ["disable", "enable"],
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
  async transition(row, _actionKey, to) {
    const res = await api.patch<{ user: ApiUser }>(`/users/${row.id}`, { status: to });
    return toRow(res.user);
  },
};
