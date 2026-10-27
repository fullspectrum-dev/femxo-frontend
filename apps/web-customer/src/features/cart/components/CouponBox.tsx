"use client";

import { Tag, X } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { Button, TextField } from "@femxo/ui";
import { couponRefusalCopy } from "../coupon-copy";
import { useCart } from "./CartProvider";

/** Apply or remove a coupon. A refusal says why, in words the shopper can act on. */
export function CouponBox() {
  const { cart, applyCoupon, removeCoupon } = useCart();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (!cart) return null;

  const itemsTotal = cart.breakup.mrpTotal - cart.breakup.discount - cart.breakup.primeSavings;

  async function apply(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) {
      setError("Enter a coupon code.");
      return;
    }
    setBusy(true);
    setError(undefined);
    const result = await applyCoupon(code.trim());
    setBusy(false);
    if (result.ok) setCode("");
    else setError(couponRefusalCopy(result.reason, { minCart: result.minCart, itemsTotal, fallback: result.message }));
  }

  return (
    <section aria-labelledby="coupon-heading" className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 id="coupon-heading" className="flex items-center gap-2 text-base font-semibold">
        <Tag size={18} className="text-primary" aria-hidden="true" />
        Coupon
      </h2>
      {cart.coupon ? (
        <div className="flex items-center justify-between gap-3 rounded-control bg-success-soft px-3 py-2 text-sm text-success">
          <p>
            <span className="font-bold">{cart.coupon.code}</span> applied: {cart.coupon.label}
          </p>
          <button
            type="button"
            aria-label="Remove coupon"
            onClick={() => void removeCoupon()}
            className="grid size-8 flex-none place-items-center rounded-full hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <form onSubmit={apply} noValidate className="flex items-start gap-2">
          <TextField
            label="Coupon code"
            value={code}
            error={error}
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            className="flex-1"
          />
          <Button type="submit" variant="secondary" busy={busy} className="mt-[26px]">
            Apply
          </Button>
        </form>
      )}
    </section>
  );
}
