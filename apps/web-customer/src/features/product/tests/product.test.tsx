import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createProductsApi } from "@femxo/shared/api";
import type { AuthApi, ProductsApi } from "@femxo/shared/api";
import { createMockBackend } from "@femxo/shared/demo";
import type { ProductDetail, ReviewList } from "@femxo/shared/contracts";
import { axeViolations } from "@femxo/ui/testing/axe";
import { StorefrontProviders } from "@/test/providers";
import { PincodeCheck } from "../components/PincodeCheck";
import { ProductBuyBox } from "../components/ProductBuyBox";
import { ProductReviews } from "../components/ProductReviews";
import { productJsonLd } from "../json-ld";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/" }));

let products: ProductsApi;
let product: ProductDetail;
let reviews: ReviewList;

beforeEach(async () => {
  products = createProductsApi(createMockBackend({ storage: "memory", latency: false, realNow: () => Date.UTC(2026, 9, 24, 5, 0) }).adapter);
  const { items } = await products.list({ limit: 100 });
  const slug = items.find((entry) => entry.ratingCount > 5)!.slug;
  product = await products.detail(slug);
  reviews = await products.reviews(slug);
});

const signedOut = { refresh: vi.fn(() => Promise.reject(new ApiError(401, "UNAUTHENTICATED", "x"))), logout: vi.fn() } as unknown as AuthApi;
const withSession = (children: React.ReactNode) => <StorefrontProviders auth={signedOut}>{children}</StorefrontProviders>;

describe("ProductBuyBox", () => {
  it("shows the price, Prime offer, stock and a picked variant", async () => {
    const { container } = render(withSession(<ProductBuyBox product={product} products={products} />));
    expect(screen.getByRole("heading", { level: 1, name: product.name })).toBeInTheDocument();
    expect(screen.getByText(/with Prime/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: new RegExp(product.variants[0]!.label) })).toBeChecked();
    expect(await screen.findByText(/In stock|Only \d+ left|Out of stock/)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("switches variant and shows its best-before date when it has one", async () => {
    const withDate = product.variants.find((variant) => variant.bestBefore);
    if (!withDate) return;
    render(withSession(<ProductBuyBox product={product} products={products} />));
    await userEvent.click(screen.getByRole("radio", { name: new RegExp(withDate.label) }));
    expect(screen.getByText(/Best before/)).toBeInTheDocument();
  });
});

describe("PincodeCheck", () => {
  it("rejects a short pincode without asking the server", async () => {
    const spy = vi.spyOn(products, "serviceability");
    render(<PincodeCheck products={products} />);
    await userEvent.type(screen.getByLabelText("Pincode"), "80001");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Enter a 6-digit pincode")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("says when and how we deliver, or that we don't", async () => {
    render(<PincodeCheck products={products} />);
    await userEvent.type(screen.getByLabelText("Pincode"), "800001");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText(/Delivers to 800001, Patna in 1–2 days/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Pincode"));
    await userEvent.type(screen.getByLabelText("Pincode"), "855107");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText(/don't deliver to 855107/)).toBeInTheDocument();
  });
});

describe("ProductReviews", () => {
  it("shows the breakdown and loads more reviews", async () => {
    const { container } = render(<ProductReviews slug={product.slug} initial={reviews} products={products} />);
    expect(screen.getByRole("list", { name: "Ratings breakdown" })).toBeInTheDocument();
    const before = screen.getAllByRole("article").length;
    await userEvent.click(screen.getByRole("button", { name: "Show more reviews" }));
    await waitFor(() => expect(screen.getAllByRole("article").length).toBeGreaterThan(before));
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("productJsonLd", () => {
  it("describes the product with one offer per variant, in rupees", () => {
    const ld = productJsonLd(product);
    expect(ld["@type"]).toBe("Product");
    expect(ld.offers).toHaveLength(product.variants.length);
    expect(ld.offers[0]!.price).toBe((product.variants[0]!.price / 100).toFixed(2));
    expect(ld.offers[0]!.priceCurrency).toBe("INR");
  });
});
