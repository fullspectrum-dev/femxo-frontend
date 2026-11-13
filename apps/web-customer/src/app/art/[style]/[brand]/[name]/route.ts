import { renderPackSvg } from "@femxo/shared";
import type { PackShape } from "@femxo/shared";

const SHAPES = new Set<PackShape>(["pouch", "bottle", "box", "jar", "pot"]);

/**
 * GET /art/<shape>-<tone>/<brand>/<name>.svg: the drawn pack for a product that
 * has no photo yet (see packArtUrl). Everything it shows comes from the URL, so
 * the answer never changes and can be cached for a year.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ style: string; brand: string; name: string }> }) {
  const { style, brand, name } = await params;
  const [shape, toneText] = style.split("-");
  const tone = Number(toneText);
  const title = decodeURIComponent(name).replace(/\.svg$/, "");
  if (!SHAPES.has(shape as PackShape) || !Number.isInteger(tone) || !title || title.length > 120 || brand.length > 120) {
    return new Response("Not found", { status: 404 });
  }
  const svg = renderPackSvg({ shape: shape as PackShape, tone, brand: decodeURIComponent(brand), name: title });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      // An SVG opened directly must not be able to run anything.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
