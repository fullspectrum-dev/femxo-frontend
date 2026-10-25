"use client";

import { apiMode } from "@femxo/shared";
import { createMockBackend } from "@femxo/shared/demo";

/**
 * The browser's mock backend (state in IndexedDB), built once on first use.
 * Only exists in mock mode. In `http` mode there is nothing to build.
 */
let backend: ReturnType<typeof createMockBackend> | undefined;

export function getMockRuntime() {
  if (apiMode !== "mock") return null;
  return (backend ??= createMockBackend({ storage: typeof indexedDB === "undefined" ? "memory" : "idb" }));
}
