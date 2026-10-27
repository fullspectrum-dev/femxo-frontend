import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockBackend } from "./backend";

const KEY = "femxo-demo-clock-offset";
const DAY = 86_400_000;

/** A tiny stand-in for the browser's localStorage. */
function stubStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  });
  return data;
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("the demo clock in the browser", () => {
  it("keeps its fast-forward over a reload, so orders don't slip back in time", () => {
    const data = stubStorage();
    const first = createMockBackend({ storage: "idb", latency: false });
    first.controls.advanceClock(3 * DAY);
    expect(data.get(KEY)).toBe(String(3 * DAY));
    const reloaded = createMockBackend({ storage: "idb", latency: false });
    expect(reloaded.clock.offset()).toBe(3 * DAY);
  });

  it("forgets it when put back to now", () => {
    const data = stubStorage();
    const backend = createMockBackend({ storage: "idb", latency: false });
    backend.controls.advanceClock(DAY);
    backend.controls.resetClock();
    expect(data.get(KEY)).toBe("0");
    expect(createMockBackend({ storage: "idb", latency: false }).clock.offset()).toBe(0);
  });

  it("ignores a damaged value, and works without storage (server, tests)", () => {
    stubStorage().set(KEY, "soon");
    expect(createMockBackend({ storage: "idb", latency: false }).clock.offset()).toBe(0);
    vi.unstubAllGlobals();
    expect(() => createMockBackend({ storage: "memory", latency: false }).controls.advanceClock(DAY)).not.toThrow();
  });
});
