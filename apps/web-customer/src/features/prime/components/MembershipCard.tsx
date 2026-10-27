import { Crown } from "lucide-react";
import type { Membership } from "@femxo/shared/contracts";
import { QrCode } from "./QrCode";

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** The member's card: who, which plan, how long, and a QR code carrying the member number. */
export function MembershipCard({ membership, name }: { membership: Membership; name: string }) {
  return (
    <section aria-label="Your Prime membership" className="overflow-hidden rounded-card bg-linear-to-br from-primary-deep via-primary to-primary-hover p-5 text-white shadow-raised">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="grid gap-3">
          <p className="inline-flex items-center gap-2 font-display text-lg font-bold">
            <Crown size={22} className="text-gold" aria-hidden="true" />
            Femxo Prime
          </p>
          <div>
            <p className="text-xs uppercase tracking-wide text-white/80">Member</p>
            <p className="text-xl font-bold">{name}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-white/80">Member number</dt>
              <dd className="font-mono font-bold tracking-wider">{membership.memberId}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/80">Plan</dt>
              <dd className="font-semibold">{membership.plan.name}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-white/80">Valid till</dt>
              <dd className="font-semibold">
                <time dateTime={membership.validTill}>{DATE.format(new Date(membership.validTill))}</time>
              </dd>
            </div>
          </dl>
        </div>
        <div className="rounded-control bg-white p-2">
          <QrCode value={membership.qrPayload} label={`Membership QR code for ${membership.memberId}`} size={132} />
        </div>
      </div>
    </section>
  );
}
