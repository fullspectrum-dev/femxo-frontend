import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

/*
 * E2E smoke for the storefront: a production build in .next-e2e (never clobbers .next) served by `next start`
 * on a free port. The backend is not needed: FEMXO_API_ORIGIN points at e2e/stub-api.mjs, which answers 404, so catalog
 * reads fail fast and the pages show their error / not-found states, which the specs check alongside the shell,
 * the login page, robots and the CSP. Set E2E_SKIP_BUILD=1 to reuse an existing .next-e2e build.
 */
function freePort(): number {
  const script = "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close()})";
  return Number(execFileSync(process.execPath, ["-e", script], { encoding: "utf8" }));
}

// Workers re-load this file; the env var keeps one port for the whole run.
process.env.E2E_PORT ||= String(freePort());
const port = Number(process.env.E2E_PORT);
process.env.E2E_API_PORT ||= String(freePort());
const apiPort = Number(process.env.E2E_API_PORT);
const baseURL = `http://127.0.0.1:${port}`;

const env = {
  NEXT_DIST_DIR: ".next-e2e",
  FEMXO_API_ORIGIN: `http://127.0.0.1:${apiPort}`,
  NEXT_TELEMETRY_DISABLED: "1",
};
const build = process.env.E2E_SKIP_BUILD ? "" : "pnpm exec next build && ";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  expect: { timeout: 15_000 },
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: `node e2e/stub-api.mjs ${apiPort}`, url: `http://127.0.0.1:${apiPort}/`, reuseExistingServer: false, gracefulShutdown: { signal: "SIGTERM", timeout: 2000 } },
    {
      command: `${build}pnpm exec next start --hostname 127.0.0.1 --port ${port}`,
      url: `${baseURL}/login`,
      timeout: 300_000,
      reuseExistingServer: false,
      env,
    },
  ],
});
