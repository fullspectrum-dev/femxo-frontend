import { describe, expect, it, vi } from "vitest";
import { createClock } from "../lib/clock";
import { createDemoControls } from "./controls";

function setup() {
  const clock = createClock(() => 1_700_000_000_000);
  const target = {
    forceNext: vi.fn(),
    clock,
    reload: vi.fn(),
    resetStores: vi.fn(async () => undefined),
    shortStockInCarts: vi.fn(async () => undefined),
  };
  return { controls: createDemoControls(() => target), target, clock };
}

describe("demo controls", () => {
  it("keeps random failures off until switched on, then fails reads often enough to see", () => {
    const { controls } = setup();
    expect(controls.chaos().enabled).toBe(false);
    controls.setChaos(true);
    expect(controls.chaos()).toMatchObject({ enabled: true });
    expect(controls.chaos().failureRate).toBeGreaterThan(0);
    expect(controls.chaos().failureRate).toBeLessThan(0.5);
  });

  it("forces the next request to fail or go offline", () => {
    const { controls, target } = setup();
    controls.forceNext("server-error");
    controls.forceNext("offline");
    expect(target.forceNext.mock.calls).toEqual([["server-error"], ["offline"]]);
  });

  it("holds the chosen payment outcome for the next payment only", () => {
    const { controls } = setup();
    expect(controls.takeNextPayment()).toBeNull();
    controls.setNextPayment("failure");
    expect(controls.snapshot().nextPayment).toBe("failure");
    expect(controls.takeNextPayment()).toBe("failure");
    expect(controls.takeNextPayment()).toBeNull();
  });

  it("fast-forwards the clock and can put it back", () => {
    const { controls, clock } = setup();
    controls.advanceClock(7 * 24 * 3600 * 1000);
    expect(clock.now()).toBe(1_700_000_000_000 + 604_800_000);
    expect(controls.snapshot().clockOffsetMs).toBe(604_800_000);
    controls.resetClock();
    expect(controls.snapshot().clockOffsetMs).toBe(0);
  });

  it("resets the demo data and reloads state from the fresh seed", async () => {
    const { controls, target } = setup();
    await controls.reset();
    expect(target.resetStores).toHaveBeenCalledOnce();
    expect(target.reload).toHaveBeenCalledOnce();
  });

  it("tells subscribers about every change, with a new snapshot object each time", () => {
    const { controls } = setup();
    const listener = vi.fn();
    const stop = controls.subscribe(listener);
    const before = controls.snapshot();
    expect(controls.snapshot()).toBe(before);
    controls.setChaos(true);
    controls.setNextPayment("pending");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(controls.snapshot()).not.toBe(before);
    stop();
    controls.setChaos(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
