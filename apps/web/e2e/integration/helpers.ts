import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

export const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
export const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3001";
export const RESULTS_DIR = path.resolve("e2e/results");
export const SHOTS_DIR = path.join(RESULTS_DIR, "screenshots");
mkdirSync(SHOTS_DIR, { recursive: true });

/** One id per run: every record a test creates carries it, so cleanup finds only its own. */
export const RUN_ID = (process.env.E2E_RUN_ID ??= Date.now().toString(36).slice(-6));

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@femxo.test";
export const SEED_DOMAIN = "@seed.femxo.test";

export function password(): string {
  const value = process.env.E2E_ADMIN_PASSWORD;
  if (!value) throw new Error("E2E_ADMIN_PASSWORD is not set (env or apps/web/.env.e2e)");
  return value;
}

/** Seed users share the admin's password (dev DB only). */
export const SEED_USERS = {
  warehouse: `warehouse.mgr${SEED_DOMAIN}`,
  catalog: `catalog.mgr${SEED_DOMAIN}`,
  cms: `cms.editor${SEED_DOMAIN}`,
  viewer: `viewer${SEED_DOMAIN}`,
  noroles: `noroles${SEED_DOMAIN}`,
} as const;

/** Secrets never reach logs, reports or attachments. */
export const mask = (value: string | undefined | null) => (value ? `${value.slice(0, 20)}…` : "");

// ---------------------------------------------------------------- login budget
// The API allows 30 login attempts per IP per 15 minutes, successful ones included.
// Every login (and failed attempt) in this suite takes a slot first; when the window
// is full the test waits instead of tripping a 429 that belongs to someone else.
const BUDGET_FILE = path.join(RESULTS_DIR, ".login-attempts.json");
const WINDOW_MS = 15 * 60_000;
const BUDGET = 28;

function recentAttempts(): number[] {
  const stamps: number[] = existsSync(BUDGET_FILE) ? JSON.parse(readFileSync(BUDGET_FILE, "utf8")) : [];
  return stamps.filter((t) => Date.now() - t < WINDOW_MS);
}

