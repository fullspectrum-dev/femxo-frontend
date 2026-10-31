"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { isAdminPrototype } from "../data/data-mode";
import { NAV_ITEMS } from "../nav";

/**
 * "Search modules, dealers, orders…" with ⌘K / Ctrl+K. In the prototype it
 * jumps to modules; record search arrives with the API's search endpoint.
 */
export function CommandSearch({ autoFocus }: { autoFocus?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const needle = query.trim().toLowerCase();
  const results = needle ? NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(needle)).slice(0, 6) : [];

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function go(index: number) {
    const target = results[index];
    if (!target) return;
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
    router.push(target.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.max(0, Math.min(index + 1, results.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(active);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && needle.length > 0;

  return (
    <div className="relative w-full">
      <div className="fx-search">
        <Search size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Search modules"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          autoFocus={autoFocus}
          placeholder={isAdminPrototype ? "Search modules, dealers, orders…" : "Search modules…"}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        <kbd className="fx-kbd hidden lg:inline">⌘ K</kbd>
      </div>
      {showList ? (
        <ul id={listId} role="listbox" aria-label="Modules" className="fx-popover left-0 right-auto w-full">
          {results.length ? (
            results.map((item, index) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.key}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  data-active={index === active}
                  className="fx-menu-item"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => go(index)}
                >
                  <Icon size={16} aria-hidden="true" />
                  {item.label}
                </li>
              );
            })
          ) : (
            <li className="px-3 py-2 text-[13px] fx-muted">No modules match &ldquo;{query}&rdquo;.</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
