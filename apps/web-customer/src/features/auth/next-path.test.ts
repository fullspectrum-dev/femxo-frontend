import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath (open-redirect guard)", () => {
  it("keeps a path on this site, with its query", () => {
    expect(safeNextPath("/orders")).toBe("/orders");
    expect(safeNextPath("/p/rice?variant=v1")).toBe("/p/rice?variant=v1");
  });
  it("falls back for anything that could leave the site", () => {
    for (const bad of ["//evil.com", "/\\evil.com","https://evil.com", "javascript:alert(1)", "evil.com", "/\t/evil.com", "/\n/evil.com", "", null, undefined]) {
      expect(safeNextPath(bad as string | null | undefined)).toBe("/");
    }
  });
  it("uses the given fallback", () => {
    expect(safeNextPath("//x", "/account")).toBe("/account");
  });
});
