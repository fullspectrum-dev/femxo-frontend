"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { SearchApi } from "@femxo/shared/api";
import type { Suggestion } from "@femxo/shared/contracts";
import { cn } from "@femxo/ui";
import { getSearchApi } from "@/lib/api";

const KIND_LABEL: Record<Suggestion["kind"], string> = { category: "Category", brand: "Brand", product: "Product", query: "Search" };
const MIN_LETTERS = 2;
const PAUSE_MS = 200;

/**
 * The header's search field with suggestions underneath (a WAI-ARIA combobox).
 * Typing asks for suggestions after a short pause and drops answers to words
 * that were already replaced. It sits in a plain GET form, so searching
 * still works before this code has loaded.
 */
/** Things the catalogue actually stocks, cycled in the empty box the way shoppers expect from quick-commerce apps. */
const HINTS = ["atta", "mustard oil", "basmati rice", "toor dal", "masala tea", "biscuits", "turmeric", "dishwash bar"];
const HINT_MS = 2600;

/** The example word to show: cycles while the box is empty and idle; holds still for reduced motion. */
function useCyclingHint(active: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % HINTS.length), HINT_MS);
    return () => clearInterval(timer);
  }, [active]);
  return HINTS[index]!;
}

export function SearchBox({ search, initialValue = "" }: { search?: SearchApi; initialValue?: string }) {
  const router = useRouter();
  const listId = useId();
  const container = useRef<HTMLDivElement>(null);
  const apiRef = useRef(search);
  const api = () => (apiRef.current ??= getSearchApi());

  const [value, setValue] = useState(initialValue);
  const [answer, setAnswer] = useState<{ for: string; list: Suggestion[] } | null>(null);
  const [focused, setFocused] = useState(false);
  const hint = useCyclingHint(!focused && value === "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const text = value.trim();

  useEffect(() => {
    if (!focused || text.length < MIN_LETTERS) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api()
        .suggest(text, controller.signal)
        .then((list) => {
          if (!controller.signal.aborted) setAnswer({ for: text, list });
        })
        .catch(() => undefined); // suggestions are a nicety: stay quiet if they fail
    }, PAUSE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `api` is stable (a ref), and only the words and focus decide when to ask.
  }, [text, focused]);

  // Only an answer to the words currently in the box counts.
  const list = answer && answer.for === text ? answer.list : [];
  const showList = focused && open && list.length > 0;

  function go(href: string) {
    setOpen(false);
    setActive(-1);
    router.push(href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (list.length === 0) return;
      event.preventDefault();
      if (!showList) {
        setOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + list.length) % list.length);
    } else if (event.key === "Escape") {
      // A search field clears itself on Escape; while suggestions are open it should only close them.
      if (showList) event.preventDefault();
      setOpen(false);
      setActive(-1);
    } else if (event.key === "Enter" && showList && active >= 0) {
      event.preventDefault();
      go(list[active]!.href);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // With script, search without a full page load; without it, the form's own GET /search?q= still works.
    event.preventDefault();
    if (!text) return;
    go(`/search?q=${encodeURIComponent(text)}`);
  }

  return (
    <div
      ref={container}
      className="relative"
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!container.current?.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
          setOpen(false);
        }
      }}
    >
      <SearchField
        form
        hint={value === "" ? hint : undefined}
        onSubmit={onSubmit}
        inputProps={{
          value,
          role: "combobox",
          "aria-expanded": showList,
          "aria-controls": showList ? listId : undefined,
          "aria-autocomplete": "list",
          "aria-activedescendant": showList && active >= 0 ? `${listId}-${active}` : undefined,
          onChange: (event) => {
            setValue(event.target.value);
            setOpen(true);
            setActive(-1);
          },
          onKeyDown,
        }}
      />
      <p className="sr-only" aria-live="polite">
        {showList ? `${list.length} ${list.length === 1 ? "suggestion" : "suggestions"} available` : ""}
      </p>
      {showList ? (
        <ul id={listId} role="listbox" aria-label="Suggestions" className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-control border border-line bg-surface py-1 shadow-raised">
          {list.map((suggestion, index) => (
            <li
              key={`${suggestion.kind}-${suggestion.href}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // Keep focus in the box while clicking, so the list doesn't close before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => go(suggestion.href)}
              className={cn("flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm", index === active ? "bg-primary-soft" : "hover:bg-surface-sunken")}
            >
              <span className="min-w-0 truncate text-ink">{suggestion.label}</span>
              <span className="flex-none text-xs text-ink-muted">{KIND_LABEL[suggestion.kind]}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The search form itself: also the no-script fallback while the box above loads. */
export function SearchField({
  form = false,
  hint,
  onSubmit,
  inputProps,
}: {
  form?: boolean;
  /** An example word drawn over the empty box ("Search for 'atta'"); decorative, the label names the field. */
  hint?: string;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  const field = (
    <>
      <label htmlFor="site-search" className="sr-only">
        Search Femxo
      </label>
      <div className="relative flex h-12 items-center rounded-control border border-line-input bg-surface focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-gold">
        <Search size={18} aria-hidden="true" className="ml-3.5 flex-none text-ink-muted" />
        {hint ? (
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-10 flex items-center overflow-hidden text-[15px] text-ink-muted">
            Search for&nbsp;
            <span key={hint} className="font-semibold text-ink motion-safe:animate-rise">
              &ldquo;{hint}&rdquo;
            </span>
          </span>
        ) : null}
        <input
          id="site-search"
          type="search"
          name="q"
          autoComplete="off"
          placeholder={hint ? "" : "Search atta, oil, soap and more"}
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[15px] text-ink outline-none placeholder:text-ink-muted"
          {...inputProps}
        />
        <button type="submit" className="mr-1 h-10 flex-none cursor-pointer rounded-[10px] bg-primary px-4 font-display text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus">
          Search
        </button>
      </div>
    </>
  );
  return form ? (
    <form role="search" action="/search" method="get" onSubmit={onSubmit}>
      {field}
    </form>
  ) : (
    field
  );
}
