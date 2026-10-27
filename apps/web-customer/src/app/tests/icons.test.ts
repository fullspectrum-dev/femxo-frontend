import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ICONS } from "../icons";

const PUBLIC = join(__dirname, "../../../public");
const files = () => {
  const urls = [...ICONS.icon.map((icon) => icon.url), ICONS.apple];
  return urls.map((url) => ({ url, path: join(PUBLIC, url.split("?")[0]!) }));
};

describe("the storefront's favicon and app icons", () => {
  it("point at files that exist in public/", () => {
    for (const { url, path } of files()) expect(existsSync(path), url).toBe(true);
  });

  it("are real images of the sizes they claim", () => {
    for (const icon of ICONS.icon) {
      if (!icon.url.includes(".png")) continue;
      const png = readFileSync(join(PUBLIC, icon.url.split("?")[0]!));
      expect(png.subarray(1, 4).toString(), icon.url).toBe("PNG");
      const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
      expect(`${width}x${height}`, icon.url).toBe(icon.sizes);
    }
  });

  it("include a .ico for browsers that ask for /favicon.ico, and a PNG of 48px or more for search results", () => {
    expect(ICONS.icon.some((icon) => icon.url.startsWith("/favicon.ico"))).toBe(true);
    expect(ICONS.icon.some((icon) => icon.url.includes(".png") && Number.parseInt(icon.sizes) >= 48)).toBe(true);
  });
});
