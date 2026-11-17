/*
 * Money is held in integer paise everywhere (the backend does the same), and
 * only turned into rupees for display, with Indian digit grouping.
 */

const RUPEES = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const COUNT = new Intl.NumberFormat("en-IN");
const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kolkata",
});

/** 12400000 → "₹1,24,000". */
export function formatINR(paise: number) {
  return `₹${RUPEES.format(Math.round(paise / 100))}`;
}

/** Like formatINR but keeps the paise when there are any: 9950 → "₹99.50", 12400000 → "₹1,24,000". For payments and refunds, where a rounded rupee would mislead. */
export function formatINRExact(paise: number) {
  const whole = paise % 100 === 0;
  return `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(paise / 100)}`;
}

/** 186000000000 → "₹18.6 Cr", 4280000000 → "₹42.8 L"; smaller amounts in full. */
export function formatINRCompact(paise: number) {
  const rupees = paise / 100;
  const trim = (value: number) => value.toFixed(1).replace(/\.0$/, "");
  if (Math.abs(rupees) >= 1_00_00_000) return `₹${trim(rupees / 1_00_00_000)} Cr`;
  if (Math.abs(rupees) >= 1_00_000) return `₹${trim(rupees / 1_00_000)} L`;
  return formatINR(paise);
}

/** Axis ticks, tight: 2000000000 → "₹2Cr", 4280000000 → "₹42.8L" … "₹12K", "₹0". */
export function formatINRTick(paise: number) {
  const rupees = paise / 100;
  const trim = (value: number) => value.toFixed(1).replace(/\.0$/, "");
  if (rupees >= 1_00_00_000) return `₹${trim(rupees / 1_00_00_000)}Cr`;
  if (rupees >= 1_00_000) return `₹${trim(rupees / 1_00_000)}L`;
  if (rupees >= 1_000) return `₹${trim(rupees / 1_000)}K`;
  return `₹${Math.round(rupees)}`;
}

/** 482310 → "4,82,310". */
export function formatCount(value: number) {
  return COUNT.format(value);
}

/** ISO date → "12 Oct 2026" (IST). */
export function formatDate(iso: string) {
  return DATE.format(new Date(iso));
}

/** ISO date-time → "23 Oct, 10:42" (IST). */
export function formatDateTime(iso: string) {
  return DATE_TIME.format(new Date(iso));
}

/** 500 → "5%". GST rates are stored in basis points. */
export function formatPercentBps(bps: number) {
  return `${bps / 100}%`;
}

/** "Munni Singh" → "MS". */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
