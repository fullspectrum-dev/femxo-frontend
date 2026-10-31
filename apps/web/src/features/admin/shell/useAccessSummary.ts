"use client";

import { useEffect, useState } from "react";
import { authApi } from "@/features/auth";
import type { AccessSummary } from "@/features/auth/types/auth";

/** What the signed-in user may do and where (GET /access/me). `null` until it loads, or if the call fails. */
export function useAccessSummary(): AccessSummary | null {
  const [access, setAccess] = useState<AccessSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    authApi
      .access()
      .then((summary) => {
        if (!cancelled) setAccess(summary);
      })
      .catch(() => {
        if (!cancelled) setAccess(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return access;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The two lines under "Viewing as", built only from what the API says about this user. */
export function describeAccess(access: AccessSummary | null): { role: string; scope: string } {
  if (!access) return { role: "—", scope: "—" };
  if (access.isSuperAdmin) return { role: "Super Admin", scope: "All territories · Full access" };
  return {
    role: access.roles.length ? access.roles.join(", ") : "No role",
    scope: `${access.territoryIds.length ? plural(access.territoryIds.length, "territory", "territories") : "No territory"} · ${plural(access.permissions.length, "permission", "permissions")}`,
  };
}
