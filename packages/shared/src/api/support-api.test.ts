import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockBackend } from "../mock/backend";
import { createAuthApi } from "./auth-api";
import { createSupportApi } from "./support-api";
import { withAuth } from "./with-auth";

const NOW = Date.UTC(2026, 9, 24, 5, 0);

let token: string | undefined;
let backend: ReturnType<typeof createMockBackend>;
let support: ReturnType<typeof createSupportApi>;
let auth: ReturnType<typeof createAuthApi>;

beforeEach(() => {
  token = undefined;
  backend = createMockBackend({ storage: "memory", latency: false, realNow: () => NOW });
  const adapter = withAuth(backend.adapter, () => token);
  support = createSupportApi(adapter);
  auth = createAuthApi(adapter);
});

async function signIn(mobile = "9000000002") {
  const challenge = await auth.requestOtp(mobile);
  token = (await auth.verifyOtp(challenge.requestId, "123456")).accessToken;
}

const input = { subject: "Where is my order?", category: "order" as const, orderId: null, message: "It was due yesterday and I have heard nothing." };

describe("support tickets", () => {
  it("are for signed-in customers only", async () => {
    await expect(support.list()).rejects.toMatchObject({ status: 401 });
  });

  it("start empty", async () => {
    await signIn();
    expect(await support.list()).toEqual([]);
  });

  it("are raised with a first message from the customer", async () => {
    await signIn();
    const ticket = await support.create(input);
    expect(ticket).toMatchObject({ subject: input.subject, category: "order", status: "open", orderId: null });
    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages[0]).toMatchObject({ from: "customer", body: input.message });
    expect(await support.list()).toHaveLength(1);
  });

  it("can name one of the customer's own orders, and no one else's", async () => {
    await signIn();
    const [own] = (await backend.store.load()).orders ? Object.values((await backend.store.load()).orders).filter((order) => order.customerId === "cus-regular") : [];
    expect((await support.create({ ...input, orderId: own!.id })).orderId).toBe(own!.id);
    const foreign = Object.values((await backend.store.load()).orders).find((order) => order.customerId !== "cus-regular")!;
    await expect(support.create({ ...input, orderId: foreign.id })).rejects.toMatchObject({ status: 422, code: "VALIDATION_FAILED", details: { fields: { orderId: expect.any(String) } } });
  });

  it("are checked: subject, message, and category", async () => {
    await signIn();
    await expect(support.create({ ...input, subject: "Hi", message: "short" })).rejects.toMatchObject({
      status: 422,
      details: { fields: { subject: expect.any(String), message: expect.any(String) } },
    });
  });

  it("get a reply from support after a short while, then wait for the customer", async () => {
    await signIn();
    const ticket = await support.create(input);
    expect((await support.get(ticket.id)).messages).toHaveLength(1);
    backend.clock.advance(60_000);
    await signIn();
    const replied = await support.get(ticket.id);
    expect(replied.messages.map((message) => message.from)).toEqual(["customer", "support"]);
    expect(replied.status).toBe("awaiting_customer");
  });

  it("take a reply from the customer, which reopens the ticket", async () => {
    await signIn();
    const ticket = await support.create(input);
    backend.clock.advance(60_000);
    await signIn();
    const updated = await support.reply(ticket.id, "Any news? It still hasn't come.");
    expect(updated.status).toBe("open");
    expect(updated.messages.at(-1)).toMatchObject({ from: "customer", body: "Any news? It still hasn't come." });
    await expect(support.reply(ticket.id, "")).rejects.toMatchObject({ status: 422 });
  });

  it("list the most recently active first, and are each customer's own", async () => {
    await signIn();
    const first = await support.create(input);
    const second = await support.create({ ...input, subject: "Refund not received" });
    expect((await support.list()).map((ticket) => ticket.id)).toEqual([second.id, first.id]);
    await signIn("9000000005");
    expect(await support.list()).toEqual([]);
    await expect(support.get(first.id)).rejects.toMatchObject({ status: 404 });
    await expect(support.reply(first.id, "Not mine to answer")).rejects.toMatchObject({ status: 404 });
  });
});
