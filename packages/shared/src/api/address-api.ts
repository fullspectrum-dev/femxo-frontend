import { z } from "zod";
import { Address, type AddressInput } from "../contracts/commerce";
import type { ApiAdapter } from "./adapter";
import { request } from "./request";

const Book = z.array(Address);

/**
 * AddressApi: the customer's address book. Every change answers with the
 * whole book, so the screen never has to guess which address became the default.
 */
export function createAddressApi(adapter: ApiAdapter) {
  const one = (id: string) => `/addresses/${encodeURIComponent(id)}`;
  return {
    list: (signal?: AbortSignal) => request(adapter, { method: "GET", path: "/addresses", signal }, Book),
    /** 422 NOT_SERVICEABLE for a pincode we don't deliver to; 422 VALIDATION_FAILED names the wrong fields. */
    create: (input: AddressInput) => request(adapter, { method: "POST", path: "/addresses", body: input }, Book),
    update: (id: string, input: AddressInput) => request(adapter, { method: "PATCH", path: one(id), body: input }, Book),
    remove: (id: string) => request(adapter, { method: "DELETE", path: one(id) }, Book),
  };
}

export type AddressApi = ReturnType<typeof createAddressApi>;
