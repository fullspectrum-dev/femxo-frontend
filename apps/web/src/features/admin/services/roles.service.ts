import { api } from "@/lib/api";
import type { RecordRow } from "../data/records";
import type { LiveService } from "./types";

interface ApiRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

// The API has no role status or user count: roles are listed whole (bounded) and deleted outright.
const toRow = (r: ApiRole): RecordRow => ({
  id: r.id,
  name: r.name,
  kind: "Custom",
  users: null,
  permissions: r.permissions.length,
  scope: r.description || "—",
  status: "active",
});

export const rolesService: LiveService = {
  canCreate: true,
  actions: ["archive"],
  searchPlaceholder: "Search roles by name",
  // The API has no archive state for roles: this removes the role for good.
  actionOverrides: {
    archive: {
      label: "Delete role",
      confirm: {
        title: "Delete role",
        description: "This permanently deletes the role. A role that is still assigned to users can't be deleted.",
        confirmLabel: "Delete role",
      },
      toast: (r) => `Role "${r.name}" deleted.`,
    },
  },
  async list({ q, status }) {
    const res = await api.get<{ roles: ApiRole[] }>("/access/roles");
    const needle = q?.trim().toLowerCase();
    const items = res.roles
      .map(toRow)
      .filter((row) => (!status || row.status === status) && (!needle || String(row.name).toLowerCase().includes(needle)));
    return { items, nextCursor: null, total: items.length };
  },
  async create(values) {
    const res = await api.post<{ role: ApiRole }>("/access/roles", {
      name: String(values.name),
      description: String(values.description ?? values.scope ?? ""),
      permissions: [],
    });
    return toRow(res.role);
  },
  async transition(row) {
    await api.delete(`/access/roles/${row.id}`);
    return { ...row, status: "archived" };
  },
};
