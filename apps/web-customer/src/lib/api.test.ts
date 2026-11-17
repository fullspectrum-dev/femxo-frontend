import { describe, expect, it } from "vitest";
import { toQueryParams } from "@femxo/shared/api";

describe("catalog query params", () => {
  it("leaves out empty values and repeats brand", () => {
    expect(toQueryParams({ q: "", brand: ["a", "b"], sort: "price_asc" })).toMatchObject({ q: undefined, brand: ["a", "b"], sort: "price_asc" });
    expect(toQueryParams({ brand: [] }).brand).toBeUndefined();
  });
});
