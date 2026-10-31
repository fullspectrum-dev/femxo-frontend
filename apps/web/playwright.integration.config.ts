import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Live integration run: real admin frontend (FRONTEND_URL) against the real API
// (BASE_URL). Both must already be running. Credentials come from the
// environment or the git-ignored .env.e2e; nothing is hardcoded.
if (existsSync(".env.e2e")) process.loadEnvFile(".env.e2e");

export default defineConfig({
  testDir: "./e2e/integration",
  testMatch: "*.spec.ts",
  outputDir: "./e2e/results/artifacts",
  // Login is limited to 30 attempts per IP per 15 min: strictly sequential.
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: "e2e/results/results.json" }]],
  use: {
    baseURL: process.env.FRONTEND_URL ?? "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
