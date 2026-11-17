import { describe, expect, it } from "vitest";
import { getAccessToken, setAccessToken } from "./token";

describe("access token store", () => {
  it("lives in memory only and can be cleared", () => {
    expect(getAccessToken()).toBeUndefined();
    setAccessToken("abc");
    expect(getAccessToken()).toBe("abc");
    setAccessToken(undefined);
    expect(getAccessToken()).toBeUndefined();
  });
});
