import type { Location, Serviceability } from "@femxo/shared/contracts";

export interface LocationOption {
  id: string;
  name: string;
  /** "Patna, Bihar": where it is, nearest first. */
  where: string;
  pincode?: string;
  /** Whether we deliver there; unknown (null) when the check didn't run. */
  serviceable: boolean | null;
}

/** "Bihta, Patna, Bihar" from a location's breadcrumb (which runs from the state down). */
export const whereOf = (location: Pick<Location, "breadcrumb">): string =>
  [...(location.breadcrumb ?? [])]
    .reverse()
    .map((b) => b.name)
    .join(", ");

/** The picker's rows: the locations found, joined with the serviceability answer for their pincode, served ones first. */
export function locationOptions(locations: readonly Location[], serviceability: Serviceability | null): LocationOption[] {
  const served = new Map((serviceability?.locations ?? []).map((l) => [l.id, l.serviceable]));
  return locations
    .map((l) => ({
      id: l.id,
      name: l.name,
      where: whereOf(l),
      pincode: l.pincode,
      serviceable: serviceability ? (served.get(l.id) ?? false) : null,
    }))
    .sort((a, b) => Number(b.serviceable === true) - Number(a.serviceable === true));
}

/** What to tell the customer about a pincode we looked up. */
export function pincodeVerdict(serviceability: Serviceability): { tone: "ok" | "no" | "unknown"; text: string } {
  if (!serviceability.known) return { tone: "unknown", text: `We don't recognise the pincode ${serviceability.pincode}. Check it, or search for your village by name.` };
  if (!serviceability.serviceable) return { tone: "no", text: `We don't deliver to ${serviceability.pincode} yet.` };
  return { tone: "ok", text: `We deliver to ${serviceability.pincode}.` };
}
