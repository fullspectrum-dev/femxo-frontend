import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthApi, createCartApi, createCheckoutApi, createOrdersApi, createPaymentApi, withAuth } from "@femxo/shared/api";
import type { AuthApi, OrdersApi, PaymentApi } from "@femxo/shared/api";
import { createMockBackend } from "@femxo/shared/demo";
import { ToastProvider } from "@femxo/ui";
import { axeViolations } from "@femxo/ui/testing/axe";
import { SessionProvider } from "@/features/auth/components/SessionProvider";
import { getAccessToken, setAccessToken } from "@/lib/token";
import { OrderDetailPage } from "../components/OrderDetailPage";
import { OrdersPage } from "../components/OrdersPage";

let params = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/orders",
  useSearchParams: () => params,
  useParams: () => ({ id: "ignored" }),
}));

const HOUR = 3_600_000;
let backend: ReturnType<typeof createMockBackend>;
let auth: AuthApi;
let orders: OrdersApi;
let payments: PaymentApi;
let cart: ReturnType<typeof createCartApi>;
let checkout: ReturnType<typeof createCheckoutApi>;

beforeEach(async () => {
  params = new URLSearchParams();
  setAccessToken(undefined);
  backend = createMockBackend({ storage: "memory", latency: false, realNow: () => Date.UTC(2026, 9, 24, 5, 0) });
  const adapter = withAuth(backend.adapter, getAccessToken);
  auth = createAuthApi(adapter);
  orders = createOrdersApi(adapter);
  payments = createPaymentApi(adapter);
  cart = createCartApi(adapter);
  checkout = createCheckoutApi(adapter);
  const session = await auth.login("kiran.s@demo.femxo.test", "Demo@12345");
  setAccessToken(session.accessToken);
});

const shell = (children: React.ReactNode) => (
  <ToastProvider>
    <SessionProvider auth={auth}>{children}</SessionProvider>
  </ToastProvider>
);

/** A new order from this customer, for the tests that change one. */
async function newOrder(method: "cod" | "upi" = "cod", returnable = true) {
  const product = backend.catalog.products.find((entry) => entry.returnable === returnable && entry.variants.some((variant) => variant.stock >= 50 && variant.maxPerOrder >= 2 && variant.price < 90000))!;
  const variant = product.variants.find((entry) => entry.stock >= 50 && entry.maxPerOrder >= 2)!;
  await cart.add(variant.id, 1);
  const session = await checkout.start();
  await checkout.update(session.id, { deliveryId: "standard" });
  return checkout.placeOrder(session.id, method);
}

async function later(ms: number) {
  backend.clock.advance(ms);
  const session = await auth.login("kiran.s@demo.femxo.test", "Demo@12345");
  setAccessToken(session.accessToken);
}