export async function takeLoginSlot(count = 1): Promise<void> {
  for (;;) {
    const stamps = recentAttempts();
    if (stamps.length + count <= BUDGET) {
      writeFileSync(BUDGET_FILE, JSON.stringify([...stamps, ...Array(count).fill(Date.now())]));
      return;
    }
    const waitMs = Math.max(stamps[0] + WINDOW_MS - Date.now(), 1000) + 1000;
    console.log(`login budget full (${stamps.length}/${BUDGET}); waiting ${Math.ceil(waitMs / 1000)}s`);
    test.setTimeout(test.info().timeout + waitMs);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

// ---------------------------------------------------------------- API helpers
export interface Session {
  accessToken: string;
  user: Record<string, unknown>;
}
const sessions = new Map<string, Session>();

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function errorOf(response: { json(): Promise<unknown> }): Promise<{ code?: string; message?: string }> {
  try {
    return ((await response.json()) as { error?: { code?: string; message?: string } }).error ?? {};
  } catch {
    return {};
  }
}

/** Logs in over the API, or reuses the token of an earlier login in this run (15 min lifetime). */
export async function apiSession(request: APIRequestContext, email: string): Promise<Session> {
  const cached = sessions.get(email);
  if (cached) return cached;
  await takeLoginSlot();
  const response = await request.post(`${BASE_URL}/auth/login`, { data: { email, password: password() } });
  expect(response.status(), `login ${email}`).toBe(200);
  const body = (await response.json()) as Session;
  sessions.set(email, body);
  return body;
}

export async function adminToken(request: APIRequestContext): Promise<string> {
  return (await apiSession(request, ADMIN_EMAIL)).accessToken;
}

// ---------------------------------------------------------------- UI helpers
export async function openLogin(page: Page, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await expect(page.getByRole("heading", { name: "Sign in to Femxo" })).toBeVisible();
}

export async function submitLogin(page: Page, email: string, pass: string) {
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Signs in through the form. Returns the login response so callers can reuse the token for API checks. */
export async function uiLogin(page: Page, email: string): Promise<Session> {
  await takeLoginSlot();
  await openLogin(page);
  const loginResponse = page.waitForResponse((r) => r.url().endsWith("/auth/login") && r.request().method() === "POST");
  await submitLogin(page, email, password());
  const response = await loginResponse;
  expect(response.status(), `UI login ${email}`).toBe(200);
  const session = (await response.json()) as Session;
  sessions.set(email, session);
  return session;
}

export async function signOutFromAdmin(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  // Logout ends the server session, so access tokens cached from earlier logins stop working.
  sessions.clear();
}

export async function shot(page: Page, id: string) {
  const file = path.join(SHOTS_DIR, `${id}.png`);
  await page.screenshot({ path: file, fullPage: false });
  await test.info().attach(`${id}.png`, { path: file, contentType: "image/png" });
}

// ---------------------------------------------------------------- scenarios
type Fixtures = { page: Page; request: APIRequestContext };
type Body = (fixtures: Fixtures) => Promise<void>;

/** A P0 scenario: the title starts with its spec id, which the coverage gate maps back to the spec file. */
export function scenario(id: string, title: string, body: Body) {
  test(`${id}: ${title}`, async ({ page, request }, info) => {
    info.annotations.push({ type: "spec", description: id });
    await body({ page, request });
  });
}

/** P1/P2 tests are direct tests: tagged by priority, not tied to a spec. */
export function direct(priority: "P1" | "P2", title: string, body: Body) {
  test(`${priority} direct test: ${title}`, async ({ page, request }, info) => {
    info.annotations.push({ type: "direct", description: priority });
    await body({ page, request });
  });
}

// ---------------------------------------------------------------- lockout fixture
// 5 failed logins for one throwaway email lock that email out (429). SPEC-AUTH-06 builds the
// lockout; SPEC-ERRORS-03/04 reuse it (stored on disk, valid for 10 minutes) so the suite
// spends 6 login attempts on it, not 18. The email belongs to no user.
const LOCKOUT_FILE = path.join(RESULTS_DIR, ".lockout.json");

export function lockoutEmail(): string {
  if (existsSync(LOCKOUT_FILE)) {
    const saved = JSON.parse(readFileSync(LOCKOUT_FILE, "utf8")) as { email: string; at: number };
    if (Date.now() - saved.at < 10 * 60_000) return saved.email;
  }
  return `lockout-${RUN_ID}@x.test`;
}

export async function ensureLockout(request: APIRequestContext): Promise<{ email: string; response: APIResponse }> {
  const email = lockoutEmail();
  const attempt = async () => {
    await takeLoginSlot();
    return request.post(`${BASE_URL}/auth/login`, { data: { email, password: "wrong-password-1" } });
  };
  let response = await attempt();
  for (let i = 0; i < 6 && response.status() !== 429; i++) response = await attempt();
  expect(response.status(), "lockout reached").toBe(429);
  writeFileSync(LOCKOUT_FILE, JSON.stringify({ email, at: Date.now() }));
  return { email, response };
}

// ---------------------------------------------------------------- created-record ledger
// Everything a test creates is written here so e2e/cleanup.mjs removes exactly this run's records.
const CREATED_FILE = path.join(RESULTS_DIR, "created.json");
export type CreatedKind = "product" | "movement" | "transfer";

export function track(kind: CreatedKind, id: string, extra: Record<string, unknown> = {}) {
  const all: unknown[] = existsSync(CREATED_FILE) ? JSON.parse(readFileSync(CREATED_FILE, "utf8")) : [];
  all.push({ run: RUN_ID, kind, id, cleaned: false, ...extra });
  writeFileSync(CREATED_FILE, JSON.stringify(all, null, 2));
}

/** Seed ids (fixed, from femxo-backend/seed-ids.json). */
export const SEED = {
  warehouses: { PAT: "5eed00070000000000000001", GAY: "5eed00070000000000000002", MUZ: "5eed00070000000000000003" },
  brand: "5eed00030000000000000001",
  category: "5eed00040000000000000006",
  products: { sunflowerOil: "5eed00050000000000000001", greenTea: "5eed00050000000000000006" },
  variants: { sunflowerOil1: "5eed0006000000000000000b" },
} as const;

export const productBody = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  description: "created by the integration suite",
  brandId: SEED.brand,
  categoryId: SEED.category,
  hsnCode: "1905",
  gstRateBp: 500,
  tracking: "none",
  variants: [
    { measure: { amount: 500, unit: "g" }, prices: { purchase: 800, dealer: 870, subDealer: 900, prime: 940, selling: 970, mrp: 1000 } },
  ],
  ...extra,
});
