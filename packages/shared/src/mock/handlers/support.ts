import { z } from "zod";
import { MockHttpError } from "../../adapters/mock/errors";
import type { MockContext, MockResult, MockRouter } from "../../adapters/mock/router";
import { TicketInput } from "../../contracts/people";
import type { Ticket } from "../../contracts/people";
import { newId } from "../../lib/ids";
import type { MockState } from "../domain/types";
import { authenticate } from "./auth";

/** Support answers a minute after the customer writes (on the demo clock). */
export const SUPPORT_REPLY_AFTER_MS = 60_000;

const Reply = z.object({ body: z.string().trim().min(2, "Write a message").max(2000) });

/** The support desk: tickets with a simulated agent who replies once per customer message. */
export function registerSupportRoutes(router: MockRouter<MockState>) {
  const book = (ctx: MockContext<MockState>, customerId: string) => (ctx.state.tickets[customerId] ??= []);

  /** Support's reply to a message that has waited long enough, dated when it was due. */
  function answer(ctx: MockContext<MockState>, ticket: Ticket) {
    const last = ticket.messages.at(-1)!;
    const due = Date.parse(last.at) + SUPPORT_REPLY_AFTER_MS;
    if (last.from !== "customer" || due > ctx.clock.now() || ticket.status === "resolved") return;
    const at = new Date(due).toISOString();
    ticket.messages.push({
      id: newId("msg"),
      from: "support",
      body: "Thanks for getting in touch. We're looking into this and will update you here shortly. If there's anything else that would help us, reply to this message.",
      at,
    });
    ticket.status = "awaiting_customer";
    ticket.updatedAt = at;
  }

  function mine(ctx: MockContext<MockState>) {
    const { customer } = authenticate(ctx);
    const tickets = book(ctx, customer.id);
    for (const ticket of tickets) answer(ctx, ticket);
    return { customer, tickets };
  }

  function find(ctx: MockContext<MockState>) {
    const { customer, tickets } = mine(ctx);
    const ticket = tickets.find((entry) => entry.id === ctx.params.id);
    if (!ticket) throw new MockHttpError(404, "NOT_FOUND", "We couldn't find that request.");
    return { customer, ticket };
  }

  router.get("/support/tickets", (ctx): MockResult => ({
    status: 200,
    body: [...mine(ctx).tickets].reverse().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)),
  }));

  router.get("/support/tickets/:id", (ctx): MockResult => ({ status: 200, body: find(ctx).ticket }));

  router.post("/support/tickets", (ctx): MockResult => {
    const { customer, tickets } = mine(ctx);
    const input = TicketInput.parse(ctx.body);
    if (input.orderId && ctx.state.orders[input.orderId]?.customerId !== customer.id) {
      throw new MockHttpError(422, "VALIDATION_FAILED", "Choose one of your own orders.", { fields: { orderId: "Choose one of your own orders" } });
    }
    const at = ctx.clock.date().toISOString();
    const ticket: Ticket = {
      id: newId("tkt"),
      subject: input.subject,
      category: input.category,
      status: "open",
      orderId: input.orderId,
      messages: [{ id: newId("msg"), from: "customer", body: input.message, at }],
      updatedAt: at,
    };
    tickets.push(ticket);
    return { status: 200, body: ticket };
  });

  router.post("/support/tickets/:id/messages", (ctx): MockResult => {
    const { ticket } = find(ctx);
    const { body } = Reply.parse(ctx.body);
    const at = ctx.clock.date().toISOString();
    ticket.messages.push({ id: newId("msg"), from: "customer", body, at });
    ticket.status = "open";
    ticket.updatedAt = at;
    return { status: 200, body: ticket };
  });
}
