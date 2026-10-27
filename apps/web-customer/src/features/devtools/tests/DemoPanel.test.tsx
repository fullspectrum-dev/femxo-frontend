import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createClock } from "@femxo/shared";
import { createDemoControls } from "@femxo/shared/demo";
import { DemoPanel } from "../components/DemoPanel";

function setup() {
  const clock = createClock(() => 1_700_000_000_000);
  const target = { forceNext: vi.fn(), clock, reload: vi.fn(), resetStores: vi.fn(async () => undefined), shortStockInCarts: vi.fn(async () => undefined) };
  const controls = createDemoControls(() => target);
  return { controls, target, clock };
}

async function open() {
  await userEvent.click(screen.getByRole("button", { name: "Demo controls" }));
  return screen.getByRole("dialog", { name: "Demo controls" });
}

describe("DemoPanel", () => {
  it("renders nothing once connected to the real API", () => {
    const { controls } = setup();
    const { container } = render(<DemoPanel controls={controls} mode="http" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens from a floating button, and says the figures are demo data", async () => {
    const { controls } = setup();
    render(<DemoPanel controls={controls} mode="mock" />);
    const panel = await open();
    expect(panel).toHaveTextContent(/demo/i);
  });

  it("can make what is in the carts run short, to see the out-of-stock refusal", async () => {
    const { controls, target } = setup();
    render(<DemoPanel controls={controls} mode="mock" />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Make cart items run short" }));
    expect(target.shortStockInCarts).toHaveBeenCalledTimes(1);
  });

  it("switches random server errors on and off", async () => {
    const { controls } = setup();
    render(<DemoPanel controls={controls} mode="mock" />);
    await open();
    const toggle = screen.getByRole("checkbox", { name: "Random server errors" });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(controls.chaos().enabled).toBe(true);
    expect(toggle).toBeChecked();
  });

  it("forces the next request to fail, or to go offline", async () => {
    const { controls, target } = setup();
    render(<DemoPanel controls={controls} mode="mock" />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Fail the next request" }));
    await userEvent.click(screen.getByRole("button", { name: "Go offline for the next request" }));
    expect(target.forceNext.mock.calls).toEqual([["server-error"], ["offline"]]);
  });

  it("chooses how the next payment ends", async () => {
    const { controls } = setup();
    render(<DemoPanel controls={controls} mode="mock" />);
    await open();
    const select = screen.getByRole("combobox", { name: "Next payment" });
    expect(select).toHaveValue("");
    await userEvent.selectOptions(select, "failure");
    expect(controls.snapshot().nextPayment).toBe("failure");
    await userEvent.selectOptions(select, "");
    expect(controls.snapshot().nextPayment).toBeNull();
  });

  it("fast-forwards the clock and shows how far", async () => {
    const { controls, clock } = setup();
    render(<DemoPanel controls={controls} mode="mock" />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Fast-forward 7 days" }));
    expect(clock.now()).toBe(1_700_000_000_000 + 7 * 86_400_000);
    expect(screen.getByText("+7 days ahead")).toBeInTheDocument();
  });

  it("resets the demo data after confirming it will lose the cart and orders", async () => {
    const { controls, target } = setup();
    render(<DemoPanel controls={controls} mode="mock" />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Reset demo data" }));
    expect(target.resetStores).not.toHaveBeenCalled();
    expect(screen.getByText(/carts, orders and sign-in/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Yes, reset" }));
    expect(target.resetStores).toHaveBeenCalledOnce();
  });
});
