import { describe, expect, it } from "vitest";
import { outcomeMessage } from "./outcome-copy";

describe("outcomeMessage", () => {
  it("has calm words for every way a payment can end", () => {
    expect(outcomeMessage({ kind: "dismissed" })).toMatch(/closed the payment window/);
    expect(outcomeMessage({ kind: "failed", message: "Card declined" })).toBe("Card declined");
    expect(outcomeMessage({ kind: "unconfirmed" })).toMatch(/don't need to pay again/);
    expect(outcomeMessage({ kind: "rejected" })).toMatch(/couldn't confirm/);
    expect(outcomeMessage({ kind: "load-error" })).toMatch(/couldn't open the payment window/);
    expect(outcomeMessage({ kind: "error", message: "Nope" })).toBe("Nope");
    expect(outcomeMessage({ kind: "paid", payment: null })).toMatch(/received/);
  });
});
