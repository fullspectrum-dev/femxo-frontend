import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "../src/components/layout/Header";
import { CUSTOMER_SIGN_IN_URL, resolveStoreUrl, STORE_URL } from "../src/lib/constants";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

// The theme toggle asks the browser for the system colour scheme.
window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;

describe("customer sign in from the landing page", () => {
  it("points at the storefront's sign-in page, which runs as its own site", () => {
    expect(STORE_URL).toBe("http://localhost:3002"); // NODE_ENV is "test" here
    expect(CUSTOMER_SIGN_IN_URL).toBe("http://localhost:3002/login");
  });

  it("is offered in the header, on large screens and in the phone menu, apart from staff sign in", () => {
    render(<Header />);
    const customer = screen.getAllByRole("link", { name: "Customer sign in", hidden: true });
    expect(customer).toHaveLength(2);
    for (const link of customer) expect(link).toHaveAttribute("href", CUSTOMER_SIGN_IN_URL);

    const staff = screen.getAllByRole("link", { name: "Staff sign in", hidden: true });
    expect(staff).toHaveLength(2);
    for (const link of staff) expect(link).toHaveAttribute("href", "/login");
  });
});

describe("resolveStoreUrl", () => {
  it("uses the configured address, without a trailing slash", () => {
    expect(resolveStoreUrl("https://shop.femxo.in/", "production")).toBe("https://shop.femxo.in");
  });

  it("falls back to the local storefront while developing or testing", () => {
    expect(resolveStoreUrl(undefined, "development")).toBe("http://localhost:3002");
    expect(resolveStoreUrl("", "test")).toBe("http://localhost:3002");
  });

  it("has no address in production until one is set, rather than pointing visitors at localhost", () => {
    expect(resolveStoreUrl(undefined, "production")).toBeNull();
    expect(resolveStoreUrl("  ", "production")).toBeNull();
  });
});
