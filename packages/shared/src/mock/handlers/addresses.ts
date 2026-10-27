import { MockHttpError } from "../../adapters/mock/errors";
import type { MockContext, MockResult, MockRouter } from "../../adapters/mock/router";
import { Address, AddressInput } from "../../contracts/commerce";
import { newId } from "../../lib/ids";
import type { MockState } from "../domain/types";
import { authenticate } from "./auth";

export const MAX_ADDRESSES = 10;

/** The address book. Deliveries are only to pincodes we serve, so others can't be saved. */
export function registerAddressRoutes(router: MockRouter<MockState>) {
  const book = (ctx: MockContext<MockState>, customerId: string) => (ctx.state.addresses[customerId] ??= []);

  function parse(ctx: MockContext<MockState>) {
    const input = AddressInput.parse(ctx.body);
    if (!ctx.state.pincodes[input.pincode]?.serviceable) {
      throw new MockHttpError(422, "NOT_SERVICEABLE", `Sorry, we don't deliver to ${input.pincode} yet.`, { pincode: input.pincode });
    }
    return input;
  }

  /** Exactly one default: the one asked for, else the first. */
  function settle(addresses: Address[], defaultId: string | null) {
    const chosen = defaultId ?? addresses.find((entry) => entry.isDefault)?.id ?? addresses[0]?.id;
    return addresses.map((entry) => ({ ...entry, isDefault: entry.id === chosen }));
  }

  router.get("/addresses", (ctx): MockResult => ({ status: 200, body: book(ctx, authenticate(ctx).customer.id) }));

  router.post("/addresses", (ctx): MockResult => {
    const { customer } = authenticate(ctx);
    const input = parse(ctx);
    const current = book(ctx, customer.id);
    if (current.length >= MAX_ADDRESSES) {
      throw new MockHttpError(422, "VALIDATION_FAILED", `You can save up to ${MAX_ADDRESSES} addresses. Remove one to add another.`);
    }
    const created: Address = { ...input, id: newId("adr"), isDefault: input.isDefault };
    ctx.state.addresses[customer.id] = settle([...current, created], input.isDefault ? created.id : null);
    return { status: 200, body: ctx.state.addresses[customer.id] };
  });

  router.patch("/addresses/:id", (ctx): MockResult => {
    const { customer } = authenticate(ctx);
    const current = book(ctx, customer.id);
    if (!current.some((entry) => entry.id === ctx.params.id)) throw new MockHttpError(404, "NOT_FOUND", "We couldn't find that address.");
    const input = parse(ctx);
    const edited = current.map((entry) => (entry.id === ctx.params.id ? { ...input, id: entry.id, isDefault: entry.isDefault } : entry));
    ctx.state.addresses[customer.id] = settle(edited, input.isDefault ? ctx.params.id! : null);
    return { status: 200, body: ctx.state.addresses[customer.id] };
  });

  router.delete("/addresses/:id", (ctx): MockResult => {
    const { customer } = authenticate(ctx);
    const current = book(ctx, customer.id);
    if (!current.some((entry) => entry.id === ctx.params.id)) throw new MockHttpError(404, "NOT_FOUND", "We couldn't find that address.");
    ctx.state.addresses[customer.id] = settle(
      current.filter((entry) => entry.id !== ctx.params.id),
      null
    );
    return { status: 200, body: ctx.state.addresses[customer.id] };
  });
}
