import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@femxo/shared/api";
import type { AuthApi, SearchApi } from "@femxo/shared/api";
import type { Facets, ProductSummary, SearchResult } from "@femxo/shared/contracts";
import { axeViolations } from "@femxo/ui/testing/axe";
import { StorefrontProviders } from "@/test/providers";
import { FilterPanel } from "../components/FilterPanel";
import { ProductListing } from "../components/ProductListing";
import { parseListingParams } from "../query-string";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/c/staples",
  useSearchParams: () => new URLSearchParams(search),
}));

const product = (n: number, overrides: Partial<ProductSummary> = {}): ProductSummary => ({
  id: `prd-${n}`,
  slug: `thing-${n}`,
  name: `Thing number ${n}`,
  brand: { id: "brd-a", slug: "a", name: "Femxo Select" },
  categoryId: "cat-x",
  image: `/products/thing-${n}.webp`,
  rating: 4,
  ratingCount: 5,
  fromPrice: 10000 + n,
  variantId: `var-${n}`,
  variantCount: 1,
  fromPrimePrice: 9500 + n,
  mrp: 12000,
  inStock: true,
  primeExclusive: false,
  badges: [],
  ...overrides,
});

const facets: Facets = {
  brands: [
    { id: "brd-a", name: "Femxo Select", count: 12 },
    { id: "brd-b", name: "Magadh Mills", count: 4 },
  ],
  priceBuckets: [
    { min: 0, max: 10000, count: 2 },
    { min: 10000, max: 25000, count: 9 },
    { min: 25000, max: 50000, count: 3 },
    { min: 50000, max: 100000, count: 1 },
    { min: 100000, max: null, count: 1 },
  ],
  ratings: [
    { atLeast: 4, count: 10 },
    { atLeast: 3, count: 14 },
    { atLeast: 2, count: 15 },
    { atLeast: 1, count: 16 },
  ],
  primeCount: 7,
};

const results = (items: ProductSummary[], overrides: Partial<SearchResult> = {}): SearchResult => ({
  items,
  nextCursor: null,
  total: items.length,
  facets,
  correctedQuery: null,
  ...overrides,
});

const signedOut = () => Promise.reject(new ApiError(401, "UNAUTHENTICATED", "x"));
function setup(searchApi: { search: ReturnType<typeof vi.fn> }, initial?: SearchResult, firstPage?: ReactNode) {
  const auth = { refresh: vi.fn(signedOut), logout: vi.fn() } as unknown as AuthApi;
  return render(
    <StorefrontProviders auth={auth}>
      <ProductListing categorySlug="staples" initial={initial} firstPage={firstPage} search={searchApi as unknown as SearchApi} />
    </StorefrontProviders>
  );
}

beforeEach(() => {
  replace.mockClear();
  search = "";
});

