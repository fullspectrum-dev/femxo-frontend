import { describe, expect, it } from "vitest";
import type { Location, Serviceability } from "@femxo/shared/contracts";
import { locationOptions, pincodeVerdict, whereOf } from "./location-options";

const bihta: Location = { id: "village:1", type: "village", name: "Bihta", pincode: "801103", breadcrumb: [{ id: "state:10", name: "Bihar" }, { id: "district:230", name: "Patna" }] };
const sikaria: Location = { id: "village:2", type: "village", name: "Sikaria", breadcrumb: [{ id: "state:10", name: "Bihar" }] };
const service = (over: Partial<Serviceability> = {}): Serviceability => ({
  pincode: "801103",
  known: true,
  serviceable: true,
  locations: [
    { id: "village:1", type: "village", name: "Bihta", serviceable: true, coverage: "district" },
    { id: "village:2", type: "village", name: "Sikaria", serviceable: false, coverage: null },
  ],
  ...over,
});

describe("whereOf", () => {
  it("reads the breadcrumb nearest first", () => expect(whereOf(bihta)).toBe("Patna, Bihar"));
  it("is empty without one", () => expect(whereOf({})).toBe(""));
});

describe("locationOptions", () => {
  it("joins serviceability and lists served places first", () => {
    const options = locationOptions([sikaria, bihta], service());
    expect(options.map((o) => [o.id, o.serviceable])).toEqual([
      ["village:1", true],
      ["village:2", false],
    ]);
  });
  it("leaves serviceability unknown when no check ran", () => {
    expect(locationOptions([bihta], null)[0]!.serviceable).toBeNull();
  });
  it("treats a place the answer doesn't mention as not served", () => {
    expect(locationOptions([bihta], service({ locations: [] }))[0]!.serviceable).toBe(false);
  });
});

describe("pincodeVerdict", () => {
  it("says we deliver, don't deliver, or don't know the pincode", () => {
    expect(pincodeVerdict(service())).toMatchObject({ tone: "ok" });
    expect(pincodeVerdict(service({ serviceable: false }))).toMatchObject({ tone: "no", text: expect.stringMatching(/don't deliver/) });
    expect(pincodeVerdict(service({ known: false, serviceable: false, locations: [] }))).toMatchObject({ tone: "unknown", text: expect.stringMatching(/don't recognise/) });
  });
});
