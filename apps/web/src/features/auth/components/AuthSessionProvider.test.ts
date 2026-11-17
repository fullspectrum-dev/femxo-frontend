import { describe, expect, it } from "vitest";
import { safeNextPath } from "./AuthSessionProvider";

describe("safeNextPath", () => {
  it("keeps local paths, with a query", () => {
    expect(safeNextPath("/admin/orders")).toBe("/admin/orders");
    expect(safeNextPath("/panel/dealer/dashboard?x=1")).toBe("/panel/dealer/dashboard?x=1");
  });

  it.each(["//evil.com", String.raw`/\evil.com`, "/%09/evil.com", "/%5Cevil.com", "/\t/evil.com", "/%0a/evil.com", "https://evil.com", "evil.com", "/%2F/evil.com", "/%E0%A4%A"])(
    "refuses %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/account");
    }
  );

  it("falls back for empty values and uses the given fallback", () => {
    expect(safeNextPath(null)).toBe("/account");
    expect(safeNextPath("", "/x")).toBe("/x");
  });
});
