// Cleans up after the integration suite, using only supported API operations:
//   draft transfers -> POST /inventory/transfers/:id/cancel
//   stock-ins       -> POST /inventory/movements/:id/reverse (the ledger is append-only; a reversal is the undo)
//   products        -> POST /catalog/admin/products/:id/archive (soft delete)
// It touches only records listed in e2e/results/created.json (written by the tests), never seed data.
// Then it verifies: no leftovers, ledger vs balances mismatch = 0, seed integrity (read-only mongosh).
//
//   node e2e/cleanup.mjs --snapshot   # before a run: record the seed baseline
//   node e2e/cleanup.mjs              # after a run: clean + verify
//   node e2e/cleanup.mjs --verify     # verify only
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (existsSync(".env.e2e")) process.loadEnvFile(".env.e2e");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/femxo_dev?replicaSet=rs0";
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@femxo.test";
const CREATED = "e2e/results/created.json";
const BASELINE = "e2e/results/seed-baseline.json";
const BUDGET = "e2e/results/.login-attempts.json";
const args = new Set(process.argv.slice(2));

const mongo = (script) => JSON.parse(execFileSync("mongosh", ["--quiet", MONGO_URI, "--eval", `EJSON.stringify((() => { ${script} })())`], { encoding: "utf8" }).trim());

const SEED_RANGE = `{ $gte: ObjectId("5eed00000000000000000000"), $lt: ObjectId("5eee00000000000000000000") }`;
const snapshot = () =>
  mongo(`
    const r = ${SEED_RANGE};
    const balances = db.stock_balances.aggregate([
      { $match: { variantId: r } }, { $group: { _id: null, total: { $sum: "$quantity" }, rows: { $sum: 1 } } }]).toArray()[0] ?? { total: 0, rows: 0 };
    return {
      users: db.users.countDocuments({ _id: r }), roles: db.roles.countDocuments({ _id: r }),
      products: db.products.countDocuments({ _id: r }), warehouses: db.warehouses.countDocuments({ _id: r }),
      seedProductsActive: db.products.countDocuments({ _id: r, status: "active" }),
      seedStockTotal: balances.total, seedStockRows: balances.rows,
    };`);

const ledgerMismatch = () =>
  mongo(`
    const ledger = db.stock_ledger.aggregate([{ $group: { _id: { w: "$warehouseId", v: "$variantId", b: "$batchId", k: "$bucket" }, sum: { $sum: "$quantity" } } }]).toArray();
    const sums = new Map(ledger.map((l) => [JSON.stringify(l._id), l.sum]));
    let bad = 0;
    db.stock_balances.find().forEach((b) => {
      const key = JSON.stringify({ w: b.warehouseId, v: b.variantId, b: b.batchId, k: b.bucket });
      if ((sums.get(key) ?? 0) !== b.quantity) bad++;
      sums.delete(key);
    });
    for (const sum of sums.values()) if (sum !== 0) bad++;
    return { mismatches: bad, balanceRows: db.stock_balances.countDocuments() };`);

if (args.has("--snapshot")) {
  writeFileSync(BASELINE, JSON.stringify({ takenAt: new Date().toISOString(), ...snapshot() }, null, 2));
  console.log("seed baseline saved:", readFileSync(BASELINE, "utf8"));
  process.exit(0);
}

const created = existsSync(CREATED) ? JSON.parse(readFileSync(CREATED, "utf8")) : [];
const pending = created.filter((c) => !c.cleaned);
const log = [];

async function adminToken() {
  // Respect the login limit shared with the tests: 30 attempts per IP per 15 min.
  const stamps = (existsSync(BUDGET) ? JSON.parse(readFileSync(BUDGET, "utf8")) : []).filter((t) => Date.now() - t < 15 * 60_000);
  if (stamps.length >= 29) {
    const wait = stamps[0] + 15 * 60_000 - Date.now() + 1000;
    console.log(`login budget full; waiting ${Math.ceil(wait / 1000)}s`);
    await new Promise((r) => setTimeout(r, wait));
  }
  writeFileSync(BUDGET, JSON.stringify([...stamps, Date.now()]));
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) throw new Error("E2E_ADMIN_PASSWORD is not set");
  const res = await fetch(`${BASE_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: EMAIL, password }) });
  if (res.status !== 200) throw new Error(`admin login failed: HTTP ${res.status}`);
  return (await res.json()).accessToken;
}

async function call(token, method, path, body, key) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let code;
  try { code = (await res.clone().json()).error?.code; } catch { /* no body */ }
  return { status: res.status, code };
}

if (!args.has("--verify") && pending.length) {
  const token = await adminToken();
  const order = { transfer: 0, movement: 1, product: 2 };
  for (const item of [...pending].sort((a, b) => order[a.kind] - order[b.kind])) {
    const result =
      item.kind === "transfer" ? await call(token, "POST", `/inventory/transfers/${item.id}/cancel`, { reason: "Remove integration test data" }, `e2e-cleanup-${item.id}`)
      : item.kind === "movement" ? await call(token, "POST", `/inventory/movements/${item.id}/reverse`, { reason: "Remove integration test data" }, `e2e-cleanup-${item.id}`)
      : await call(token, "POST", `/catalog/admin/products/${item.id}/archive`);
    // 2xx = done now; 409 = already archived/cancelled/reversed by an earlier cleanup.
    const done = result.status < 300 || result.status === 409;
    if (done) item.cleaned = true;
    log.push(`${item.kind.padEnd(8)} ${item.id}  HTTP ${result.status} ${result.code ?? ""}  ${done ? "cleaned" : "NOT cleaned"}`);
  }
  writeFileSync(CREATED, JSON.stringify(created, null, 2));
}
log.forEach((l) => console.log(l));

// ---------------------------------------------------------------- verification
const ids = (kind) => created.filter((c) => c.kind === kind).map((c) => c.id);
const objectIds = (list) => `[${list.map((i) => `ObjectId("${i}")`).join(",")}]`;
const leftovers = mongo(`
  return {
    products: db.products.countDocuments({ _id: { $in: ${objectIds(ids("product"))} }, status: { $ne: "archived" } }),
    draftTransfers: db.stock_transfers.countDocuments({ _id: { $in: ${objectIds(ids("transfer"))} }, status: "draft" }),
    unreversedMovements: ${ids("movement").length} - db.stock_reversals.countDocuments({ movementId: { $in: ${objectIds(ids("movement"))} } }),
    namedProductsNotArchived: db.products.countDocuments({ name: /^E2E Product /, status: { $ne: "archived" } }),
  };`);
const ledger = ledgerMismatch();
const seedNow = snapshot();
const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;
const seedOk = seedNow.users === 8 && seedNow.products === 10 && seedNow.warehouses === 3 && seedNow.roles === 4;
const baselineOk = base ? ["seedStockTotal", "seedStockRows", "seedProductsActive"].every((k) => base[k] === seedNow[k]) : null;

const result = {
  cleaned: created.filter((c) => c.cleaned).length,
  tracked: created.length,
  leftovers,
  ledgerMismatches: ledger.mismatches,
  seed: { ...seedNow, countsOk: seedOk, unchangedSinceBaseline: baselineOk },
};
result.pass =
  Object.values(leftovers).every((n) => n === 0) && ledger.mismatches === 0 && seedOk && baselineOk !== false && created.every((c) => c.cleaned);
writeFileSync("e2e/results/cleanup-result.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.pass ? "CLEANUP: PASS" : "CLEANUP: FAIL");
process.exit(result.pass ? 0 : 1);
