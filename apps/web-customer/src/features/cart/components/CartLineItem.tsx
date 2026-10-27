"use client";

import { Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { formatINR } from "@femxo/shared";
import type { CartLine } from "@femxo/shared/contracts";
import { IconButton, QuantityStepper } from "@femxo/ui";
import { useCart } from "./CartProvider";

/** What is wrong with a line's quantity right now, if anything. */
export function lineProblem(line: CartLine) {
  if (line.available === 0) return "Out of stock. Remove it to continue.";
  if (line.available < line.quantity) return `Only ${line.available} left. Reduce the quantity to continue.`;
  return null;
}

/** One item in the cart: picture, name and size, quantity, line total, remove. */
export function CartLineItem({ line }: { line: CartLine }) {
  const { setQuantity, remove } = useCart();
  const [busy, setBusy] = useState(false);
  const name = `${line.product.name}, ${line.variant.label}`;
  const problem = lineProblem(line);
  const max = Math.max(Math.min(line.available, line.variant.maxPerOrder), 1);

  async function run(action: Promise<unknown>) {
    setBusy(true);
    await action;
    setBusy(false);
  }

  return (
    <li aria-label={name} className="grid grid-cols-[5rem_1fr] gap-3 border-b border-line py-4 last:border-b-0 sm:grid-cols-[6rem_1fr]">
      <Link href={`/p/${line.product.slug}`} tabIndex={-1} aria-hidden="true" className="relative block aspect-square overflow-hidden rounded-control bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus">
        <Image src={line.product.image} alt="" fill sizes="96px" className="object-cover" />
      </Link>
      <div className="grid content-start gap-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-ink-muted">{line.product.brand.name}</p>
            <Link href={`/p/${line.product.slug}`} className="text-sm font-semibold leading-snug hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus">
              {line.product.name}
            </Link>
            <p className="text-xs text-ink-muted">{line.variant.label}</p>
          </div>
          <div className="text-right">
            <p className="font-bold">{formatINR(line.lineTotal)}</p>
            <p className="text-xs text-ink-muted">{formatINR(line.unitPrice)} each</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <QuantityStepper
            value={line.quantity}
            max={max}
            busy={busy}
            itemName={name}
            onChange={(next) => void run(setQuantity(line.id, next))}
          />
          <IconButton label={`Remove ${name}`} icon={<Trash2 size={18} aria-hidden="true" />} disabled={busy} onClick={() => void run(remove(line.id))} />
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
