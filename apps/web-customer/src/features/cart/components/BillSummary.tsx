import { formatINR } from "@femxo/shared";
import type { Cart } from "@femxo/shared/contracts";

function Row({ label, value, tone }: { label: string; value: string; tone?: "saving" }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={tone === "saving" ? "font-medium text-success" : "font-medium"}>{value}</dd>
    </div>
  );
}

/** The bill: MRP, each saving, delivery, what is payable, the GST inside it, and what the shopper saved. */
export function BillSummary({ cart }: { cart: Pick<Cart, "breakup" | "itemCount" | "coupon"> }) {
  const { breakup, itemCount, coupon } = cart;
  const gst = breakup.gstIncluded.cgst + breakup.gstIncluded.sgst;

  return (
    <section aria-labelledby="bill-heading" className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 id="bill-heading" className="text-base font-semibold">
        Price details
      </h2>
      <dl className="grid gap-2 text-sm">
        <Row label={`Price (${itemCount} ${itemCount === 1 ? "item" : "items"})`} value={formatINR(breakup.mrpTotal)} />
        {breakup.discount > 0 ? <Row label="Discount" value={`− ${formatINR(breakup.discount)}`} tone="saving" /> : null}
        {breakup.primeSavings > 0 ? <Row label="Prime savings" value={`− ${formatINR(breakup.primeSavings)}`} tone="saving" /> : null}
        {breakup.couponDiscount > 0 ? <Row label={`Coupon (${coupon?.code ?? ""})`} value={`− ${formatINR(breakup.couponDiscount)}`} tone="saving" /> : null}
        <Row label="Delivery" value={breakup.delivery === 0 ? "Free" : formatINR(breakup.delivery)} tone={breakup.delivery === 0 ? "saving" : undefined} />
        <div className="flex justify-between gap-3 border-t border-line pt-3 text-base">
          <dt className="font-bold">Total</dt>
          <dd className="font-bold">{formatINR(breakup.total)}</dd>
        </div>
      </dl>
      <p className="text-xs text-ink-muted">
        Includes {formatINR(gst)} GST (CGST {formatINR(breakup.gstIncluded.cgst)} + SGST {formatINR(breakup.gstIncluded.sgst)}).
      </p>
      {breakup.youSave > 0 ? <p className="rounded-control bg-success-soft px-3 py-2 text-sm font-semibold text-success">You save {formatINR(breakup.youSave)} on this order</p> : null}
    </section>
  );
}
