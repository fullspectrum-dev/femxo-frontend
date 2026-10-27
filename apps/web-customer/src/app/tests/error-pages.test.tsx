import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { axeViolations } from "@femxo/ui/testing/axe";
import ErrorBoundary from "../error";
import GlobalError from "../global-error";
import NotFound from "../not-found";
import Offline from "../offline/page";

describe("error pages", () => {
  it("the page error boundary explains, and retries", async () => {
    const reset = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container } = render(<ErrorBoundary error={new Error("boom")} reset={reset} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("does not put the error's message in front of the customer", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<ErrorBoundary error={new Error("secret token abc123")} reset={() => undefined} />);
    expect(screen.queryByText(/abc123/)).not.toBeInTheDocument();
  });

  it("the last-resort page, which replaces the whole document, still explains and offers a retry", () => {
    // It renders its own <html>, so look at the markup rather than mounting it inside the test page.
    const markup = renderToStaticMarkup(<GlobalError error={new Error("x")} reset={() => undefined} />);
    expect(markup).toContain("Something went wrong");
    expect(markup).toContain("Try again");
    expect(markup).not.toContain("<script");
  });

  it("the not-found page offers the way back", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "We couldn't find that page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the store" })).toHaveAttribute("href", "/");
  });

  it("the offline page says what to do, and passes axe", async () => {
    const { container } = render(<Offline />);
    expect(screen.getByRole("heading", { name: "You're offline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the store" })).toHaveAttribute("href", "/");
    expect(await axeViolations(container)).toEqual([]);
  });
});
