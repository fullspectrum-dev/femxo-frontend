"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "../theme-script";

const THEME_CHANGE_EVENT = "femxo-theme-change";

function applyTheme(isDark: boolean) {
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
}

function subscribeToTheme(onStoreChange: () => void) {
  const systemTheme = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!systemTheme) {
    window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  }
  const handleSystemThemeChange = (event: MediaQueryListEvent) => {
    if (window.localStorage.getItem(THEME_STORAGE_KEY) !== null) return;

    applyTheme(event.matches);
    onStoreChange();
  };
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;

    const isDark =
      event.key === THEME_STORAGE_KEY && event.newValue !== null
        ? event.newValue === "dark"
        : systemTheme.matches;
    applyTheme(isDark);
    onStoreChange();
  };

  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", handleStorageChange);
  systemTheme.addEventListener("change", handleSystemThemeChange);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", handleStorageChange);
    systemTheme.removeEventListener("change", handleSystemThemeChange);
  };
}

function getThemeSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerThemeSnapshot() {
  return false;
}

/** Whether dark mode is on; follows the toggle, other tabs and the OS setting. */
export function useIsDarkTheme() {
  return useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
}

/** Flips light/dark and remembers the choice (shared by the marketing site, the admin panel and the shop). */
export function toggleTheme() {
  const nextIsDark = !document.documentElement.classList.contains("dark");
  applyTheme(nextIsDark);
  window.localStorage.setItem(THEME_STORAGE_KEY, nextIsDark ? "dark" : "light");
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function ThemeToggle() {
  const isDark = useIsDarkTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      aria-pressed={isDark}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      className="flex size-11 shrink-0 items-center justify-center rounded-control text-ink transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus"
    >
      {isDark ? (
        <Sun aria-hidden="true" className="size-[18px]" />
      ) : (
        <Moon aria-hidden="true" className="size-[18px]" />
      )}
    </button>
  );
}
