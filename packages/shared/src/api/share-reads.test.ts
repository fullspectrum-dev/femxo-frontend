import { describe, expect, it } from "vitest";
import type { ApiAdapter, ApiRequest, ApiResponse } from "./adapter";
import { shareReads } from "./share-reads";

function counting(respond: (req: ApiRequest) => ApiResponse | Promise<ApiResponse> = () => ({ status: 200, body: { ok: true } })) {
  const sent: ApiRequest[] = [];
  const adapter: ApiAdapter = {
    send: async (req) => {
      sent.push(req);
      return respond(req);
    },
  };
  return { adapter, sent };
}

describe("shareReads", () => {
  it("sends identical reads made at the same time once, and answers all of them", async () => {
    const { adapter, sent } = counting();
    const shared = shareReads(adapter);
    const [a, b] = await Promise.all([
      shared.send({ method: "GET", path: "/orders", query: { status: ["delivered"] } }),
      shared.send({ method: "GET", path: "/orders", query: { status: ["delivered"] } }),
    ]);
    expect(sent).toHaveLength(1);
    expect(a).toEqual(b);
  });

  it("shares a failure too, so every caller sees the same answer", async () => {
    const { adapter } = counting(() => ({ status: 500, body: null }));
    const shared = shareReads(adapter);
    const [a, b] = await Promise.all([shared.send({ method: "GET", path: "/x" }), shared.send({ method: "GET", path: "/x" })]);
    expect([a.status, b.status]).toEqual([500, 500]);
  });

  it("asks again once the first has answered", async () => {
    const { adapter, sent } = counting();
    const shared = shareReads(adapter);
    await shared.send({ method: "GET", path: "/orders" });
    await shared.send({ method: "GET", path: "/orders" });
    expect(sent).toHaveLength(2);
  });

  it("keeps different paths, queries and people apart", async () => {
    const { adapter, sent } = counting();
    const shared = shareReads(adapter);
    await Promise.all([
      shared.send({ method: "GET", path: "/orders" }),
      shared.send({ method: "GET", path: "/orders", query: { cursor: "c1" } }),
      shared.send({ method: "GET", path: "/cart" }),
      shared.send({ method: "GET", path: "/orders", accessToken: "a" }),
      shared.send({ method: "GET", path: "/orders", accessToken: "b" }),
    ]);
    expect(sent).toHaveLength(5);
  });

  it("never shares writes", async () => {
    const { adapter, sent } = counting();
    const shared = shareReads(adapter);
    await Promise.all([shared.send({ method: "POST", path: "/cart/lines", body: { n: 1 } }), shared.send({ method: "POST", path: "/cart/lines", body: { n: 1 } })]);
    expect(sent).toHaveLength(2);
  });

  it("leaves a read that can be cancelled alone: one caller's abort mustn't cancel another's", async () => {
    const { adapter, sent } = counting();
    const shared = shareReads(adapter);
    const controller = new AbortController();
    await Promise.all([shared.send({ method: "GET", path: "/s", signal: controller.signal }), shared.send({ method: "GET", path: "/s", signal: controller.signal })]);
    expect(sent).toHaveLength(2);
  });
});