describe("OrdersPage", () => {
  it("lists the customer's orders with status and total, and passes axe", async () => {
    const { container } = render(shell(<OrdersPage api={orders} />));
    const list = await screen.findByRole("list", {}, { timeout: 4000 });
    const rows = within(list).getAllByRole("link");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveAttribute("href", expect.stringMatching(/^\/orders\/ord-/));
    expect(rows[0]).toHaveTextContent(/Order FX-\d+/);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("filters by tab, and loads more", async () => {
    render(shell(<OrdersPage api={orders} />));
    await screen.findAllByRole("link", { name: /Order FX-/ });
    await userEvent.click(screen.getByRole("tab", { name: "Delivered" }));
    await waitFor(() => {
      const rows = screen.getAllByRole("link", { name: /Order FX-/ });
      for (const row of rows) expect(row).toHaveTextContent("Delivered");
    });
  });

  it("invites a customer with no orders to start shopping", async () => {
    const vacant = vi.spyOn(orders, "list").mockResolvedValue({ items: [], nextCursor: null });
    render(shell(<OrdersPage api={orders} />));
    expect(await screen.findByRole("heading", { name: "No orders yet" })).toBeInTheDocument();
    vacant.mockRestore();
  });

  it("offers to try again when the orders can't be loaded", async () => {
    vi.spyOn(orders, "list").mockRejectedValueOnce(new Error("offline"));
    render(shell(<OrdersPage api={orders} />));
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect((await screen.findAllByRole("link", { name: /Order FX-/ })).length).toBeGreaterThan(0);
  });
});

describe("OrderDetailPage", () => {
  it("shows the tracking timeline, items, bill and address, and passes axe", async () => {
    const placed = await newOrder();
    const { container } = render(shell(<OrderDetailPage orderId={placed.order.id} orders={orders} payments={payments} />));
    const tracking = await screen.findByRole("list", { name: "Order tracking" });
    expect(within(tracking).getAllByRole("listitem").map((item) => item.textContent)).toEqual(expect.arrayContaining([expect.stringMatching(/Order placed/), expect.stringMatching(/Confirmed/), expect.stringMatching(/Delivered/)]));
    expect(screen.getByRole("region", { name: "Price details" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Delivery address" })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("thanks a customer who has just placed it", async () => {
    params = new URLSearchParams("placed=1");
    const placed = await newOrder();
    render(shell(<OrderDetailPage orderId={placed.order.id} orders={orders} payments={payments} />));
    expect(await screen.findByText(/Thank you! Your order FX-\d+ is placed/)).toBeInTheDocument();
  });

  it("moves along as time passes", async () => {
    const placed = await newOrder();
    await later(61 * HOUR);
    render(shell(<OrderDetailPage orderId={placed.order.id} orders={orders} payments={payments} />));
    const tracking = await screen.findByRole("list", { name: "Order tracking" });
    expect(within(tracking).getByText("Delivered")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return items" })).toBeInTheDocument();
  });

  it("cancels after a confirmation", async () => {
    const placed = await newOrder();
    render(shell(<OrderDetailPage orderId={placed.order.id} orders={orders} payments={payments} />));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel order" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel this order?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel order" }));
    expect(await screen.findByText("Order cancelled")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument();
  });

  it("requests a return, leaving out items that can't be returned", async () => {
    const placed = await newOrder();
    await later(61 * HOUR);
    render(shell(<OrderDetailPage orderId={placed.order.id} orders={orders} payments={payments} />));
    await userEvent.click(await screen.findByRole("button", { name: "Return items" }));
    const dialog = await screen.findByRole("dialog", { name: "Return items" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Request return" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/Choose at least one item/);
    await userEvent.click(within(dialog).getAllByRole("checkbox")[0]!);
    await userEvent.type(within(dialog).getByLabelText("Reason"), "Damaged on arrival");
    await userEvent.click(within(dialog).getByRole("button", { name: "Request return" }));
    await waitFor(() => expect(screen.getAllByText("Return requested").length).toBeGreaterThan(0));
    expect((await orders.get(placed.order.id)).status).toBe("return_requested");
    expect(screen.queryByRole("button", { name: "Return items" })).not.toBeInTheDocument();
  });

  it("pays an order whose payment failed, on the same order", async () => {
    const placed = await newOrder("upi");
    await payments.confirm(placed.intent!.id, "failure");
    render(shell(<OrderDetailPage orderId={placed.order.id} orders={orders} payments={payments} />));
    await userEvent.click(await screen.findByRole("button", { name: "Retry payment" }));
    const sheet = await screen.findByRole("dialog", { name: "Pay for your order" });
    await userEvent.click(within(sheet).getByRole("button", { name: /^Pay ₹/ }));
    expect(await screen.findByText("Payment received")).toBeInTheDocument();
    expect((await orders.get(placed.order.id)).paymentStatus).toBe("paid");
  });

  it("says when the order isn't the customer's", async () => {
    render(shell(<OrderDetailPage orderId="ord-nope" orders={orders} payments={payments} />));
    expect(await screen.findByText("We couldn't find that order")).toBeInTheDocument();
  });
});
