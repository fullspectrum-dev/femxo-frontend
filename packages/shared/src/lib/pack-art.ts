/*
 * Pack art: a drawn product pack carrying the product's real name and brand,
 * used until a photo is uploaded in admin. One look for the whole catalogue
 * (the storefront's old illustration style), never a stock photo of somebody
 * else's brand. Pure functions: the URL is built by the catalog adapter and the
 * SVG is drawn by the storefront's /art route.
 */

export type PackShape = "pouch" | "bottle" | "box" | "jar" | "pot";

/** Pack colours, chosen per top-level category so a shelf reads as one family. The art is transparent, so it sits on the page surface in light and dark mode. */
const TONES = [
  { pack: "#b8862f", deep: "#7d5a1c" }, // grain gold
  { pack: "#2f7d5b", deep: "#1d5a40" }, // leaf green
  { pack: "#c2452d", deep: "#8a2b1b" }, // chilli red
  { pack: "#3a6bb8", deep: "#244a85" }, // river blue
  { pack: "#6c35a5", deep: "#45216f" }, // Femxo purple
  { pack: "#d9822b", deep: "#9a5612" }, // turmeric orange
  { pack: "#4f5d6b", deep: "#323c46" }, // steel grey
] as const;

const SHAPE_WORDS: [PackShape, RegExp][] = [
  ["bottle", /\b(oils?|juices?|drinks?|soda|cola|shampoo|wash|cleaners?|lotion|ghee|vinegar|sauce|syrup|beverages?|care|cleaning)\b/i],
  ["jar", /\b(masalas?|powders?|seeds?|pepper|jeera|cumin|haldi|turmeric|chilli|coffee|teas?|pickles?|honey|jam|spices?)\b/i],
  ["box", /\b(biscuits?|cookies?|chips|namkeen|peanuts?|bhujia|noodles|pasta|soap|bar|kit|hamper|gift|snacks?)\b/i],
  ["pot", /\b(tawa|cooker|pan|kadai|box|tumbler|bottle|plate|bowl|glass|utensils?|steel|kitchenware|cookware)\b/i],
];

/** Which pack fits the product, from its name. Rice, atta, dal, salt and sugar fall through to a pouch. */
export function packShape(name: string): PackShape {
  // Kitchenware first: "Steel Lunch Box" is a pot-like thing, not a biscuit box.
  if (SHAPE_WORDS[3]![1].test(name)) return "pot";
  for (const [shape, words] of SHAPE_WORDS) if (words.test(name)) return shape;
  return "pouch";
}

/** A stable small number from a string (same category → same tone on every build and server). */
export function toneIndex(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % TONES.length;
}

/** The art URL for a product. Ends in ".svg" so next/image serves it as-is instead of trying to optimise it. */
export function packArtUrl({ name, brand, toneKey }: { name: string; brand: string; toneKey: string }): string {
  return `/art/${packShape(name)}-${toneIndex(toneKey)}/${encodeURIComponent(brand)}/${encodeURIComponent(name)}.svg`;
}

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Breaks a name into at most three lines of roughly `width` characters. */
function lines(text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + word).length > width) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  if (out.length > 3) return [...out.slice(0, 2), `${out.slice(2).join(" ").slice(0, width - 1)}…`];
  return out;
}

/** Pack outline (body path) and the label box, on an 800×800 canvas. */
const SHAPES: Record<PackShape, { body: string; cap?: string; label: { x: number; y: number; w: number; h: number } }> = {
  pouch: {
    body: "M250 190 Q400 160 550 190 L580 640 Q400 680 220 640 Z",
    cap: "M250 190 Q400 160 550 190 L555 240 Q400 212 245 240 Z",
    label: { x: 250, y: 315, w: 300, h: 240 },
  },
  bottle: {
    body: "M350 120 H450 V200 Q560 250 560 360 V640 Q560 670 530 670 H270 Q240 670 240 640 V360 Q240 250 350 200 Z",
    cap: "M340 90 H460 V140 H340 Z",
    label: { x: 255, y: 370, w: 290, h: 230 },
  },
  box: {
    body: "M210 230 H590 Q610 230 610 250 V630 Q610 650 590 650 H210 Q190 650 190 630 V250 Q190 230 210 230 Z",
    cap: "M190 250 Q190 230 210 230 H590 Q610 230 610 250 V290 H190 Z",
    label: { x: 222, y: 320, w: 356, h: 260 },
  },
  jar: {
    body: "M260 260 H540 Q580 260 580 300 V620 Q580 660 540 660 H260 Q220 660 220 620 V300 Q220 260 260 260 Z",
    cap: "M270 180 H530 Q550 180 550 200 V262 H250 V200 Q250 180 270 180 Z",
    label: { x: 240, y: 340, w: 320, h: 250 },
  },
  pot: {
    body: "M200 330 H600 L570 610 Q560 660 510 660 H290 Q240 660 230 610 Z",
    cap: "M180 300 H620 Q635 300 635 315 V340 H165 V315 Q165 300 180 300 Z M370 250 H430 Q445 250 445 265 V300 H355 V265 Q355 250 370 250 Z",
    label: { x: 250, y: 380, w: 300, h: 210 },
  },
};

/** The pack as an SVG document. Fonts are system ones: an SVG served as an image can't load web fonts. */
export function renderPackSvg({ shape, tone, brand, name }: { shape: PackShape; tone: number; brand: string; name: string }): string {
  const t = TONES[((tone % TONES.length) + TONES.length) % TONES.length]!;
  const s = SHAPES[shape];
  const { x, y, w, h } = s.label;
  // Sized to stay legible when a card shows the art at ~150px: big type, few words per line.
  const nameLines = lines(name, shape === "box" ? 14 : 12);
  const size = nameLines.length > 2 ? 40 : 48;
  const gap = size + 4;
  const block = nameLines.length * gap;
  const top = y + 64 + (h - 64 - block) / 2 + size * 0.8;
  const font = "Helvetica, Arial, sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="100 90 600 600" role="img" aria-label="${escapeXml(`${brand} ${name}`)}">
<ellipse cx="400" cy="672" rx="220" ry="16" fill="#000" opacity="0.08"/>
<path d="${s.body}" fill="${t.pack}"/>
${s.cap ? `<path d="${s.cap}" fill="${t.deep}"/>` : ""}
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="#fffdf9"/>
<text x="400" y="${y + 48}" text-anchor="middle" font-family="${font}" font-size="24" font-weight="700" letter-spacing="2.5" fill="${t.deep}">${escapeXml(brand.toUpperCase())}</text>
${nameLines.map((l, i) => `<text x="400" y="${top + i * gap}" text-anchor="middle" font-family="${font}" font-size="${size}" font-weight="700" fill="#14101c">${escapeXml(l)}</text>`).join("\n")}
</svg>`;
}