describe("FilterPanel", () => {
  const filters = parseListingParams(new URLSearchParams(""));

  function renderPanel(overrides: Partial<typeof filters> = {}) {
    const onChange = vi.fn();
    const onClear = vi.fn();
    const view = render(<FilterPanel facets={facets} filters={{ ...filters, ...overrides }} onChange={onChange} onClear={onClear} />);
    return { ...view, onChange, onClear };
  }

  it("groups brand, price, rating and Prime, with how many products each would show", async () => {
    const { container } = renderPanel();
    expect(screen.getByRole("group", { name: "Brand" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Femxo Select (12)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "₹100 – ₹250 (9)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "₹1,000 & above (1)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "4★ & up (10)" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Prime deals (7)" })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("adds and removes brands", async () => {
    const first = renderPanel();
    await userEvent.click(screen.getByRole("checkbox", { name: "Femxo Select (12)" }));
    expect(first.onChange).toHaveBeenCalledWith({ brand: ["brd-a"] });
    first.unmount();
    const second = renderPanel({ brand: ["brd-a", "brd-b"] });
    expect(screen.getByRole("checkbox", { name: "Femxo Select (12)" })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Femxo Select (12)" }));
    expect(second.onChange).toHaveBeenCalledWith({ brand: ["brd-b"] });
  });

  it("picks a price range (the upper end is exclusive, so a bucket's edge isn't counted twice)", async () => {
    const { onChange } = renderPanel();
    await userEvent.click(screen.getByRole("radio", { name: "₹100 – ₹250 (9)" }));
    expect(onChange).toHaveBeenCalledWith({ minPrice: 10000, maxPrice: 24999 });
    await userEvent.click(screen.getByRole("radio", { name: "₹1,000 & above (1)" }));
    expect(onChange).toHaveBeenLastCalledWith({ minPrice: 100000, maxPrice: undefined });
  });

  it("clears the price range with Any price", async () => {
    const { onChange } = renderPanel({ minPrice: 10000, maxPrice: 24999 });
    await userEvent.click(screen.getByRole("radio", { name: "Any price" }));
    expect(onChange).toHaveBeenCalledWith({ minPrice: undefined, maxPrice: undefined });
  });

  it("marks the chosen price range, rating and Prime", () => {
    renderPanel({ minPrice: 10000, maxPrice: 24999, rating: 4, prime: true });
    expect(screen.getByRole("radio", { name: "₹100 – ₹250 (9)" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "4★ & up (10)" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Prime deals (7)" })).toBeChecked();
  });

  it("picks a rating and Prime", async () => {
    const { onChange } = renderPanel();
    await userEvent.click(screen.getByRole("radio", { name: "3★ & up (14)" }));
    expect(onChange).toHaveBeenLastCalledWith({ rating: 3 });
    await userEvent.click(screen.getByRole("checkbox", { name: "Prime deals (7)" }));
    expect(onChange).toHaveBeenLastCalledWith({ prime: true });
  });

  it("offers Clear all only when something is filtered", async () => {
    const plain = renderPanel();
    expect(screen.queryByRole("button", { name: "Clear all filters" })).not.toBeInTheDocument();
    plain.unmount();
    const filtered = renderPanel({ rating: 4 });
    await userEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(filtered.onClear).toHaveBeenCalledOnce();
  });
});

describe("ProductListing", () => {
  it("shows the first page it was given without asking the API again", () => {
    const searchApi = { search: vi.fn() };
    setup(searchApi, results([product(1), product(2)], { total: 33 }));
    expect(screen.getByText("33 products")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(searchApi.search).not.toHaveBeenCalled();
  });

  it("fetches when the address carries filters, scoped to the category", async () => {
    search = "sort=price_asc&brand=brd-a";
    const searchApi = { search: vi.fn(async () => results([product(5)])) };
    setup(searchApi, results([product(1)]));
    await waitFor(() => expect(screen.getByText("Thing number 5")).toBeInTheDocument());
    expect(searchApi.search).toHaveBeenCalledWith(expect.objectContaining({ category: "staples", sort: "price_asc", brand: ["brd-a"] }), expect.anything());
  });

  it("puts a changed sort in the address", async () => {
    setup({ search: vi.fn(async () => results([product(1)])) }, results([product(1)]));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "price_asc");
    expect(replace).toHaveBeenCalledWith("/c/staples?sort=price_asc", { scroll: false });
  });

  it("puts a chosen brand in the address", async () => {
    setup({ search: vi.fn(async () => results([product(1)])) }, results([product(1)]));
    const sidebar = screen.getByRole("complementary", { name: "Filters" });
    await userEvent.click(within(sidebar).getByRole("checkbox", { name: "Magadh Mills (4)" }));
    expect(replace).toHaveBeenCalledWith("/c/staples?brand=brd-b", { scroll: false });
  });

  it("shows active filters as chips that can be removed one by one", async () => {
    search = "brand=brd-a&rating=4";
    setup({ search: vi.fn(async () => results([product(1)])) }, results([product(1)]));
    const chips = await screen.findByRole("list", { name: "Active filters" });
    expect(within(chips).getAllByRole("listitem")).toHaveLength(2);
    await userEvent.click(within(chips).getByRole("button", { name: "Remove filter: Femxo Select" }));
    expect(replace).toHaveBeenCalledWith("/c/staples?rating=4", { scroll: false });
  });

  it("loads more, adding to the list until the end", async () => {
    const searchApi = {
      search: vi.fn(async () => results([product(3), product(4)], { total: 4, nextCursor: null })),
    };
    setup(searchApi, results([product(1), product(2)], { total: 4, nextCursor: "c1" }));
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(4));
    expect(searchApi.search).toHaveBeenCalledWith(expect.objectContaining({ cursor: "c1" }));
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(screen.getByText("Showing 4 of 4")).toBeInTheDocument();
  });

  it("keeps what is on screen if loading more fails, and lets the customer try again", async () => {
    const searchApi = { search: vi.fn().mockRejectedValueOnce(new ApiError(500, "INTERNAL", "x")).mockResolvedValueOnce(results([product(3)], { total: 3 })) };
    setup(searchApi, results([product(1), product(2)], { total: 3, nextCursor: "c1" }));
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Couldn’t load more products.")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
  });

  it("explains an empty result and offers to clear the filters", async () => {
    search = "rating=4";
    setup({ search: vi.fn(async () => results([], { total: 0 })) }, results([product(1)]));
    expect(await screen.findByRole("heading", { name: "No products match" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(replace).toHaveBeenCalledWith("/c/staples", { scroll: false });
  });

  it("shows an error with a retry when the list can't be loaded", async () => {
    search = "rating=4";
    const searchApi = { search: vi.fn().mockRejectedValueOnce(new ApiError(500, "INTERNAL", "x")).mockResolvedValueOnce(results([product(7)])) };
    setup(searchApi, results([product(1)]));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Thing number 7")).toBeInTheDocument();
  });

  it("says when it searched for something other than what was typed", () => {
    search = "q=biskit";
    setup({ search: vi.fn(async () => results([product(1)], { correctedQuery: "biscuits" })) }, undefined);
    return waitFor(() => expect(screen.getByText(/Showing results for/)).toHaveTextContent("Showing results for biscuits"));
  });

  it("opens the filters in a sheet on small screens", async () => {
    setup({ search: vi.fn() }, results([product(1)]));
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(within(sheet).getByRole("checkbox", { name: "Femxo Select (12)" })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: /Show 1 products?/ }));
    expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument();
  });
});

describe("the first page rendered on the server", () => {
  const serverGrid = <ul data-testid="server-grid"><li>Thing number 1 (from the server)</li></ul>;

  it("is shown as it came, instead of building the cards again in the browser", () => {
    search = "";
    setup({ search: vi.fn() }, results([product(1)]), serverGrid);
    expect(screen.getByTestId("server-grid")).toBeInTheDocument();
    expect(screen.queryByText("Thing number 1")).not.toBeInTheDocument();
  });

  it("gives way to the browser's own list once more is loaded", async () => {
    search = "";
    const searchApi = { search: vi.fn(async () => results([product(2)], { total: 2 })) };
    setup(searchApi, results([product(1)], { total: 2, nextCursor: "c1" }), serverGrid);
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Thing number 2")).toBeInTheDocument();
    expect(screen.getByText("Thing number 1")).toBeInTheDocument();
    expect(screen.queryByTestId("server-grid")).not.toBeInTheDocument();
  });

  it("is not used when the address carries filters", async () => {
    search = "rating=4";
    setup({ search: vi.fn(async () => results([product(9)])) }, results([product(1)]), serverGrid);
    expect(await screen.findByText("Thing number 9")).toBeInTheDocument();
    expect(screen.queryByTestId("server-grid")).not.toBeInTheDocument();
  });
});
