import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Tests live beside their feature: src/features/<module>/tests.
    include: ["src/**/*.test.{ts,tsx}"],
    clearMocks: true,
    // Form tests type into many fields, and the whole suite runs in parallel: leave room before calling a slow test failed.
    testTimeout: 20_000,
  },
});
