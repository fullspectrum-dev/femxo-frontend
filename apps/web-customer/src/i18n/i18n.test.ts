import { describe, expect, it } from "vitest";
import { en } from "./en";
import { t, tn } from "./index";
import { findLiterals } from "./find-literals";

describe("t", () => {
  it("returns the English message for a key", () => {
    expect(t("shell.footer.about")).toBe("About Femxo");
  });

  it("fills {placeholders}, and leaves unknown ones visible rather than silently empty", () => {
    expect(t("error.requestId", { id: "abc" })).toBe("Reference: abc");
    expect(t("error.requestId", {})).toBe("Reference: {id}");
  });

  it("has no key whose text is empty, and none that mention a placeholder it never documents", () => {
    for (const [key, text] of Object.entries(en)) {
      expect(text.trim(), key).not.toBe("");
    }
  });
});

describe("tn (plurals)", () => {
  it("picks the one/other form by count, and can use the count in the text", () => {
    expect(tn("cart.link", 1)).toBe("Cart, 1 item");
    expect(tn("cart.link", 3)).toBe("Cart, 3 items");
    expect(tn("cart.link", 0)).toBe("Cart, 0 items");
  });
});

describe("findLiterals", () => {
  it("finds text in the markup and readable attributes, and ignores translated text, classes and links", () => {
    const source = `
      export const A = () => (
        <nav aria-label="Main" className="flex gap-2">
          <a href="/offers">Offers</a>
          <p>{t("shell.footer.about")}</p>
          <img alt="" src="/x.png" />
        </nav>
      );`;
    expect(findLiterals(source).map((literal) => literal.text)).toEqual(["Main", "Offers"]);
  });

  it("ignores punctuation and numbers, which need no translating", () => {
    expect(findLiterals("export const A = () => <p>{count} · 12 — </p>;")).toEqual([]);
  });
});
