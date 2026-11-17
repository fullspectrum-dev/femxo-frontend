import type { AccessSummary } from "@/features/auth/types/auth";
import type { ActionSpec } from "./types";

/** Whether this user is offered the action: Super-Admin-only ones and permission-gated ones are hidden from the rest. */
export function allowed(access: AccessSummary | null, action: Pick<ActionSpec, "superAdminOnly" | "requires">): boolean {
  if (access?.isSuperAdmin) return true;
  if (action.superAdminOnly) return false;
  return !action.requires || access?.permissions.includes(action.requires) === true;
}
