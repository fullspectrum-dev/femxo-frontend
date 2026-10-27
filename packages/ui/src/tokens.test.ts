import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./test-utils/contrast";

const SRC = join(import.meta.dirname);
const css = readFileSync(join(SRC, "tokens.css"), "utf8");

/** `--name: value;` pairs inside the @theme block. */
const tokens = new Map(
  [...(/@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "").matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()])
);
const color = (name: string) => {
  const value = tokens.get(`color-${name}`);
  if (!value) throw new Error(`Missing token --color-${name}`);
  return value;
};

describe("design tokens", () => {
  it("define the Femxo brand colours exactly", () => {
    expect(color("primary").toLowerCase()).toBe("#6c35a5");
    expect(color("primary-deep").toLowerCase()).toBe("#45216f");
    expect(color("gold").toLowerCase()).toBe("#ffc45e");
    expect(color("ink").toLowerCase()).toBe("#12071f");
  });

  it("define the fonts, radii and shadows components rely on", () => {
    for (const name of ["font-sans", "font-display", "radius-card", "radius-control", "shadow-key", "shadow-key-gold", "shadow-key-neutral", "shadow-card", "shadow-raised"]) {
      expect(tokens.has(name), `--${name}`).toBe(true);
    }
  });

  // Normal text needs 4.5:1 (WCAG 1.4.3 AA).
  const TEXT_PAIRS: [string, string][] = [
    ["ink", "canvas"], ["ink", "surface"], ["ink", "surface-sunken"],
    ["ink-muted", "canvas"], ["ink-muted", "surface"], ["ink-muted", "surface-sunken"],
    ["on-primary", "primary"], ["on-primary", "primary-hover"], ["on-primary", "primary-deep"],
    ["on-gold", "gold"], ["primary", "surface"], ["primary", "canvas"], ["primary", "primary-soft"],
    ["success", "surface"], ["success", "success-soft"], ["warning", "warning-soft"],
    ["danger", "surface"], ["danger", "danger-soft"], ["info", "info-soft"], ["ink", "gold-soft"],
    // White text on the rating chip and the danger button.
    ["on-primary", "success"], ["on-primary", "danger"],
  ];
  it.each(TEXT_PAIRS)("%s text on %s passes AA (4.5:1)", (fg, bg) => {
    expect(contrastRatio(color(fg), color(bg))).toBeGreaterThanOrEqual(4.5);
  });

  // Input borders and the focus ring are the only cue for their control: 3:1 (WCAG 1.4.11).
  const UI_PAIRS: [string, string][] = [["line-input", "surface"], ["line-input", "canvas"], ["focus", "surface"], ["focus", "canvas"]];
  it.each(UI_PAIRS)("%s against %s passes non-text contrast (3:1)", (fg, bg) => {
    expect(contrastRatio(color(fg), color(bg))).toBeGreaterThanOrEqual(3);
  });

  it("every colour utility used by a component exists as a token", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) files.push(path);
      }
    };
    walk(SRC);
    const missing = new Set<string>();
    const utility = /\b(?:bg|text|border|ring|outline|fill|stroke|divide|from|via|to|decoration|placeholder|shadow)-(primary|gold|ink|canvas|surface|line|success|warning|danger|info|on|focus)(-[a-z0-9]+)*\b/g;
    for (const file of files) {
      for (const match of readFileSync(file, "utf8").matchAll(utility)) {
        const name = match[0].replace(/^[a-z]+-/, "");
        const kind = match[0].startsWith("shadow-") ? "shadow" : "color";
        if (!tokens.has(`${kind}-${name}`)) missing.add(`${match[0]} (${file.slice(SRC.length + 1)})`);
      }
    }
    expect([...missing]).toEqual([]);
  });
});

describe("dark palette", () => {
  const dark = new Map(
    [...(/\n\.dark\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "").matchAll(/--color-([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()])
  );

  it("overrides every colour token the light theme defines", () => {
    const light = [...tokens.keys()].filter((name) => name.startsWith("color-")).map((name) => name.slice(6));
    expect(light.filter((name) => !dark.has(name))).toEqual([]);
  });

  it.each(TEXT_PAIRS_DARK())("%s text on %s passes AA (4.5:1) in dark", (fg, bg) => {
    expect(contrastRatio(dark.get(fg)!, dark.get(bg)!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([["line-input", "surface"], ["line-input", "canvas"], ["focus", "surface"], ["focus", "canvas"]])("%s against %s passes 3:1 in dark", (fg, bg) => {
    expect(contrastRatio(dark.get(fg)!, dark.get(bg)!)).toBeGreaterThanOrEqual(3);
  });
});

function TEXT_PAIRS_DARK(): [string, string][] {
  return [
    ["ink", "canvas"], ["ink", "surface"], ["ink", "surface-sunken"],
    ["ink-muted", "canvas"], ["ink-muted", "surface"], ["ink-muted", "surface-sunken"],
    ["on-primary", "primary"], ["on-primary", "primary-hover"], ["on-gold", "gold"],
    ["primary", "surface"], ["primary", "canvas"], ["primary", "primary-soft"],
    ["success", "surface"], ["success", "success-soft"], ["warning", "warning-soft"],
    ["danger", "surface"], ["danger", "danger-soft"], ["info", "info-soft"], ["ink", "gold-soft"],
    ["on-primary", "success"], ["on-primary", "danger"],
  ];
}

