import { afterEach, describe, expect, it, vi } from "vitest";
import { RAZORPAY_SRC } from "./razorpay";

/** A tiny document: createElement gives a script we can "load" or "fail" by hand. */
function fakeDocument() {
  const scripts: { src: string; async: boolean; onload?: () => void; onerror?: () => void; remove: () => void }[] = [];
  const doc = {
    createElement: () => {
      const s = { src: "", async: false, onload: undefined as undefined | (() => void), onerror: undefined as undefined | (() => void), remove: vi.fn() };
      scripts.push(s);
      return s;
    },
    head: { appendChild: vi.fn() },
  };
  return { doc: doc as unknown as Document, scripts };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("loadRazorpay", () => {
  it("only ever loads Razorpay's own checkout script, once, and resolves with the constructor", async () => {
    const { loadRazorpay } = await import("./razorpay");
    const Ctor = class {};
    const g: { Razorpay?: unknown } = {};
    vi.stubGlobal("window", g);
    const { doc, scripts } = fakeDocument();
    const first = loadRazorpay(doc);
    const second = loadRazorpay(doc);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.src).toBe(RAZORPAY_SRC);
    expect(RAZORPAY_SRC).toBe("https://checkout.razorpay.com/v1/checkout.js");
    g.Razorpay = Ctor;
    scripts[0]!.onload?.();
    await expect(first).resolves.toBe(Ctor);
    await expect(second).resolves.toBe(Ctor);
  });

  it("resolves at once when the script is already there", async () => {
    const { loadRazorpay } = await import("./razorpay");
    const Ctor = class {};
    vi.stubGlobal("window", { Razorpay: Ctor });
    const { doc, scripts } = fakeDocument();
    await expect(loadRazorpay(doc)).resolves.toBe(Ctor);
    expect(scripts).toHaveLength(0);
  });

  it("rejects when the script can't load, and tries again next time", async () => {
    const { loadRazorpay } = await import("./razorpay");
    const g: { Razorpay?: unknown } = {};
    vi.stubGlobal("window", g);
    const { doc, scripts } = fakeDocument();
    const failing = loadRazorpay(doc);
    scripts[0]!.onerror?.();
    await expect(failing).rejects.toThrow(/could not be loaded/);
    const retry = loadRazorpay(doc);
    expect(scripts).toHaveLength(2);
    g.Razorpay = class {};
    scripts[1]!.onload?.();
    await expect(retry).resolves.toBeTypeOf("function");
  });
});
