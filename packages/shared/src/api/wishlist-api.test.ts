import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockBackend } from "../mock/backend";
import { createAuthApi } from "./auth-api";
import { createWishlistApi } from "./wishlist-api";
import { withAuth } from "./with-auth";

let token: string | undefined;
let backend: ReturnType<typeof createMockBackend>;
let wishlist: ReturnType<typeof createWishlistApi>;
let auth: ReturnType<typeof createAuthApi>;

beforeEach(() => {
  token = undefined;
  backend = createMockBackend({ storage: "memory", latency: false, realNow: () => Date.UTC(2026, 9, 24, 5, 0) });
  const adapter = withAuth(backend.adapter, () => token);
  wishlist = createWishlistApi(adapter);
  auth = createAuthApi(adapter);
});

async function signIn(mobile: string) {
  const challenge = await auth.requestOtp(mobile);
  token = (await auth.verifyOtp(challenge.requestId, "123456")).accessToken;
}

const product = (n: number) => backend.catalog.products[n]!;

describe("the wishlist", () => {
  it("is for signed-in customers only", async () => {
    await expect(wishlist.list()).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    await expect(wishlist.add(product(0).id)).rejects.toMatchObject({ status: 401 });
  });

  it("starts empty", async () => {
    await signIn("9000000002");
    expect(await wishlist.list()).toEqual({ items: [] });
  });

  it("saves a product, newest first, as the card summary", async () => {
    await signIn("9000000002");
    await wishlist.add(product(0).id);
    const result = await wishlist.add(product(1).id);
    expect(result.items.map((item) => item.id)).toEqual([product(1).id, product(0).id]);
    expect(result.items[0]).toMatchObject({ slug: product(1).slug, name: product(1).name });
    expect((await wishlist.list()).items).toHaveLength(2);
  });

  it("saving twice keeps one", async () => {
    await signIn("9000000002");
    await wishlist.add(product(0).id);
    expect((await wishlist.add(product(0).id)).items).toHaveLength(1);
  });

  it("removes a product, and removing one that isn't saved is not an error", async () => {
    await signIn("9000000002");
    await wishlist.add(product(0).id);
    await wishlist.add(product(1).id);
    expect((await wishlist.remove(product(0).id)).items.map((item) => item.id)).toEqual([product(1).id]);
    expect((await wishlist.remove(product(0).id)).items).toHaveLength(1);
  });

  it("refuses an unknown product", async () => {
    await signIn("9000000002");
    await expect(wishlist.add("prd-nope")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("is each customer's own", async () => {
    await signIn("9000000002");
    await wishlist.add(product(0).id);
    await signIn("9000000005");
    expect((await wishlist.list()).items).toEqual([]);
  });
});
