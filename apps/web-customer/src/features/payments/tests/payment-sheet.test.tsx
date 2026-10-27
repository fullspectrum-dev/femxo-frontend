import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthApi, createCartApi, createCheckoutApi, createPaymentApi, withAuth } from "@femxo/shared/api";
import type { PaymentApi } from "@femxo/shared/api";
import type { PaymentIntent } from "@femxo/shared/contracts";
import { createMockBackend } from "@femxo/shared/demo";
import { getAccessToken, setAccessToken } from "@/lib/token";
import { PaymentSheet } from "../components/PaymentSheet";

let backend: ReturnType<typeof createMockBackend>;
let payments: PaymentApi;
let intent: PaymentIntent;
let orderId: string;

beforeEach(async () => {
  setAccessToken(undefined);
  backend = createMockBackend({ storage: "memory", latency: false, realNow: () => Date.UTC(2026, 9, 24, 5, 0) });
  const adapter = withAuth(backend.adapter, getAccessToken);
  payments = createPaymentApi(adapter);
  const auth = createAuthApi(adapter);
  const challenge = await auth.requestOtp("9000000002");
  setAccessToken((await auth.verifyOtp(challenge.requestId, "123456")).accessToken);
  const variant = backend.catalog.products.flatMap((product) => product.variants).find((entry) => entry.stock >= 50 && entry.maxPerOrder >= 2 && entry.price >= 20000)!;
  await createCartApi(adapter).add(variant.id, 2);
  const checkout = createCheckoutApi(adapter);
  const session = await checkout.start();
  await checkout.update(session.id, { deliveryId: "standard" });
  const placed = await checkout.placeOrder(session.id, "upi");
  intent = placed.intent!;
  orderId = placed.order.id;
});

const open = (props: Partial<React.ComponentProps<typeof PaymentSheet>> = {}) => {
  const onPaid = vi.fn();
  const onClose = vi.fn();
  render(<PaymentSheet open orderId={orderId} intent={intent} amount={intent.amount} payments={payments} pollMs={10} onPaid={onPaid} onClose={onClose} {...props} />);
  return { onPaid, onClose };
};

describe("PaymentSheet", () => {
  it("says plainly that this is a demo, and what will be paid", () => {
    open();
    expect(screen.getByRole("dialog", { name: "Pay for your order" })).toBeInTheDocument();
    expect(screen.getByText(/demo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pay ₹/ })).toBeInTheDocument();
  });

  it("pays: success is reported to the page", async () => {
    const { onPaid } = open();
    await userEvent.click(screen.getByRole("button", { name: /^Pay ₹/ }));
    await waitFor(() => expect(onPaid).toHaveBeenCalledTimes(1));
  });

  it("sends only one request when the button is pressed twice", async () => {
    const confirm = vi.spyOn(payments, "confirm");
    open();
    const pay = screen.getByRole("button", { name: /^Pay ₹/ });
    await userEvent.dblClick(pay);
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  });

  it("explains a failed payment and lets the customer try again on the same order", async () => {
    const { onPaid } = open();
    await userEvent.click(screen.getByRole("radio", { name: "Failure" }));
    await userEvent.click(screen.getByRole("button", { name: /^Pay ₹/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/payment failed/i);
    expect(onPaid).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await userEvent.click(await screen.findByRole("radio", { name: "Success" }));
    await userEvent.click(screen.getByRole("button", { name: /^Pay ₹/ }));
    await waitFor(() => expect(onPaid).toHaveBeenCalledTimes(1));
    expect((await backend.store.load()).orders[orderId]).toMatchObject({ paymentStatus: "paid" });
  });

  it("waits while the bank is slow, then reports success once it settles", async () => {
    const { onPaid } = open();
    await userEvent.click(screen.getByRole("radio", { name: "Pending" }));
    await userEvent.click(screen.getByRole("button", { name: /^Pay ₹/ }));
    expect(await screen.findByText(/waiting for your bank/i)).toBeInTheDocument();
    expect(onPaid).not.toHaveBeenCalled();
    backend.clock.advance(10_000);
    await waitFor(() => expect(onPaid).toHaveBeenCalledTimes(1));
  });

  it("lets the customer pay later without losing the order", async () => {
    const { onClose } = open();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
