"use client";

import { Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { formatINR, packArtUrl } from "@femxo/shared";
import type { CartLine } from "@femxo/shared/contracts";
import { Badge, IconButton, QuantityStepper } from "@femxo/ui";
import { lineCeiling } from "../cart-ops";
import { useCart } from "./CartProvider";

const PROBLEMS: Record<string, string> = {
  VARIANT_NOT_FOUND: "This item isn't sold any more. Remove it to continue.",
  VARIANT_UNAVAILABLE: "This item isn't on sale right now. Remove it to continue.",
  PRICE_NOT_SET: "This item doesn't have a price for you yet. Remove it to continue.",
};

/** What is wrong with a line right now (a message), or null. Price changes are separate: they are shown, not blocking by themselves. */
export function lineProblem(line: CartLine): string | null {
  if (line.problem) return PROBLEMS[line.problem] ?? "This item can't be ordered right now. Remove it to continue.";
  if (line.available === 0 || line.inStock === false) return "Out of stock in your area. Remove it to continue.";
  if (line.sufficient === false) return line.available ? `Only ${line.available} left. Reduce the quantity to continue.` : "Not enough stock. Reduce the quantity to continue.";
  return null;
}

/** One item in the cart: picture, name and size, price (with a change flagged), quantity, line total, remove. */
export function CartLineItem({ line }: { line: CartLine }) {
  const { setQuantity, remove } = useCart();
  const [busy, setBusy] = useState(false);
  const name = line.product ? `${line.product.name}${line.variant ? `, ${line.variant.label}` : ""}` : "Item no longer listed";
  const problem = lineProblem(line);
  const ceiling = Math.max(lineCeiling(line), 1);
  const image = line.product?.image ?? packArtUrl({ name: "Item", brand: "Femxo", toneKey: line.variantId });

  async function run(action: Promise<unknown>) {
    setBusy(true);
    await action;
    setBusy(false);
  }

  return (
    <li aria-label={name} data-testid="cart-line" className="grid grid-cols-[5rem_1fr] gap-3 border-b border-line py-4 last:border-b-0 sm:grid-cols-[6rem_1fr]">
      <span className="relative block aspect-square overflow-hidden rounded-control bg-surface-sunken">
        <Image src={image} alt="" fill sizes="96px" className="object-contain p-1.5" />
      </span>
      <div className="grid content-start gap-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            {line.product ? <p className="text-xs text-ink-muted">{line.product.brand.name}</p> : null}
            {line.product ? (
              <Link href={`/p/${line.product.slug}`} className="text-sm font-semibold leading-snug hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus">
                {line.product.name}
              </Link>
            ) : (
              <p className="text-sm font-semibold leading-snug">{name}</p>
            )}
            {line.variant ? <p className="text-xs text-ink-muted">{line.variant.label}</p> : null}
          </div>
          <div className="text-right">
            <p className="font-bold tabular-nums">{line.lineTotal === null ? "—" : formatINR(line.lineTotal)}</p>
            {line.unitPrice !== null ? <p className="text-xs text-ink-muted">{formatINR(line.unitPrice)} each</p> : null}
          </div>
        </div>

        {line.priceChanged && line.unitPrice !== null ? (
          <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="price-changed">
            <Badge tone="warning">Price changed</Badge>
            <span>
              {line.previousUnitPrice !== null ? (
                <>
                  was <s className="text-ink-muted">{formatINR(line.previousUnitPrice)}</s>, now <strong>{formatINR(line.unitPrice)}</strong> each
                </>
              ) : (
                <>now {formatINR(line.unitPrice)} each</>
              )}
            </span>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {line.problem === null ? (
            <QuantityStepper value={line.quantity} max={ceiling} busy={busy} itemName={name} onChange={(next) => void run(setQuantity(line.variantId, next))} />
          ) : (
            <span />
          )}
          <IconButton label={`Remove ${name}`} icon={<Trash2 size={18} aria-hidden="true" />} disabled={busy} onClick={() => void run(remove(line.variantId))} />
        </div>

        {problem ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {problem}
          </p>
        ) : null}
      </div>
    </li>
  );
}
