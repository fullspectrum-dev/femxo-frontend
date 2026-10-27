import { createIdbStore, createMemoryStore } from "../adapters/mock/store";
import { createMockAdapter, type IdempotencyRecord } from "../adapters/mock/mock-adapter";
import { createClock } from "../lib/clock";
import { createDemoControls } from "./controls";
import type { MockState } from "./domain/types";
import { buildMockRouter } from "./routes";
import { buildCatalog } from "./seed/catalog";
import { buildInitialState } from "./seed/state";

export interface MockBackendOptions {
  /** "idb" persists in the browser; "memory" for the server and tests. */
  storage: "idb" | "memory";
  /** Simulated network delay; false in tests. */
  latency?: { min: number; max: number } | false;
  /** Real time source, so tests can pin the clock. */
  realNow?: () => number;
}

const CLOCK_KEY = "femxo-demo-clock-offset";

/** The demo clock, in a browser keeping its fast-forward across reloads (an order that has "shipped" stays shipped). */
function createPersistentClock(realNow?: () => number) {
  let saved = 0;
  try {
    const stored = Number(localStorage.getItem(CLOCK_KEY));
    saved = Number.isFinite(stored) ? stored : 0;
  } catch {
    // No storage (server, private mode): the clock simply starts at now.
  }
  const clock = createClock(realNow, saved);
  const remember = () => {
    try {
      localStorage.setItem(CLOCK_KEY, String(clock.offset()));
    } catch {
      // Not remembered; harmless.
    }
  };
  const { advance, reset } = clock;
  clock.advance = (ms) => {
    advance(ms);
    remember();
  };
  clock.reset = () => {
    reset();
    remember();
  };
  return clock;
}

/**
 * The whole mock backend: seeded state, the REST-shaped adapter and the demo
 * controls that act on it. The browser builds one; tests build their own.
 */
export function createMockBackend({ storage, latency = { min: 300, max: 600 }, realNow }: MockBackendOptions) {
  const clock = storage === "idb" ? createPersistentClock(realNow) : createClock(realNow);
  const catalog = buildCatalog();
  const seed = () => buildInitialState(catalog, new Date(clock.now()));
  const noKeys = (): Record<string, IdempotencyRecord> => ({});
  const store = storage === "idb" ? createIdbStore<MockState>({ dbName: "femxo-demo", version: 1, seed }) : createMemoryStore(seed);
  const idempotency = storage === "idb" ? createIdbStore({ dbName: "femxo-demo-keys", version: 1, seed: noKeys }) : createMemoryStore(noKeys);

  const holder: { adapter?: ReturnType<typeof createMockAdapter<MockState>> } = {};
  const controls = createDemoControls(() => ({
    forceNext: (outcome) => holder.adapter!.controls.forceNext(outcome),
    clock,
    reload: () => holder.adapter!.controls.reload(),
    resetStores: async () => {
      await store.reset();
      await idempotency.reset();
    },
    shortStockInCarts: async () => {
      const state = await store.load();
      for (const cart of Object.values(state.carts)) {
        for (const line of cart.lines) state.stock[line.variantId] = Math.max(0, line.quantity - 1);
      }
      await store.save(state);
      holder.adapter!.controls.reload();
    },
  }));
  const adapter = createMockAdapter<MockState>({ router: buildMockRouter(catalog, controls), store, idempotencyStore: idempotency, clock, latency, chaos: controls.chaos });
  holder.adapter = adapter;

  return { adapter, controls, catalog, store, clock };
}

export type MockBackend = ReturnType<typeof createMockBackend>;
