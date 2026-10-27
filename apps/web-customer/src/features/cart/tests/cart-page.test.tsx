import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthApi, createCartApi, withAuth } from "@femxo/shared/api";
import type { AuthApi, CartApi } from "@femxo/shared/api";
import { createMockBackend } from "@femxo/shared/demo";
import { formatINR } from "@femxo/shared";
import { ToastProvider } from "@femxo/ui";
import { axeViolations } from "@femxo/ui/testing/axe";
import { SessionProvider } from "@/features/auth/components/SessionProvider";
import { getAccessToken, setAccessToken } from "@/lib/token";
import { CartPage } from "../components/CartPage";
import { CartProvider } from "../components/CartProvider";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/cart" }));

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

const variants = () => backend.catalog.products.flatMap((product) => product.variants).filter((entry) => entry.stock >= 50 && entry.maxPerOrder >= 5);
const pricey = () => variants().sort((a, b) => b.price - a.price)[0]!;

const mount = () =>
  render(
    <ToastProvider>
      <SessionProvider auth={auth}>
        <CartProvider api={cart}>
          <CartPage />
        </CartProvider>
      </SessionProvider>
    </ToastProvider>
  );

describe("CartPage", () => {
  it("invites an empty cart to start shopping", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: "Your cart is empty" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start shopping" })).toHaveAttribute("href", "/");
  });

  it("lists the items with their prices and the bill, and passes axe", async () => {
    const variant = pricey();
    await cart.add(variant.id, 2);
    const { container } = mount();
    const item = await screen.findByRole("listitem", { name: new RegExp(variant.label) });
    expect(within(item).getByText(formatINR(variant.price * 2))).toBeInTheDocument();
    const bill = screen.getByRole("region", { name: "Price details" });
    expect(within(bill).getByText("Total")).toBeInTheDocument();
    expect(within(bill).getByText(/Includes .* GST/)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("changes a quantity and updates the total", async () => {
    const variant = pricey();
    await cart.add(variant.id, 1);
    mount();
    await screen.findByRole("listitem", { name: new RegExp(variant.label) });
    await userEvent.click(screen.getByRole("button", { name: /Increase quantity/ }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Price details" })).toHaveTextContent(formatINR(variant.price * 2)));
  });

  it("removes an item and falls back to the empty cart", async () => {
    await cart.add(pricey().id, 1);
    mount();
    await userEvent.click(await screen.findByRole("button", { name: /^Remove / }));
    expect(await screen.findByRole("heading", { name: "Your cart is empty" })).toBeInTheDocument();
  });

  it("applies a coupon, shows the saving, and can take it off", async () => {
    await cart.add(pricey().id, 2);
    mount();
    await userEvent.type(await screen.findByLabelText("Coupon code"), "flat50");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText(/applied:/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Price details" })).getByText(/Coupon/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove coupon" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove coupon" })).not.toBeInTheDocument());
  });

  it.each([
    ["NOPE", /isn.t valid/],
    ["OLD20", /expired/],
    ["FEST25", /fully used/],
    ["PRIME15", /Prime members/],
  ])("explains why %s was refused", async (code, copy) => {
    await cart.add(pricey().id, 2);
    mount();
    await userEvent.type(await screen.findByLabelText("Coupon code"), code);
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await within(screen.getByRole("region", { name: "Coupon" })).findByRole("alert")).toHaveTextContent(copy);
  });

  it("says how much more a small cart needs for a coupon", async () => {
    const cheap = variants().find((entry) => entry.price < 15000)!;
    await cart.add(cheap.id, 1);
    mount();
    await userEvent.type(await screen.findByLabelText("Coupon code"), "FLAT50");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await within(screen.getByRole("region", { name: "Coupon" })).findByRole("alert")).toHaveTextContent(/Add .* more/);
  });

  it("warns on an item that's no longer available in that quantity", async () => {
    const variant = pricey();
    await cart.add(variant.id, 3);
    const state = await backend.store.load();
    state.stock[variant.id] = 1;
    await backend.store.save(state);
    backend.adapter.controls.reload();
    mount();
    expect(await screen.findByText(/Only 1 left/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /checkout/i })).toHaveAttribute("aria-disabled", "true");
  });
});
