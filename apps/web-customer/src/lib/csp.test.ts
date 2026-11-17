import { describe, expect, it } from "vitest";
import { buildCsp } from "./csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("buildCsp with Razorpay Checkout", () => {
  const csp = buildCsp("n");

  it("lets the checkout script load from Razorpay", () => {
    expect(directive(csp, "script-src")).toContain("https://checkout.razorpay.com");
    expect(directive(csp, "script-src")).not.toContain("*");
  });

  it("lets the payment window frame from Razorpay's own origins only", () => {
    expect(directive(csp, "frame-src")).toBe("frame-src https://api.razorpay.com https://checkout.razorpay.com");
  });

  it("lets it report to Razorpay's endpoints", () => {
    const connect = directive(csp, "connect-src");
    for (const host of ["https://api.razorpay.com", "https://checkout.razorpay.com", "https://lumberjack.razorpay.com"]) expect(connect).toContain(host);
  });

  it("keeps the rest strict", () => {
    expect(csp).not.toContain("*");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
  });
});
