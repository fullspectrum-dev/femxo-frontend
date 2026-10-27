import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createAuthApi, createCartApi, createProductsApi, createWishlistApi, withAuth } from "@femxo/shared/api";
import type { AuthApi, CartApi, WishlistApi } from "@femxo/shared/api";
import type { ProductSummary } from "@femxo/shared/contracts";
import { createMockBackend } from "@femxo/shared/demo";
import { ToastProvider } from "@femxo/ui";
import { axeViolations } from "@femxo/ui/testing/axe";
import { CartProvider } from "@/features/cart/components/CartProvider";
import { SessionProvider } from "@/features/auth/components/SessionProvider";
import { getAccessToken, setAccessToken } from "@/lib/token";
import { WishlistButton } from "../components/WishlistButton";
import { WishlistPage } from "../components/WishlistPage";
import { PENDING_WISH_KEY, WishlistProvider } from "../components/WishlistProvider";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => "/c/staples" }));

let backend: ReturnType<typeof createMockBackend>;
let auth: AuthApi;
let cart: CartApi;
let wishlist: WishlistApi;

beforeEach(() => {
  setAccessToken(undefined);
  sessionStorage.clear();
  push.mockClear();
  backend = createMockBackend({ storage: "memory", latency: false, realNow: () => Date.UTC(2026, 9, 24, 5, 0) });
  const adapter = withAuth(backend.adapter, getAccessToken);
  auth = createAuthApi(adapter);
  cart = createCartApi(adapter);
  wishlist = createWishlistApi(adapter);
});

/** A signed-in browser: the refresh cookie exists, so the session provider finds a customer on load. */
async function signInFirst() {
  const session = await auth.login("kiran.s@demo.femxo.test", "Demo@12345");
  setAccessToken(session.accessToken);
}

/** A product that can be added straight from a card (one size, in stock), as the catalogue describes it. */
async function singleSizeProduct(): Promise<ProductSummary> {
  const seed = backend.catalog.products.find((product) => product.variants.length === 1 && product.variants[0]!.stock >= 50)!;
  return createProductsApi(backend.adapter).detail(seed.slug);
}

const mount = (children: React.ReactNode) =>
  render(
    <ToastProvider>
      <SessionProvider auth={auth}>
        <CartProvider api={cart}>
          <WishlistProvider api={wishlist}>{children}</WishlistProvider>
        </CartProvider>
      </SessionProvider>
    </ToastProvider>
  );

describe("WishlistButton", () => {
  it("sends a guest to sign in, and remembers which product they wanted", async () => {
    window.history.pushState({}, "", "/c/staples");
    const product = await singleSizeProduct();
    mount(<WishlistButton product={product} />);
    await userEvent.click(await screen.findByRole("button", { name: new RegExp(`Save ${product.name}`) }));
    expect(push).toHaveBeenCalledWith("/login?next=%2Fc%2Fstaples");
    expect(sessionStorage.getItem(PENDING_WISH_KEY)).toBe(product.id);
  });

  it("saves and unsaves for a signed-in customer", async () => {
    await signInFirst();
    const product = await singleSizeProduct();
    mount(<WishlistButton product={product} />);
    const heart = await screen.findByRole("button", { name: new RegExp(`Save ${product.name}`) });
    await waitFor(() => expect(heart).toBeEnabled());
    expect(heart).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(heart);
    expect(heart).toHaveAttribute("aria-pressed", "true");
    await waitFor(async () => expect((await wishlist.list()).items.map((item) => item.id)).toEqual([product.id]));
    await userEvent.click(heart);
    expect(heart).toHaveAttribute("aria-pressed", "false");
    await waitFor(async () => expect((await wishlist.list()).items).toEqual([]));
  });

  it("puts the heart back and says why when saving fails", async () => {
    await signInFirst();
    const product = await singleSizeProduct();
    mount(<WishlistButton product={product} />);
    const heart = await screen.findByRole("button", { name: new RegExp(`Save ${product.name}`) });
    await waitFor(() => expect(heart).toBeEnabled());
    vi.spyOn(wishlist, "add").mockRejectedValueOnce(new ApiError(500, "INTERNAL", "boom"));
    await userEvent.click(heart);
    expect(await screen.findByText(/couldn.t update your wishlist/i)).toBeInTheDocument();
    await waitFor(() => expect(heart).toHaveAttribute("aria-pressed", "false"));
  });

  it("saves the product a guest wanted once they have signed in", async () => {
    await signInFirst();
    const product = await singleSizeProduct();
    sessionStorage.setItem(PENDING_WISH_KEY, product.id);
    mount(<WishlistButton product={product} />);
    expect(await screen.findByText(/Saved to your wishlist/)).toBeInTheDocument();
    expect(sessionStorage.getItem(PENDING_WISH_KEY)).toBeNull();
    expect((await wishlist.list()).items.map((item) => item.id)).toEqual([product.id]);
  });
});

describe("WishlistPage", () => {
  it("shows the empty state", async () => {
    await signInFirst();
    mount(<WishlistPage />);
    expect(await screen.findByRole("heading", { name: "Your wishlist is empty" })).toBeInTheDocument();
  });

  it("lists saved products, passes axe, and moves one to the cart", async () => {
    await signInFirst();
    const one = backend.catalog.products.find((product) => product.variants.length === 1 && product.variants[0]!.stock >= 50)!;
    await wishlist.add(one.id);
    const { container } = mount(<WishlistPage />);
    const card = (await screen.findByRole("heading", { level: 3, name: one.name })).closest("li")!;
    expect(await axeViolations(container)).toEqual([]);
    await userEvent.click(within(card).getByRole("button", { name: /Move to cart/ }));
    expect(await screen.findByText("Moved to cart")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Your wishlist is empty" })).toBeInTheDocument());
    expect((await cart.get()).lines.map((line) => line.variant.id)).toEqual([one.variants[0]!.id]);
  });

  it("asks a product with several sizes to be opened to choose", async () => {
    await signInFirst();
    const many = backend.catalog.products.find((product) => product.variants.length > 1)!;
    await wishlist.add(many.id);
    mount(<WishlistPage />);
    const card = (await screen.findByRole("heading", { level: 3, name: many.name })).closest("li")!;
    expect(within(card).getByRole("link", { name: /Choose size/ })).toHaveAttribute("href", `/p/${many.slug}`);
  });
});
