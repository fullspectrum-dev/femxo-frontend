import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchApi } from "@femxo/shared/api";
import type { Suggestion } from "@femxo/shared/contracts";
import { axeViolations } from "@femxo/ui/testing/axe";
import { SearchBox } from "../components/SearchBox";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const suggestions: Suggestion[] = [
  { kind: "category", label: "Atta & flours", href: "/c/atta-flours" },
  { kind: "brand", label: "Magadh Mills", href: "/search?brand=brd-magadh-mills" },
  { kind: "product", label: "Magadh Mills Chakki fresh atta", href: "/p/magadh-mills-chakki-fresh-atta" },
];

function setup(suggest: ReturnType<typeof vi.fn>, initialValue = "") {
  const searchApi = { suggest } as unknown as SearchApi;
  return render(<SearchBox search={searchApi} initialValue={initialValue} />);
}

const box = () => screen.getByRole("combobox", { name: "Search Femxo" });

beforeEach(() => {
  push.mockClear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

async function typeAndWait(text: string) {
  await userEvent.type(box(), text);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
}

describe("SearchBox", () => {
  it("is a labelled combobox that starts closed, with the form's own name for the query", () => {
    setup(vi.fn(async () => suggestions));
    expect(box()).toHaveAttribute("name", "q");
    expect(box()).toHaveAttribute("aria-expanded", "false");
    expect(box()).toHaveAttribute("aria-autocomplete", "list");
  });

  it("starts with the current search words when it is given them", () => {
    setup(vi.fn(async () => suggestions), "atta");
    expect(box()).toHaveValue("atta");
  });

  it("suggests as you type, after a short pause, and says how many", async () => {
    const suggest = vi.fn(async () => suggestions);
    const { container } = setup(suggest);
    await typeAndWait("att");
    const list = await screen.findByRole("listbox", { name: "Suggestions" });
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith("att", expect.anything());
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(list).toBeInTheDocument();
    expect(box()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("3 suggestions available")).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("says what kind each suggestion is, in text", async () => {
    setup(vi.fn(async () => suggestions));
    await typeAndWait("mag");
    const options = await screen.findAllByRole("option");
    expect(options[0]).toHaveTextContent("Atta & flours");
    expect(options[0]).toHaveTextContent("Category");
    expect(options[1]).toHaveTextContent("Brand");
    expect(options[2]).toHaveTextContent("Product");
  });

  it("doesn't ask for one letter, or for nothing", async () => {
    const suggest = vi.fn(async () => suggestions);
    setup(suggest);
    await typeAndWait("a");
    expect(suggest).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("moves through suggestions with the arrow keys and opens the chosen one on Enter", async () => {
    setup(vi.fn(async () => suggestions));
    await typeAndWait("mag");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(box()).toHaveAttribute("aria-activedescendant", options[0]!.id);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowUp}{Enter}");
    expect(push).toHaveBeenCalledWith("/p/magadh-mills-chakki-fresh-atta");
  });

  it("opens a suggestion that is clicked", async () => {
    setup(vi.fn(async () => suggestions));
    await typeAndWait("mag");
    await userEvent.click((await screen.findAllByRole("option"))[1]!);
    expect(push).toHaveBeenCalledWith("/search?brand=brd-magadh-mills");
  });

  it("searches for the typed words on Enter when no suggestion is chosen", async () => {
    setup(vi.fn(async () => suggestions));
    await typeAndWait("atta oil");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/search?q=atta%20oil");
  });

  it("closes on Escape, and keeps the typed words", async () => {
    setup(vi.fn(async () => suggestions));
    await typeAndWait("mag");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(box()).toHaveValue("mag");
  });

  it("only shows the answer to the latest words, even if an older request finishes last", async () => {
    let finishSlow: (list: Suggestion[]) => void = () => undefined;
    const suggest = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Suggestion[]>((resolve) => (finishSlow = resolve)))
      .mockImplementationOnce(async () => [{ kind: "product", label: "Fresh answer", href: "/p/fresh" }]);
    setup(suggest);
    await typeAndWait("mu");
    await userEvent.type(box(), "s");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(await screen.findByText("Fresh answer")).toBeInTheDocument();
    await act(async () => finishSlow([{ kind: "product", label: "Stale answer", href: "/p/stale" }]));
    expect(screen.queryByText("Stale answer")).not.toBeInTheDocument();
    expect(screen.getByText("Fresh answer")).toBeInTheDocument();
  });

  it("just stays quiet if suggestions can't be fetched", async () => {
    setup(vi.fn(async () => Promise.reject(new Error("offline"))));
    await typeAndWait("mag");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(box()).toHaveValue("mag");
  });
});
