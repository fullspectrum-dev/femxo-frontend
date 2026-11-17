import { describe, expect, it, vi } from "vitest";
import { createRefreshGate } from "./refresh-gate";

describe("createRefreshGate", () => {
  it("shares one refresh between callers made together (the refresh token rotates)", async () => {
    let n = 0;
    const refresh = vi.fn(async () => ++n);
    const gate = createRefreshGate(refresh);
    const [a, b] = await Promise.all([gate(), gate()]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect([a, b]).toEqual([1, 1]);
  });
  it("runs again once the first has finished, even after a failure", async () => {
    const refresh = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(2);
    const gate = createRefreshGate(refresh);
    await expect(gate()).rejects.toThrow("down");
    await expect(gate()).resolves.toBe(2);
  });
});
