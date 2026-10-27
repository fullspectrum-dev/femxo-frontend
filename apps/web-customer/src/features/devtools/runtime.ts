"use client";

import { apiMode } from "@femxo/shared";

/*
 * The browser's mock backend (state in IndexedDB). It builds the whole demo
 * catalogue and seed on first use, which is real work on a phone, so it is
 * fetched and built only when something first asks the API (not as part of
 * the first paint). Only exists in mock mode; with the real API there is
 * nothing to build.
 */
type MockRuntime = ReturnType<(typeof import("@femxo/shared/demo"))["createMockBackend"]>;

let backend: MockRuntime | undefined;
let loading: Promise<MockRuntime> | undefined;

/** The mock backend once it has been built, else null (never built, or not in mock mode). */
export const getMockRuntime = () => backend ?? null;

/** Builds the mock backend on first call (loading its code then), and returns it. */
export function loadMockRuntime(): Promise<MockRuntime> | null {
  if (apiMode !== "mock") return null;
  loading ??= import("@femxo/shared/demo").then(({ createMockBackend }) => {
    backend = createMockBackend({ storage: typeof indexedDB === "undefined" ? "memory" : "idb" });
    return backend;
  });
  return loading;
}
