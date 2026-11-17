import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STORE_BANNERS } from "./store-adapter";

const PUBLIC_DIR = resolve(__dirname, "../../../../../apps/web-customer/public");

describe("STORE_BANNERS", () => {
  it("has unique ids and a real image file for every banner", () => {
    expect(new Set(STORE_BANNERS.map((b) => b.id)).size).toBe(STORE_BANNERS.length);
    for (const banner of STORE_BANNERS) {
      expect(existsSync(resolve(PUBLIC_DIR, banner.image.replace(/^\//, ""))), `${banner.image} is missing`).toBe(true);
    }
  });

  it("serves optimised WebP, not raw artwork, and links within the site", () => {
    for (const banner of STORE_BANNERS) {
      expect(banner.image).toMatch(/^\/banners\/[a-z-]+\.webp$/);
      expect(banner.href).toMatch(/^\//);
    }
  });
});
