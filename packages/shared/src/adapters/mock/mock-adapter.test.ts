import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { request } from "../../api/request";
import { ApiError } from "../../api/errors";
import { createClock } from "../../lib/clock";
import { createMockAdapter, type MockAdapterOptions } from "./mock-adapter";
import { MockHttpError } from "./errors";
import { paginate } from "./pagination";
import { createRouter } from "./router";
import { createIdbStore, createMemoryStore } from "./store";

interface DemoState {
  counter: number;
  notes: string[];
}

const NoteBody = z.object({ text: z.string().min(1) });

function setup(overrides: Partial<MockAdapterOptions<DemoState>> = {}) {
  const router = createRouter<DemoState>()
    .get("/items/:id", ({ params, query }) => ({ status: 200, body: { id: params.id, tags: query.tag ?? [] } }))
    .post("/counter", ({ state }) => {
      state.counter += 1;
      return { status: 201, body: { counter: state.counter } };
    })
    .post("/notes", ({ state, body }) => {
      const { text } = NoteBody.parse(body);
      state.notes.push(text);
      return { status: 201, body: { notes: state.notes } };
    })
    .post("/explode-midway", ({ state }) => {
      state.counter = 999;
      throw new MockHttpError(409, "OUT_OF_STOCK", "Only 2 left", { available: 2 });
    })
    .get("/numbers", ({ query }) => ({ status: 200, body: paginate(Array.from({ length: 25 }, (_, i) => i + 1), query) }));

  const store = createMemoryStore<DemoState>(() => ({ counter: 0, notes: [] }));
  const clock = createClock(() => 1_700_000_000_000);
  const sleeps: number[] = [];
  const adapter = createMockAdapter<DemoState>({
    router,
    store,
    clock,
    latency: { min: 300, max: 600 },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    seed: 1,
    ...overrides,
  });
  return { adapter, store, clock, sleeps };
}

const Echo = z.object({ id: z.string(), tags: z.array(z.string()) });
const Counter = z.object({ counter: z.number() });

