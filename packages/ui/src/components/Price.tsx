import { discountPercent, formatINR } from "@femxo/shared";
import { Crown } from "lucide-react";
import { cn } from "../cn";

const SIZES = { sm: "text-base", md: "text-xl", lg: "text-3xl" } as const;

/**
 * Price block (amounts in paise). Shows what this shopper pays, the MRP
 * struck through with the saving, and the Prime price: as an offer to
 * non-members, or as the applied price for members.
 */
export function Price({
  price,
  mrp,
  primePrice,
  member = false,
  size = "md",
  hideDiscount = false,
  className,
}: {
  price: number;
  mrp?: number;
  primePrice?: number;
  member?: boolean;
  size?: keyof typeof SIZES;
  /** When the saving is already shown elsewhere (a product card's "% OFF" badge). */
  hideDiscount?: boolean;
  className?: string;
}) {
  const hasPrime = primePrice !== undefined && primePrice < price;
  const charged = member && hasPrime ? primePrice : price;
  const off = mrp ? discountPercent(mrp, charged) : 0;

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn("font-display font-bold tracking-tight text-ink tabular-nums", SIZES[size])}>{formatINR(charged)}</span>
        {mrp && mrp > charged ? (
          <del className="text-sm text-ink-muted">
            <span className="sr-only">MRP </span>
            <span>{formatINR(mrp)}</span>
          </del>
        ) : null}
        {off > 0 && !hideDiscount ? <span className="text-sm font-semibold text-success">{off}% off</span> : null}
      </p>
      {hasPrime ? (
        member ? (
          <p className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
            <Crown size={13} aria-hidden="true" />
            Prime price
          </p>
        ) : (
          <p className="inline-flex w-max items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold text-ink">
            <Crown size={13} aria-hidden="true" />
            {formatINR(primePrice)} with Prime
          </p>
        )
      ) : null}
    </div>
  );
}
