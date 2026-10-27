import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockBackend } from "../mock/backend";
import { createAddressApi } from "./address-api";
import { createAuthApi } from "./auth-api";
import { withAuth } from "./with-auth";

let token: string | undefined;
let backend: ReturnType<typeof createMockBackend>;
let addresses: ReturnType<typeof createAddressApi>;
let auth: ReturnType<typeof createAuthApi>;

beforeEach(() => {
  token = undefined;
  backend = createMockBackend({ storage: "memory", latency: false, realNow: () => Date.UTC(2026, 9, 24, 5, 0) });
  const adapter = withAuth(backend.adapter, () => token);
  addresses = createAddressApi(adapter);
  auth = createAuthApi(adapter);
});

async function signIn(mobile: string) {
  const challenge = await auth.requestOtp(mobile);
  token = (await auth.verifyOtp(challenge.requestId, "123456")).accessToken;
}

/** A pincode we deliver to, and one we don't (both from the seed). */
const SERVED = "800001";
const UNSERVED = "855107";

const home = (overrides: Record<string, unknown> = {}) => ({
  name: "Asha Devi",
  mobile: "9111111111",
  line1: "12 Boring Road",
  city: "Patna",
  district: "Patna",
  state: "Bihar" as const,
  pincode: SERVED,
  ...overrides,
});

describe("the address book", () => {
  it("is for signed-in customers only", async () => {
    await expect(addresses.list()).rejects.toMatchObject({ status: 401 });
  });

  it("shows a customer their saved address", async () => {
    await signIn("9000000002");
    const book = await addresses.list();
    expect(book).toHaveLength(1);
    expect(book[0]!.isDefault).toBe(true);
  });

  it("makes the first address a new customer adds their default", async () => {
    await signIn("9111111111");
    const book = await addresses.create(home());
    expect(book).toHaveLength(1);
    expect(book[0]).toMatchObject({ pincode: SERVED, isDefault: true });
  });

  it("makes a new default demote the old one, so there is always exactly one", async () => {
    await signIn("9000000002");
    const book = await addresses.create(home({ isDefault: true }));
    expect(book.filter((entry) => entry.isDefault)).toHaveLength(1);
    expect(book.find((entry) => entry.isDefault)!.line1).toBe("12 Boring Road");
  });

  it("checks every field, and says which one is wrong", async () => {
    await signIn("9000000002");
    await expect(addresses.create(home({ mobile: "12345", pincode: "80" }))).rejects.toMatchObject({
      status: 422,
      code: "VALIDATION_FAILED",
      details: { fields: { mobile: expect.any(String), pincode: expect.any(String) } },
    });
  });

  it("refuses a pincode we don't deliver to", async () => {
    await signIn("9000000002");
    await expect(addresses.create(home({ pincode: UNSERVED }))).rejects.toMatchObject({ status: 422, code: "NOT_SERVICEABLE" });
    await expect(addresses.create(home({ pincode: "999999" }))).rejects.toMatchObject({ code: "NOT_SERVICEABLE" });
  });

  it("edits an address, and can make another one the default", async () => {
    await signIn("9000000002");
    const [first] = await addresses.list();
    const added = await addresses.create(home());
    const second = added.find((entry) => entry.id !== first!.id)!;
    const edited = await addresses.update(second.id, home({ line1: "7 Fraser Road", isDefault: true }));
    expect(edited.find((entry) => entry.id === second.id)).toMatchObject({ line1: "7 Fraser Road", isDefault: true });
    expect(edited.find((entry) => entry.id === first!.id)!.isDefault).toBe(false);
    await expect(addresses.update("adr-nope", home())).rejects.toMatchObject({ status: 404 });
  });

  it("deletes an address, and promotes another when the default goes", async () => {
    await signIn("9000000002");
    await addresses.create(home());
    const [first] = await addresses.list();
    const after = await addresses.remove(first!.id);
    expect(after).toHaveLength(1);
    expect(after[0]!.isDefault).toBe(true);
    await expect(addresses.remove("adr-nope")).rejects.toMatchObject({ status: 404 });
  });

  it("keeps at most 10 addresses", async () => {
    await signIn("9111111111");
    for (let i = 0; i < 10; i++) await addresses.create(home({ line1: `House ${i + 1}, Main Road` }));
    await expect(addresses.create(home())).rejects.toMatchObject({ status: 422, code: "VALIDATION_FAILED" });
  });

  it("is each customer's own", async () => {
    await signIn("9000000002");
    const [mine] = await addresses.list();
    await signIn("9000000005");
    expect((await addresses.list()).map((entry) => entry.id)).not.toContain(mine!.id);
    await expect(addresses.remove(mine!.id)).rejects.toMatchObject({ status: 404 });
  });
});
