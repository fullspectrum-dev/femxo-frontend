import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

/*
 * E2E smoke for the staff app: a production build in .next-e2e (so it never
 * clobbers .next) served by `next start` on a free port. The backend is not
 * needed: specs mock /auth and /access with route interception, and
 * FEMXO_API_ORIGIN points at a closed port so anything unmocked fails fast.
 *
 * Set E2E_SKIP_BUILD=1 to reuse an existing .next-e2e build.
 */

function freePort(): number {
  const script = "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close()})";
  return Number(execFileSync(process.execPath, ["-e", script], { encoding: "utf8" }));
}

// Workers re-load this file; the env var keeps one port for the whole run.
process.env.E2E_PORT ||= String(freePort());
const port = Number(process.env.E2E_PORT);
const baseURL = `http://127.0.0.1:${port}`;

const build = process.env.E2E_SKIP_BUILD ? "" : "pnpm exec next build && ";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  // First loads of a cold `next start` can be slow on CI and Windows.
  expect: { timeout: 15_000 },
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `${build}pnpm exec next start --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      FEMXO_API_ORIGIN: "http://127.0.0.1:9",
      NEXT_PUBLIC_STORE_URL: "http://127.0.0.1:9",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
