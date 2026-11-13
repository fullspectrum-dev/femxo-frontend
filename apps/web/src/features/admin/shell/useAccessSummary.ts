"use client";

import { useEffect, useState } from "react";
import { authApi } from "@/features/auth";
import type { AccessSummary } from "@/features/auth/types/auth";

/**
 * What the signed-in user may do and where (GET /access/me). `access` is null
 * until it loads; `failed` tells a failed call (network, 5xx) apart from a user
 * with no role, so a short outage is not shown as "Access denied". `retry` asks again.
 */
export function useAccessSummary(): { access: AccessSummary | null; loaded: boolean; failed: boolean; retry: () => void } {
  const [access, setAccess] = useState<AccessSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    authApi
      .access()
      .then((summary) => {
        if (!cancelled) {
          setAccess(summary);
          setFailed(false);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAccess(null);
          setFailed(true);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  return { access, loaded, failed, retry: () => {
      setLoaded(false);
      setAttempt((n) => n + 1);
    },
  };
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
