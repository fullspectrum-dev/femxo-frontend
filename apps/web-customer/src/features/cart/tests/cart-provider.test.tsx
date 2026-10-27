import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createAuthApi, createCartApi, withAuth } from "@femxo/shared/api";
import type { AuthApi, CartApi } from "@femxo/shared/api";
import { createMockBackend } from "@femxo/shared/demo";
import { ToastProvider } from "@femxo/ui";
import { SessionProvider, useSession } from "@/features/auth/components/SessionProvider";
import { getAccessToken, setAccessToken } from "@/lib/token";
import { CartProvider, useCart } from "../components/CartProvider";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/" }));

const DAY = 86_400_000;
let backend: ReturnType<typeof createMockBackend>;
let cart: CartApi;
let auth: AuthApi;

beforeEach(() => {
  setAccessToken(undefined);
  backend = createMockBackend({ storage: "memory", latency: false, realNow: () => Date.UTC(2026, 9, 24, 5, 0) });
  const adapter = withAuth(backend.adapter, getAccessToken);
  cart = createCartApi(adapter);
  auth = createAuthApi(adapter);
});

/** Variants with plenty of stock and room to order a few. */
const variant = (n: number) =>
  backend.catalog.products.flatMap((product) => product.variants).filter((entry) => entry.stock >= 50 && entry.maxPerOrder >= 5)[n]!;

function Probe() {
  const { cart: current, status, notice, add, setQuantity, remove, applyCoupon } = useCart();
  const { signIn } = useSession();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="count">{current?.itemCount ?? "none"}</p>
      <p data-testid="notice">{notice ?? ""}</p>
      <ul>
        {current?.lines.map((line) => (
          <li key={line.id} data-testid="line">
            {line.variant.id}:{line.quantity}
          </li>
        ))}
      </ul>
      <button onClick={() => void add(variant(0).id, 1)}>add first</button>
      <button onClick={() => void add(variant(1).id, 2)}>add second</button>
      <button onClick={() => void setQuantity(current!.lines[0]!.id, 4)}>set 4</button>
      <button onClick={() => void remove(current!.lines[0]!.id)}>remove first</button>
      <button onClick={() => void applyCoupon("NOPE").then((result) => screen.getByTestId("coupon").replaceChildren(String((result as { reason?: string }).reason ?? "ok")))}>coupon</button>
      <p data-testid="coupon" />
      <button
        onClick={async () => {
          signIn(await auth.login("kiran.s@demo.femxo.test", "Demo@12345"));
        }}
      >
        sign in
      </button>
    </div>
  );
}

function mount() {
  return render(
    <ToastProvider>
      <SessionProvider auth={auth}>
        <CartProvider api={cart}>
          <Probe />
        </CartProvider>
      </SessionProvider>
    </ToastProvider>
  );
}

const count = () => screen.getByTestId("count");

describe("CartProvider", () => {
  it("loads the guest's empty cart, and counts what is added", async () => {
    mount();
    await waitFor(() => expect(count()).toHaveTextContent("0"));
    await userEvent.click(screen.getByRole("button", { name: "add first" }));
    await waitFor(() => expect(count()).toHaveTextContent("1"));
    await userEvent.click(screen.getByRole("button", { name: "add second" }));
    await waitFor(() => expect(count()).toHaveTextContent("3"));
    expect(screen.getAllByTestId("line")).toHaveLength(2);
  });

  it("shows a new quantity at once, before the server has answered", async () => {
    mount();
    await waitFor(() => expect(count()).toHaveTextContent("0"));
    await userEvent.click(screen.getByRole("button", { name: "add first" }));
    await waitFor(() => expect(count()).toHaveTextContent("1"));

    let release!: () => void;
    const slow = new Promise<void>((resolve) => (release = resolve));
    const original = cart.setQuantity;
    vi.spyOn(cart, "setQuantity").mockImplementation(async (...args) => {
      await slow;
      return original(...args);
    });
    await userEvent.click(screen.getByRole("button", { name: "set 4" }));
    expect(count()).toHaveTextContent("4");
    release();
    await waitFor(() => expect(count()).toHaveTextContent("4"));
  });

  it("rolls back and says why when the server refuses (409), then shows the real cart", async () => {
    mount();
    await waitFor(() => expect(count()).toHaveTextContent("0"));
    await userEvent.click(screen.getByRole("button", { name: "add first" }));
    await waitFor(() => expect(count()).toHaveTextContent("1"));
    vi.spyOn(cart, "setQuantity").mockRejectedValueOnce(new ApiError(409, "OUT_OF_STOCK", "Only 2 left in stock.", { variantId: "v", available: 2 }));
    await userEvent.click(screen.getByRole("button", { name: "set 4" }));
    expect(await screen.findByText("Only 2 left in stock.")).toBeInTheDocument();
    await waitFor(() => expect(count()).toHaveTextContent("1"));
  });

  it("removes a line", async () => {
    mount();
    await waitFor(() => expect(count()).toHaveTextContent("0"));
    await userEvent.click(screen.getByRole("button", { name: "add first" }));
    await waitFor(() => expect(count()).toHaveTextContent("1"));
    await userEvent.click(screen.getByRole("button", { name: "remove first" }));
    await waitFor(() => expect(count()).toHaveTextContent("0"));
    expect(screen.queryAllByTestId("line")).toHaveLength(0);
  });

  it("tells the shopper an expired cart was replaced with a fresh one", async () => {
    mount();
    await waitFor(() => expect(count()).toHaveTextContent("0"));
    await userEvent.click(screen.getByRole("button", { name: "add first" }));
    await waitFor(() => expect(count()).toHaveTextContent("1"));
    backend.clock.advance(7 * DAY + 1000);
    await userEvent.click(screen.getByRole("button", { name: "add second" }));
    await waitFor(() => expect(screen.getByTestId("notice")).toHaveTextContent(/expired/i));
    await waitFor(() => expect(count()).toHaveTextContent("0"));
  });

  it("returns the reason a coupon was refused", async () => {
    mount();
    await waitFor(() => expect(count()).toHaveTextContent("0"));
    await userEvent.click(screen.getByRole("button", { name: "coupon" }));
    await waitFor(() => expect(screen.getByTestId("coupon")).toHaveTextContent("not_found"));
  });

  it("folds the guest cart into the customer's cart on sign-in", async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    await userEvent.click(screen.getByRole("button", { name: "add first" }));
    await waitFor(() => expect(count()).toHaveTextContent("1"));
    await userEvent.click(screen.getByRole("button", { name: "sign in" }));
    await waitFor(() => expect(screen.getByTestId("notice")).toHaveTextContent(/added/i));
    expect(count()).toHaveTextContent("1");
    // The guest cart is gone: signed out again, the cart is empty.
    setAccessToken(undefined);
    expect((await cart.get()).itemCount).toBe(0);
  });
});
