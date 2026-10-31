// Coverage gate. Maps every scenario in specs/integration/*.md to a test in
// e2e/integration/*.spec.ts and to its last run result (e2e/results/results.json).
//   - missing: a spec scenario with no test        -> gate FAIL
//   - orphan:  a test whose id is in no spec       -> gate FAIL
//   - wrong file: SPEC-X-nn tested outside SPEC-X.spec.ts -> gate FAIL
// Coverage (mapped / specified) is reported separately from the pass rate (passed / run).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const specDir = "specs/integration";
const testDir = "e2e/integration";
const resultsFile = "e2e/results/results.json";
const idRe = /SPEC-[A-Z]+-\d+/;

const specs = new Map(); // id -> { title, file }
for (const file of readdirSync(specDir).filter((f) => /^SPEC-.*\.md$/.test(f))) {
  for (const m of readFileSync(path.join(specDir, file), "utf8").matchAll(/^##\s+(SPEC-[A-Z]+-\d+):?\s*(.*)$/gm)) {
    specs.set(m[1], { title: m[2].trim(), file });
  }
}

const tests = new Map(); // id -> { title, file }
for (const file of readdirSync(testDir).filter((f) => f.endsWith(".spec.ts"))) {
  for (const m of readFileSync(path.join(testDir, file), "utf8").matchAll(/scenario\(\s*"(SPEC-[A-Z]+-\d+)"\s*,\s*"([^"]*)"/g)) {
    tests.set(m[1], { title: m[2], file });
  }
}

const outcome = new Map(); // id -> { status, retries, screenshot }
if (existsSync(resultsFile)) {
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      const id = idRe.exec(spec.title)?.[0];
      if (!id) continue;
      const results = spec.tests.flatMap((t) => t.results);
      const last = results.at(-1);
      outcome.set(id, { status: last?.status ?? "not-run", retries: results.length - 1 });
    }
    (suite.children ?? suite.suites ?? []).forEach(walk);
  };
  JSON.parse(readFileSync(resultsFile, "utf8")).suites.forEach(walk);
}

const missing = [...specs.keys()].filter((id) => !tests.has(id));
const orphan = [...tests.keys()].filter((id) => !specs.has(id));
const wrongFile = [...tests].filter(([id, t]) => specs.has(id) && t.file.replace(".spec.ts", "") !== specs.get(id).file.replace(".md", "")).map(([id]) => id);

const rows = [...specs].map(([id, spec]) => {
  const test = tests.get(id);
  const run = outcome.get(id);
  const shot = `e2e/results/screenshots/${id}.png`;
  return {
    id,
    spec: `${specDir}/${spec.file}`,
    title: spec.title,
    test: test ? `${testDir}/${test.file}` : null,
    status: test ? (run?.status ?? "not-run") : "no-test",
    retries: run?.retries ?? 0,
    screenshot: existsSync(shot) ? shot : null,
  };
});

const ran = rows.filter((r) => ["passed", "failed", "timedOut", "interrupted", "flaky"].includes(r.status));
const passed = rows.filter((r) => r.status === "passed").length;
const summary = {
  generatedAt: new Date().toISOString(),
  coverage: { specified: specs.size, mapped: specs.size - missing.length, percent: Math.round(((specs.size - missing.length) / specs.size) * 100), missing, orphan, wrongFile },
  passRate: { run: ran.length, passed, failed: ran.length - passed, percent: ran.length ? Math.round((passed / ran.length) * 100) : null },
  gate: missing.length || orphan.length || wrongFile.length ? "FAIL" : "PASS",
  scenarios: rows,
};
writeFileSync("e2e/results/traceability.json", JSON.stringify(summary, null, 2));

console.log(`coverage gate: ${summary.gate}  (${summary.coverage.mapped}/${summary.coverage.specified} scenarios mapped; missing ${missing.length}, orphan ${orphan.length}, wrong file ${wrongFile.length})`);
console.log(`pass rate:     ${summary.passRate.passed}/${summary.passRate.run} run passed (${summary.passRate.percent ?? "n/a"}%)`);
for (const r of rows) console.log(`  ${r.status.padEnd(9)} ${r.id}  ${r.title}`);
if (missing.length) console.log("MISSING:", missing.join(", "));
if (orphan.length) console.log("ORPHAN:", orphan.join(", "));
if (wrongFile.length) console.log("WRONG FILE:", wrongFile.join(", "));
process.exit(summary.gate === "PASS" ? 0 : 1);
