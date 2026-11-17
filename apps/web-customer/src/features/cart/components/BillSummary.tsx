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

/** What the lines cost at MRP, and so what the shopper saves; lines the catalogue does not know count at their own price. */
export function billOf(cart: Pick<Cart, "lines" | "subtotal">) {
  const mrpTotal = cart.lines.reduce((sum, l) => sum + Math.max(l.variant?.mrp ?? 0, l.unitPrice ?? 0) * l.quantity, 0);
  return { mrpTotal, discount: Math.max(mrpTotal - cart.subtotal, 0) };
}

/** The bill the server priced: MRP, the saving, delivery and what is payable. Prices include GST. */
export function BillSummary({ cart }: { cart: Pick<Cart, "lines" | "subtotal" | "delivery" | "total" | "itemCount"> }) {
  const { mrpTotal, discount } = billOf(cart);
  return (
    <section aria-labelledby="bill-heading" className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 id="bill-heading" className="text-base font-semibold">
        Price details
      </h2>
      <dl className="grid gap-2 text-sm">
        <Row label={`Price (${cart.itemCount} ${cart.itemCount === 1 ? "item" : "items"})`} value={formatINR(mrpTotal)} />
        {discount > 0 ? <Row label="Discount" value={`− ${formatINR(discount)}`} tone="saving" /> : null}
        <Row label="Delivery" value={cart.delivery === 0 ? "Free" : formatINR(cart.delivery)} tone={cart.delivery === 0 ? "saving" : undefined} />
        <div className="flex justify-between gap-3 border-t border-line pt-3 text-base">
          <dt className="font-bold">Total</dt>
          <dd className="font-bold" data-testid="bill-total">
            {formatINR(cart.total)}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-ink-muted">Prices include GST.</p>
      {discount > 0 ? <p className="rounded-control bg-success-soft px-3 py-2 text-sm font-semibold text-success">You save {formatINR(discount)} on this order</p> : null}
    </section>
  );
}
