import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CartContext } from "@/features/cart/components/CartProvider";
import { BottomBar } from "../components/BottomBar";
import { CategoryNav } from "../components/CategoryNav";
import { Header } from "../components/Header";
import { TOP_CATEGORIES } from "../categories";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

describe("Header", () => {
  it("links the logo home", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: "Femxo home" })).toHaveAttribute("href", "/");
  });

  it("has a search form that works without JavaScript (GET /search?q=)", () => {
    render(<Header />);
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("action", "/search");
    expect(form).toHaveAttribute("method", "get");
    expect(within(form).getByRole("combobox", { name: "Search Femxo" })).toHaveAttribute("name", "q");
    expect(within(form).getByRole("button", { name: "Search" })).toHaveAttribute("type", "submit");
  });

  it("names the cart link with its item count", () => {
    const withCount = (itemCount: number) => (
      <CartContext.Provider value={{ cart: { itemCount } } as never}>
        <Header />
      </CartContext.Provider>
    );
    const { unmount } = render(withCount(3));
    expect(screen.getByRole("link", { name: "Cart, 3 items" })).toHaveAttribute("href", "/cart");
    unmount();
    render(withCount(1));
    expect(screen.getByRole("link", { name: "Cart, 1 item" })).toBeInTheDocument();
  });

  it("shows an empty cart link before the cart has loaded", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: "Cart, 0 items" })).toBeInTheDocument();
  });

  it("offers Prime and the account", () => {
    render(<Header />);
    expect(screen.getAllByRole("link", { name: /Prime/ })[0]).toHaveAttribute("href", "/prime");
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
  });
});

describe("CategoryNav", () => {
  it("links every top category to its listing", () => {
    pathname = "/";
    render(<CategoryNav categories={TOP_CATEGORIES} />);
    const nav = screen.getByRole("navigation", { name: "Shop by category" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(TOP_CATEGORIES.length);
    expect(links[0]).toHaveAttribute("href", `/c/${TOP_CATEGORIES[0]!.slug}`);
  });

  it("marks the category being viewed", () => {
    pathname = `/c/${TOP_CATEGORIES[1]!.slug}`;
    render(<CategoryNav categories={TOP_CATEGORIES} />);
    expect(screen.getByRole("link", { name: TOP_CATEGORIES[1]!.name })).toHaveAttribute("aria-current", "page");
  });
});

describe("BottomBar (phones)", () => {
  it("marks the current section", () => {
    pathname = "/prime";
    render(<BottomBar categories={TOP_CATEGORIES} />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Prime" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("opens every category from Categories, without a separate page", async () => {
    pathname = "/";
    render(<BottomBar categories={TOP_CATEGORIES} />);
    await userEvent.click(screen.getByRole("button", { name: "Categories" }));
    const sheet = screen.getByRole("dialog", { name: "All categories" });
    expect(within(sheet).getAllByRole("link")).toHaveLength(TOP_CATEGORIES.length);
  });
});
