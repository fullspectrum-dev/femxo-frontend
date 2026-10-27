"use client";

import { Copy, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatINR } from "@femxo/shared";
import type { PrimeApi } from "@femxo/shared/api";
import type { Coupon, Referral } from "@femxo/shared/contracts";
import { Button, Skeleton, useToast } from "@femxo/ui";
import { getPrimeApi } from "@/lib/api";
import { copyText } from "../copy";

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** Member-only coupons, each with a button to copy its code. */
export function PrimeCoupons({ prime }: { prime?: PrimeApi }) {
  const toast = useToast();
  const apiRef = useRef(prime);
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (apiRef.current ??= getPrimeApi())
      .coupons()
      .then((list) => !cancelled && setCoupons(list))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-labelledby="prime-coupons" className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-card md:p-5">
      <h2 id="prime-coupons" className="text-lg font-semibold">
        Your Prime coupons
      </h2>
      {failed ? <p className="text-sm text-danger">We couldn&apos;t load your coupons right now.</p> : null}
      {!coupons && !failed ? <Skeleton className="h-16 w-full" /> : null}
      {coupons?.length === 0 ? <p className="text-sm text-ink-muted">No Prime coupons right now. Check back soon.</p> : null}
      <ul className="grid gap-2">
        {coupons?.map((coupon) => (
          <li key={coupon.code} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-dashed border-gold-deep bg-gold-soft px-3 py-2">
            <div className="text-sm">
              <p className="font-mono text-base font-bold tracking-wide">{coupon.code}</p>
              <p>{coupon.label}</p>
              <p className="text-xs text-ink-muted">
                Orders above {formatINR(coupon.minCart)} · valid till {DATE.format(new Date(coupon.validTill))}
              </p>
            </div>
            <Button size="sm" variant="secondary" aria-label={`Copy code ${coupon.code}`} onClick={async () => toast((await copyText(coupon.code)) ? "Code copied" : `Your code is ${coupon.code}`)}>
              <Copy size={14} aria-hidden="true" />
              Copy
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The member's referral link, and how many friends it has brought. */
export function ReferralCard({ prime }: { prime?: PrimeApi }) {
  const toast = useToast();
  const apiRef = useRef(prime);
  const [referral, setReferral] = useState<Referral | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (apiRef.current ??= getPrimeApi())
      .referral()
      .then((result) => !cancelled && setReferral(result))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <section aria-label="Refer a friend" className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-card md:p-5">
      <h2 className="text-lg font-semibold">Refer a friend</h2>
      {failed ? <p className="text-sm text-danger">We couldn&apos;t load your referral link right now.</p> : null}
      {!referral && !failed ? <Skeleton className="h-20 w-full" /> : null}
      {referral ? (
        <>
          <p className="text-sm text-ink-muted">Share your link. When a friend joins Femxo through it, you both get rewarded.</p>
          <p className="break-all rounded-control bg-surface-sunken px-3 py-2 font-mono text-sm">{referral.link}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={async () => toast((await copyText(referral.link)) ? "Link copied" : "Copy the link from above")}>
              <Copy size={14} aria-hidden="true" />
              Copy referral link
            </Button>
            {canShare ? (
              <Button variant="secondary" size="sm" onClick={() => void navigator.share({ title: "Join Femxo", text: "Shop on Femxo with my link:", url: referral.link }).catch(() => undefined)}>
                <Share2 size={14} aria-hidden="true" />
                Share
              </Button>
            ) : null}
          </div>
          <dl className="grid grid-cols-3 gap-3 border-t border-line pt-3 text-center">
            <div>
              <dd className="text-xl font-bold">{referral.invited}</dd>
              <dt className="text-xs text-ink-muted">Invited</dt>
            </div>
            <div>
              <dd className="text-xl font-bold">{referral.joined}</dd>
              <dt className="text-xs text-ink-muted">Joined</dt>
            </div>
            <div>
              <dd className="text-xl font-bold">{formatINR(referral.rewardsEarned)}</dd>
              <dt className="text-xs text-ink-muted">Rewards earned</dt>
            </div>
          </dl>
        </>
      ) : null}
    </section>
  );
}
