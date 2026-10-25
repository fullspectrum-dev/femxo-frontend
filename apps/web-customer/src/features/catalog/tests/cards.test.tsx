import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@femxo/shared/api";
import type { AuthApi } from "@femxo/shared/api";
import type { Banner, Category, Customer, ProductSummary } from "@femxo/shared/contracts";
import { axeViolations } from "@femxo/ui/testing/axe";
import { SessionProvider } from "@/features/auth/components/SessionProvider";
import { BannerRow } from "../components/BannerRow";
import { CategoryTiles } from "../components/CategoryTiles";
import { ProductCard } from "../components/ProductCard";
import { ProductRail } from "../components/ProductRail";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/" }));

const product = (overrides: Partial<ProductSummary> = {}): ProductSummary => ({
  id: "prd-1",
  slug: "femxo-select-kachi-ghani-mustard-oil",
  name: "Femxo Select Kachi ghani mustard oil",
  brand: { id: "brd-femxo-select", slug: "femxo-select", name: "Femxo Select" },
  categoryId: "cat-mustard-oil",
  image: "/products/femxo-select-kachi-ghani-mustard-oil.webp",
  rating: 4.3,
  ratingCount: 12,
  fromPrice: 18500,
  fromPrimePrice: 17200,
  mrp: 19900,
  inStock: true,
  primeExclusive: false,
  badges: [],
  ...overrides,
});

const signedOut = () => Promise.reject(new ApiError(401, "UNAUTHENTICATED", "x"));
const member: Customer = { id: "cus-1", name: "Pooja", mobile: "9000000003", email: null, birthday: null, isPrime: true };

function withSession(children: React.ReactNode, user?: Customer) {
  const auth = {
    refresh: vi.fn(user ? async () => ({ accessToken: "t", expiresIn: 900, user, isNewUser: false }) : signedOut),
    logout: vi.fn(),
  } as unknown as AuthApi;
  return <SessionProvider auth={auth}>{children}</SessionProvider>;
}

describe("ProductCard", () => {
  it("links the whole card to the product, and shows brand, rating and price", async () => {
    const { container } = render(withSession(<ProductCard product={product()} />));
    const link = screen.getByRole("link", { name: /Kachi ghani mustard oil/ });
    expect(link).toHaveAttribute("href", "/p/femxo-select-kachi-ghani-mustard-oil");
    expect(screen.getByText("Femxo Select")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Rated 4.3 out of 5 from 12 ratings/ })).toBeInTheDocument();
    expect(screen.getByText("₹185")).toBeInTheDocument();
    expect(screen.getByText("₹199")).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("offers the Prime price to someone who isn't a member", async () => {
    render(withSession(<ProductCard product={product()} />));
    expect(await screen.findByText(/₹172 with Prime/)).toBeInTheDocument();
  });

  it("charges a Prime member the Prime price", async () => {
    render(withSession(<ProductCard product={product()} />, member));
    expect(await screen.findByText("Prime price")).toBeInTheDocument();
    expect(screen.getByText("₹172")).toBeInTheDocument();
    expect(screen.queryByText(/with Prime/)).not.toBeInTheDocument();
  });

  it("says in text when something is out of stock, Prime-only or a bestseller", () => {
    const { rerender } = render(withSession(<ProductCard product={product({ inStock: false })} />));
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
    rerender(withSession(<ProductCard product={product({ primeExclusive: true, badges: ["Bestseller"] })} />));
    expect(screen.getByText("Prime only")).toBeInTheDocument();
    expect(screen.getByText("Bestseller")).toBeInTheDocument();
  });

  it("doesn't read its picture out twice: the name next to it already says what it is", () => {
    const { container } = render(withSession(<ProductCard product={product()} />));
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });
});

describe("ProductRail", () => {
  it("is a titled list of cards with a link to see all", () => {
    render(withSession(<ProductRail title="Today's deals" seeAllHref="/search?sort=discount" products={[product(), product({ id: "prd-2", slug: "second", name: "Second thing" })]} />));
    const rail = screen.getByRole("region", { name: "Today's deals" });
    expect(within(rail).getAllByRole("listitem")).toHaveLength(2);
    expect(within(rail).getByRole("link", { name: "See all" })).toHaveAttribute("href", "/search?sort=discount");
  });

  it("renders nothing when there is nothing to show", () => {
    const { container } = render(withSession(<ProductRail title="Today's deals" products={[]} />));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("CategoryTiles", () => {
  const category = (slug: string, name: string, productCount: number): Category => ({ id: `cat-${slug}`, slug, name, parentId: null, image: `/categories/${slug}.webp`, productCount });

  it("links each category to its listing and says how many products it has", async () => {
    const { container } = render(<CategoryTiles categories={[category("staples", "Staples", 33), category("snacks", "Snacks", 1)]} />);
    const nav = screen.getByRole("navigation", { name: "Shop by category" });
    expect(within(nav).getByRole("link", { name: /Staples/ })).toHaveAttribute("href", "/c/staples");
    expect(within(nav).getByRole("link", { name: /Staples/ })).toHaveTextContent("33 products");
    expect(within(nav).getByRole("link", { name: /Snacks/ })).toHaveTextContent("1 product");
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("BannerRow", () => {
  const banners: Banner[] = [
    { id: "ban-1", title: "Chhath essentials", subtitle: "Delivered in 2–4 days", image: "/banners/seasonal.webp", href: "/c/seasonal" },
    { id: "ban-2", title: "Join Prime", subtitle: "Extra savings", image: "/banners/prime.webp", href: "/prime" },
  ];

  it("shows each offer as a link with its title and line of text", async () => {
    const { container } = render(<BannerRow banners={banners} />);
    const first = screen.getByRole("link", { name: /Chhath essentials/ });
    expect(first).toHaveAttribute("href", "/c/seasonal");
    expect(first).toHaveTextContent("Delivered in 2–4 days");
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(await axeViolations(container)).toEqual([]);
  });
});
