"use client";

import { Cake, Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PrimeApi } from "@femxo/shared/api";
import type { BirthdayReward } from "@femxo/shared/contracts";
import { Button, useToast } from "@femxo/ui";
import { useSession } from "@/features/auth/components/SessionProvider";
import { getPrimeApi } from "@/lib/api";
import { copyText } from "../copy";

/**
 * On a member's birthday (when their plan includes it): a banner with a
 * coupon, across the whole site. It asks only members, and shows nothing
 * on any other day.
 */
export function BirthdayBanner({ prime }: { prime?: PrimeApi }) {
  const { status, user } = useSession();
  const toast = useToast();
  const apiRef = useRef(prime);
  const [reward, setReward] = useState<BirthdayReward | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const memberId = status === "signed-in" && user?.isPrime ? user.id : null;

  useEffect(() => {
    if (!memberId) return;
    let cancelled = false;
    (apiRef.current ??= getPrimeApi())
      .birthday()
      .then((result) => !cancelled && setReward(result))
      .catch(() => undefined); // a greeting is a nicety: stay quiet if it can't load
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  if (!memberId || !reward || dismissed) return null;

  return (
    <aside aria-label="Birthday reward" className="border-b border-gold bg-gold-soft">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <Cake size={20} className="flex-none text-gold-deep" aria-hidden="true" />
        <p className="flex-1 font-medium">
          {reward.message} Use <span className="font-bold">{reward.coupon.code}</span>: {reward.coupon.label}.
        </p>
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Copy code ${reward.coupon.code}`}
          onClick={async () => toast((await copyText(reward.coupon.code)) ? "Code copied" : `Your code is ${reward.coupon.code}`)}
        >
          <Copy size={14} aria-hidden="true" />
          Copy code
        </Button>
        <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)} className="grid size-8 place-items-center rounded-full hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
