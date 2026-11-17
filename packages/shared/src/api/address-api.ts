import { z } from "zod";
import { Address, AddressBook, LocationList, Serviceability, type AddressInput } from "../contracts/commerce";
import type { ApiAdapter } from "./adapter";
import { STORE_BASE } from "./auth-api";
import { request } from "./request";

const One = z.object({ address: Address });
const Created = z.object({ address: Address, replayed: z.boolean().optional() });

/**
 * AddressApi: the customer's address book, plus the public pincode and location lookups the address form uses.
 * An address needs a pincode and a location the pincode belongs to, and we must deliver there (422 ADDRESS_NOT_SERVICEABLE,
 * PINCODE_UNKNOWN, PINCODE_LOCATION_MISMATCH, TERRITORY_NOT_FOUND).
 */
export function createAddressApi(adapter: ApiAdapter) {
  const one = (id: string) => `${STORE_BASE}/addresses/${encodeURIComponent(id)}`;
  return {
    list: (signal?: AbortSignal) => request(adapter, { method: "GET", path: `${STORE_BASE}/addresses`, signal }, AddressBook),
    /** Pass the same `idempotencyKey` when retrying the same form submission. */
    create: async (input: AddressInput, idempotencyKey?: string) =>
      (await request(adapter, { method: "POST", path: `${STORE_BASE}/addresses`, body: input, idempotencyKey }, Created)).address,
    update: async (id: string, input: Partial<AddressInput>) => (await request(adapter, { method: "PATCH", path: one(id), body: input }, One)).address,
    setDefault: async (id: string) => (await request(adapter, { method: "PUT", path: `${one(id)}/default`, body: {} }, One)).address,
    remove: (id: string) => request(adapter, { method: "DELETE", path: one(id) }),

    /** Public. No parameter: the states. `parentId`: its children. `pincode` or `q` (2+ letters): a search. */
    locations: (query: { parentId?: string; pincode?: string; q?: string } = {}, signal?: AbortSignal) =>
      request(adapter, { method: "GET", path: `${STORE_BASE}/locations`, query, signal }, LocationList),
    /** Public. An unknown pincode is an answer (`known: false`), not an error. */
    serviceability: (pincode: string, signal?: AbortSignal) =>
      request(adapter, { method: "GET", path: `${STORE_BASE}/serviceability`, query: { pincode }, signal }, Serviceability),
  };
}

export type AddressApi = ReturnType<typeof createAddressApi>;
