import qrcode from "qrcode-generator";

/**
 * A QR code drawn as SVG squares (no markup from the library is injected).
 * The label says what it holds, since the picture can't be read aloud.
 */
export function QrCode({ value, label, size = 160, className }: { value: string; label: string; size?: number; className?: string }) {
  const code = qrcode(0, "M");
  code.addData(value);
  code.make();
  const count = code.getModuleCount();
  const margin = 2;
  const cells: string[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (code.isDark(row, col)) cells.push(`M${col + margin} ${row + margin}h1v1h-1z`);
    }
  }
  const side = count + margin * 2;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${side} ${side}`} width={size} height={size} shapeRendering="crispEdges" className={className}>
      <rect width={side} height={side} fill="#ffffff" />
      <path d={cells.join("")} fill="#12071f" />
    </svg>
  );
}
