import { authApi } from "@/features/auth";
import { api } from "@/lib/api";

/* Who can decide an approval request at a place: GET /approvals/approvers (holders of approval.decide whose territories cover the path). */

export interface Approver {
  id: string;
  name: string;
  email: string;
}

/** Who can approve a request of this type at this place, other than the signed-in user (GET /approvals/approvers). */
export async function approversFor(type: string, territoryPath: readonly string[]): Promise<Approver[]> {
  if (!territoryPath.length) return [];
  const [me, res] = await Promise.all([
    authApi.me(),
    api.get<{ items: Approver[] }>("/approvals/approvers", { type, territoryPath: territoryPath.slice(0, 12).join(",") }),
  ]);
  return res.items.filter((a) => a.id !== me.id);
}

/** The approver dropdown's options: "Name (email)". */
export const approverOptions = (list: readonly Approver[]) => list.map((a) => ({ value: a.id, label: `${a.name} (${a.email})` }));