describe("MockAdapter routing", () => {
  it("serves REST paths with params and repeated query values", async () => {
    const { adapter } = setup();
    await expect(request(adapter, { method: "GET", path: "/items/p1", query: { tag: ["a", "b"] } }, Echo)).resolves.toEqual({ id: "p1", tags: ["a", "b"] });
  });

  it("answers unknown paths with the 404 envelope", async () => {
    const { adapter } = setup();
    await expect(request(adapter, { method: "GET", path: "/nope" }, Echo)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("waits 300–600 ms per request, like a real network", async () => {
    const { adapter, sleeps } = setup();
    for (let i = 0; i < 20; i++) await adapter.send({ method: "GET", path: "/items/p1" });
    expect(sleeps).toHaveLength(20);
    expect(Math.min(...sleeps)).toBeGreaterThanOrEqual(300);
    expect(Math.max(...sleeps)).toBeLessThanOrEqual(600);
  });
});

describe("MockAdapter idempotency", () => {
  it("refuses a write without an Idempotency-Key", async () => {
    const { adapter } = setup();
    const response = await adapter.send({ method: "POST", path: "/counter", body: {} });
    expect(response).toMatchObject({ status: 400, body: { error: { code: "IDEMPOTENCY_KEY_REQUIRED" } } });
  });

  it("replays the stored response for a repeated key and body, without acting twice", async () => {
    const { adapter, store } = setup();
    const first = await request(adapter, { method: "POST", path: "/counter", body: {}, idempotencyKey: "k1" }, Counter);
    const again = await request(adapter, { method: "POST", path: "/counter", body: {}, idempotencyKey: "k1" }, Counter);
    expect(again).toEqual(first);
    expect((await store.load()).counter).toBe(1);
  });

  it("rejects the same key with a different body", async () => {
    const { adapter } = setup();
    await request(adapter, { method: "POST", path: "/notes", body: { text: "one" }, idempotencyKey: "k2" }, z.unknown());
    await expect(
      request(adapter, { method: "POST", path: "/notes", body: { text: "two" }, idempotencyKey: "k2" }, z.unknown())
    ).rejects.toMatchObject({ status: 422, code: "IDEMPOTENCY_MISMATCH" });
  });

  it("forgets keys after 24 hours", async () => {
    const { adapter, clock, store } = setup();
    await request(adapter, { method: "POST", path: "/counter", body: {}, idempotencyKey: "k3" }, Counter);
    clock.advance(24 * 3600 * 1000 + 1);
    await request(adapter, { method: "POST", path: "/counter", body: {}, idempotencyKey: "k3" }, Counter);
    expect((await store.load()).counter).toBe(2);
  });
});

describe("MockAdapter errors and safety", () => {
  it("turns a request-body validation failure into 422 with field details", async () => {
    const { adapter } = setup();
    const error = (await request(adapter, { method: "POST", path: "/notes", body: { text: "" } }, z.unknown()).catch((e: unknown) => e)) as ApiError;
    expect(error).toMatchObject({ status: 422, code: "VALIDATION_FAILED" });
    expect(error.details).toHaveProperty("fields.text");
  });

  it("sends handler errors as the envelope and rolls back half-done changes", async () => {
    const { adapter, store } = setup();
    await expect(request(adapter, { method: "POST", path: "/explode-midway", body: {} }, z.unknown())).rejects.toMatchObject({
      status: 409,
      code: "OUT_OF_STOCK",
      details: { available: 2 },
    });
    expect((await store.load()).counter).toBe(0);
  });

  it("returns copies, so the UI can't change mock data by accident", async () => {
    const { adapter, store } = setup();
    const response = await adapter.send({ method: "POST", path: "/notes", body: { text: "a" }, idempotencyKey: "k4" });
    (response.body as { notes: string[] }).notes.push("tampered");
    expect((await store.load()).notes).toEqual(["a"]);
  });
});

describe("MockAdapter chaos and forced outcomes", () => {
  it("never fails randomly unless chaos is on, and then only on reads", async () => {
    const calm = setup();
    for (let i = 0; i < 50; i++) expect((await calm.adapter.send({ method: "GET", path: "/items/p1" })).status).toBe(200);

    const chaotic = setup({ chaos: () => ({ enabled: true, failureRate: 1 }) });
    expect((await chaotic.adapter.send({ method: "GET", path: "/items/p1" })).status).toBe(500);
    expect((await chaotic.adapter.send({ method: "POST", path: "/counter", body: {}, idempotencyKey: "k5" })).status).toBe(201);
  });

  it("can force the next request to fail or go offline, once", async () => {
    const { adapter } = setup();
    adapter.controls.forceNext("server-error");
    expect((await adapter.send({ method: "GET", path: "/items/p1" })).status).toBe(500);
    expect((await adapter.send({ method: "GET", path: "/items/p1" })).status).toBe(200);
    adapter.controls.forceNext("offline");
    await expect(adapter.send({ method: "GET", path: "/items/p1" })).rejects.toMatchObject({ status: 0 });
  });

  it("gives a forced failure to the next request sent, not to one already waiting out its delay", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let sleeping = 0;
    const { adapter } = setup({
      sleep: async () => {
        // Only the first request is held back; later ones go straight through.
        if (sleeping++ === 0) await gate;
      },
    });
    const earlier = adapter.send({ method: "GET", path: "/items/p1" });
    await new Promise((resolve) => setTimeout(resolve, 0)); // it is now in flight
    adapter.controls.forceNext("server-error");
    const next = adapter.send({ method: "GET", path: "/items/p1" });
    release();
    expect((await earlier).status).toBe(200);
    expect((await next).status).toBe(500);
  });
});

describe("cursor pagination", () => {
  const Numbers = z.object({ items: z.array(z.number()), nextCursor: z.string().nullable() });

  it("walks every item once and stops", async () => {
    const { adapter } = setup();
    const seen: number[] = [];
    let cursor: string | null = null;
    do {
      const result: z.infer<typeof Numbers> = await request(adapter, { method: "GET", path: "/numbers", query: { limit: 10, cursor } }, Numbers);
      seen.push(...result.items);
      cursor = result.nextCursor;
    } while (cursor);
    expect(seen).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("refuses pages over 100 and cursors it didn't issue", async () => {
    const { adapter } = setup();
    await expect(request(adapter, { method: "GET", path: "/numbers", query: { limit: 101 } }, Numbers)).rejects.toMatchObject({ status: 422 });
    await expect(request(adapter, { method: "GET", path: "/numbers", query: { cursor: "not-a-cursor" } }, Numbers)).rejects.toMatchObject({ status: 422 });
  });
});

describe("IndexedDB store", () => {
  it("keeps state across reloads and reseeds when the schema version changes", async () => {
    const seed = () => ({ counter: 0, notes: [] as string[] });
    const v1 = createIdbStore<DemoState>({ dbName: "femxo-demo-test", version: 1, seed });
    const state = await v1.load();
    state.counter = 7;
    await v1.save(state);

    const reopened = createIdbStore<DemoState>({ dbName: "femxo-demo-test", version: 1, seed });
    expect((await reopened.load()).counter).toBe(7);

    const upgraded = createIdbStore<DemoState>({ dbName: "femxo-demo-test", version: 2, seed });
    expect((await upgraded.load()).counter).toBe(0);

    await upgraded.reset();
    expect((await upgraded.load()).counter).toBe(0);
  });
});
