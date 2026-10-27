import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAddressApi, createAuthApi, createCartApi, createCheckoutApi, createPaymentApi, withAuth } from "@femxo/shared/api";
import type { AuthApi, CartApi, CheckoutApi } from "@femxo/shared/api";
import { createMockBackend } from "@femxo/shared/demo";
import { ToastProvider } from "@femxo/ui";
import { axeViolations } from "@femxo/ui/testing/axe";
import { SessionProvider } from "@/features/auth/components/SessionProvider";
import { CartProvider } from "@/features/cart/components/CartProvider";
import { getAccessToken, setAccessToken } from "@/lib/token";
import { CheckoutPage } from "../components/CheckoutPage";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => "/checkout" }));
// The payment sheet builds its own gateway client the first time it is used; point it at the test backend.
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, getPaymentApi: () => testPayments() };
});

let backend: ReturnType<typeof createMockBackend>;
let auth: AuthApi;
let cart: CartApi;
let checkout: CheckoutApi;
let testPayments: () => ReturnType<typeof createPaymentApi>;

beforeEach(async () => {
  push.mockClear();
  setAccessToken(undefined);
  backend = createMockBackend({ storage: "memory", latency: false, realNow: () => Date.UTC(2026, 9, 24, 5, 0) });
  const adapter = withAuth(backend.adapter, getAccessToken);
  auth = createAuthApi(adapter);
  cart = createCartApi(adapter);
  checkout = createCheckoutApi(adapter);
  testPayments = () => createPaymentApi(adapter);
  const session = await auth.login("kiran.s@demo.femxo.test", "Demo@12345");
  setAccessToken(session.accessToken);
});

const variants = () => backend.catalog.products.flatMap((product) => product.variants).filter((entry) => entry.stock >= 50 && entry.maxPerOrder >= 5);
const small = () => variants().find((entry) => entry.price >= 20000 && entry.price < 60000)!;
const big = () => variants().sort((a, b) => b.price - a.price)[0]!;

const mount = () =>
  render(
    <ToastProvider>
      <SessionProvider auth={auth}>
        <CartProvider api={cart}>
          <CheckoutPage checkoutApi={checkout} addressApi={createAddressApi(withAuth(backend.adapter, getAccessToken))} />
        </CartProvider>
      </SessionProvider>
    </ToastProvider>
  );

async function throughToPayment() {
  await userEvent.click(await screen.findByRole("button", { name: "Deliver to this address" }));
  await userEvent.click(await screen.findByRole("button", { name: "Continue to payment" }));
  await screen.findByRole("heading", { name: "How would you like to pay?" });
}

describe("CheckoutPage", () => {
  it("tells a customer with an empty cart there is nothing to check out", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: "Your cart is empty" })).toBeInTheDocument();
  });

  it("starts at the address, with the saved one chosen, and passes axe", async () => {
    await cart.add(small().id, 1);
    const { container } = mount();
    const [saved] = await createAddressApi(withAuth(backend.adapter, getAccessToken)).list();
    expect(await screen.findByRole("radio", { name: new RegExp(saved!.name) })).toBeChecked();
    expect(screen.getByRole("list", { name: "Checkout progress" })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("adds a new address, checking each field, and refuses a pincode we don't serve", async () => {
    await cart.add(small().id, 1);
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Add a new address" }));
    await userEvent.click(screen.getByRole("button", { name: "Save and deliver here" }));
    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    await userEvent.type(screen.getByLabelText("Full name"), "Asha Devi");
    await userEvent.type(screen.getByLabelText("Mobile number"), "9111111111");
    await userEvent.type(screen.getByLabelText("House no., building, street"), "12 Boring Road");
    await userEvent.type(screen.getByLabelText("City"), "Patna");
    await userEvent.type(screen.getByLabelText("District"), "Patna");
    await userEvent.type(screen.getByLabelText("Pincode"), "855107");
    await userEvent.click(screen.getByRole("button", { name: "Save and deliver here" }));
    expect(await screen.findByText(/don.t deliver to 855107/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Pincode"));
    await userEvent.type(screen.getByLabelText("Pincode"), "800001");
    await userEvent.click(screen.getByRole("button", { name: "Save and deliver here" }));
    expect(await screen.findByRole("radio", { name: /Asha Devi/ })).toBeChecked();
  });

  it("places a cash-on-delivery order and goes to it", async () => {
    await cart.add(small().id, 1);
    mount();
    await throughToPayment();
    await userEvent.click(screen.getByRole("radio", { name: "Cash on delivery" }));
    await userEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/orders\/ord-[0-9a-f]+\?placed=1$/)));
    expect(Object.values((await backend.store.load()).orders).filter((order) => order.paymentMethod === "cod" && order.number > "FX-58139")).toHaveLength(1);
  });

  it("turns cash on delivery off for a big order, and says so", async () => {
    await cart.add(big().id, 5);
    mount();
    await throughToPayment();
    const cod = screen.getByRole("radio", { name: "Cash on delivery" });
    if ((await checkout.get((await checkout.start()).id)).codAllowed) return;
    expect(cod).toBeDisabled();
  });

  it("pays online: the payment sheet opens, and success leads to the order", async () => {
    await cart.add(small().id, 1);
    mount();
    await throughToPayment();
    await userEvent.click(screen.getByRole("button", { name: /^Place order and pay/ }));
    const sheet = await screen.findByRole("dialog", { name: "Pay for your order" });
    await userEvent.click(within(sheet).getByRole("button", { name: /^Pay ₹/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/orders\/ord-[0-9a-f]+\?placed=1$/)));
  });

  it("closing the payment sheet keeps the order, to pay later", async () => {
    await cart.add(small().id, 1);
    mount();
    await throughToPayment();
    await userEvent.click(screen.getByRole("button", { name: /^Place order and pay/ }));
    const sheet = await screen.findByRole("dialog", { name: "Pay for your order" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/orders\/ord-[0-9a-f]+$/));
  });

  it("places one order when the button is pressed twice", async () => {
    await cart.add(small().id, 1);
    mount();
    await throughToPayment();
    const place = vi.spyOn(checkout, "placeOrder");
    await userEvent.dblClick(screen.getByRole("button", { name: /^Place order and pay/ }));
    await screen.findByRole("dialog", { name: "Pay for your order" });
    expect(place).toHaveBeenCalledTimes(1);
  });

  it("lists what ran short when stock changed under the customer (409)", async () => {
    const variant = small();
    await cart.add(variant.id, 3);
    mount();
    await throughToPayment();
    const state = await backend.store.load();
    state.stock[variant.id] = 1;
    await backend.store.save(state);
    backend.adapter.controls.reload();
    await userEvent.click(screen.getByRole("button", { name: /^Place order and pay/ }));
    const alert = await screen.findByText(/no longer available in that quantity/);
    expect(alert.closest("[role=alert]")).toHaveTextContent(/only 1 left/);
    expect(screen.getByRole("link", { name: "Update your cart" })).toHaveAttribute("href", "/cart");
    expect(push).not.toHaveBeenCalled();
  });
});
