import { z } from "zod";
import { Ticket, type TicketInput } from "../contracts/people";
import type { ApiAdapter } from "./adapter";
import { request } from "./request";

/** SupportApi: the customer's help requests, each a thread with support. */
export function createSupportApi(adapter: ApiAdapter) {
  const one = (id: string) => `/support/tickets/${encodeURIComponent(id)}`;
  return {
    /** Most recently active first. */
    list: (signal?: AbortSignal) => request(adapter, { method: "GET", path: "/support/tickets", signal }, z.array(Ticket)),
    /** 422 names the wrong fields; an `orderId` must be the customer's own. */
    create: (input: TicketInput) => request(adapter, { method: "POST", path: "/support/tickets", body: input }, Ticket),
    get: (id: string, signal?: AbortSignal) => request(adapter, { method: "GET", path: one(id), signal }, Ticket),
    /** Replying to a ticket that was waiting for the customer (or resolved) reopens it. */
    reply: (id: string, body: string) => request(adapter, { method: "POST", path: `${one(id)}/messages`, body: { body } }, Ticket),
  };
}

export type SupportApi = ReturnType<typeof createSupportApi>;
