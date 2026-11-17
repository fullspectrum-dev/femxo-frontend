import { describe, expect, it } from "vitest";
import { createAttemptKeys, signatureOf } from "./attempt";

const input = { addressId: "a1", paymentMethod: "online" as const, cartRev: 3, expectedTotalPaise: 10000 };

describe("checkout attempt keys", () => {
  const counter = () => {
    let n = 0;
    return () => `key-${++n}`;
  };

  it("reuses one key for the same request, so a double tap or a retry can't place two orders", () => {
    const keys = createAttemptKeys(counter());
    expect(keys.keyFor(input)).toBe("key-1");
    expect(keys.keyFor({ ...input })).toBe("key-1");
  });

  it("takes a new key when the address, method, cart or total changes", () => {
    const keys = createAttemptKeys(counter());
    const first = keys.keyFor(input);
    expect(keys.keyFor({ ...input, addressId: "a2" })).not.toBe(first);
    const second = keys.keyFor({ ...input, addressId: "a2" });
    expect(keys.keyFor({ ...input, addressId: "a2", paymentMethod: "cod" })).not.toBe(second);
    expect(keys.keyFor({ ...input, cartRev: 4 })).not.toBe(second);
  });

  it("starts fresh after reset (the server has answered for good)", () => {
    const keys = createAttemptKeys(counter());
    const first = keys.keyFor(input);
    keys.reset();
    expect(keys.keyFor(input)).not.toBe(first);
  });

  it("signs a request by the fields the server compares", () => {
    expect(signatureOf(input)).toBe("a1|online|3|10000");
    expect(signatureOf({ addressId: "a1", paymentMethod: "cod", cartRev: 0 })).toBe("a1|cod|0|");
  });
});
