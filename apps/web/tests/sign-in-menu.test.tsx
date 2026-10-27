import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { SignInMenu } from "../src/components/layout/SignInMenu";

const STORE = "https://shop.femxo.in/login";

afterEach(cleanup);

describe("SignInMenu (sign in on every screen size)", () => {
  it("is one 'Sign in' button that opens both ways in, customer first", async () => {
    render(<SignInMenu customerUrl={STORE} />);
    const trigger = screen.getByRole("button", { name: "Sign in" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /Customer sign in/ })).not.toBeInTheDocument();

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([expect.stringContaining("Customer sign in"), expect.stringContaining("Staff sign in")]);
    expect(links[0]).toHaveAttribute("href", STORE);
    expect(links[1]).toHaveAttribute("href", "/login");
  });

  it("closes on Escape and gives focus back to the button", async () => {
    render(<SignInMenu customerUrl={STORE} />);
    const trigger = screen.getByRole("button", { name: "Sign in" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("link", { name: /Staff sign in/ })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes when the visitor clicks elsewhere, and when they pick a way in", async () => {
    render(
      <div>
        <SignInMenu customerUrl={STORE} />
        <p>elsewhere</p>
      </div>
    );
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await userEvent.click(screen.getByText("elsewhere"));
    expect(screen.queryByRole("link", { name: /Staff sign in/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await userEvent.click(screen.getByRole("link", { name: /Customer sign in/ }));
    expect(screen.queryByRole("link", { name: /Staff sign in/ })).not.toBeInTheDocument();
  });

  it("without a storefront address is just a plain link to the one sign-in there is", () => {
    render(<SignInMenu customerUrl={null} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });
});
