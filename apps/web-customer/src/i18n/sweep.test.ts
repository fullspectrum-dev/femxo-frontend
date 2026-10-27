import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findLiterals } from "./find-literals";

const walk = (path: string): string[] => {
  if (!statSync(path).isDirectory()) return path.endsWith(".tsx") ? [path] : [];
  return readdirSync(path).flatMap((name) => (name === "tests" ? [] : walk(join(path, name))));
};

const literalsIn = (path: string) =>
  walk(path).flatMap((file) => findLiterals(readFileSync(file, "utf8"), file).map((literal) => `${file.split("\\").join("/")}:${literal.line} "${literal.text}"`));

/**
 * Components ask for text through t() so a second language is a catalogue,
 * not a rewrite. These places are done: any English written straight into
 * them fails here.
 */
const MIGRATED = ["src/app", "src/features/shell", "src/features/cart/components/CartLink.tsx"];

/**
 * Places still to migrate, with how much hard-coded English each holds today.
 * A ratchet: the number may only go down, and a place leaves this list (and
 * joins MIGRATED) when it reaches zero. New components belong in MIGRATED
 * from the start.
 */
const LEGACY: Record<string, number> = {
  "src/features/account": 61,
  "src/features/addresses": 11,
  "src/features/auth": 30,
  "src/features/cart": 38,
  "src/features/catalog": 31,
  "src/features/checkout": 24,
  "src/features/devtools": 22,
  "src/features/orders": 41,
  "src/features/payments": 8,
  "src/features/prime": 44,
  "src/features/product": 23,
  "src/features/search": 4,
  "src/features/wishlist": 13,
};

describe("the message catalogue is used", () => {
  it.each(MIGRATED)("%s has no English written straight into its markup", (path) => {
    expect(literalsIn(path)).toEqual([]);
  });

  it.each(Object.entries(LEGACY))("%s holds no more hard-coded English than it did (%i)", (path, ceiling) => {
    expect(literalsIn(path).length).toBeLessThanOrEqual(ceiling);
  });

  it("every place with markup is either migrated or on the legacy list", () => {
    const covered = [...MIGRATED, ...Object.keys(LEGACY)];
    const features = readdirSync("src/features").map((name) => `src/features/${name}`);
    for (const feature of features) {
      const done = covered.some((path) => feature === path || feature.startsWith(`${path}/`) || path.startsWith(`${feature}/`));
      expect(done || literalsIn(feature).length === 0, `${feature} is not on either list`).toBe(true);
    }
  });
});
