import { Crown } from "lucide-react";
import type { PrimeMembership } from "@femxo/shared/contracts";

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** The member's card: who, which plan, since when and until when. */
export function MembershipCard({ subscription, name }: { subscription: NonNullable<PrimeMembership["subscription"]>; name: string }) {
  return (
    <section aria-label="Your Prime membership" className="overflow-hidden rounded-card bg-linear-to-br from-primary-deep via-brand to-brand-hover p-5 text-white">
      <div className="grid gap-3">
        <p className="inline-flex items-center gap-2 font-display text-lg font-bold">
          <Crown size={22} className="text-gold" aria-hidden="true" />
          Femxo Prime
        </p>
        {name ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-white/80">Member</p>
            <p className="text-xl font-bold">{name}</p>
          </div>
        ) : null}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-white/80">Plan</dt>
            <dd className="font-semibold">{subscription.planName}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/80">Member since</dt>
            <dd className="font-semibold">
              <time dateTime={subscription.startAt}>{DATE.format(new Date(subscription.startAt))}</time>
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-white/80">Valid till</dt>
            <dd className="font-semibold" data-testid="prime-valid-till">
              <time dateTime={subscription.endAt}>{DATE.format(new Date(subscription.endAt))}</time>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
