import { Check } from "lucide-react";
import type { TimelineEntry } from "@femxo/shared/contracts";
import { timelineText } from "../status";

const WHEN = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** What has happened to the order, oldest first. The last entry is where the order stands now. */
export function OrderTimeline({ entries }: { entries: readonly TimelineEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-ink-muted">Nothing has happened to this order yet.</p>;
  return (
    <ol aria-label="Order timeline" className="grid gap-0">
      {entries.map((entry, index) => {
        const last = index === entries.length - 1;
        return (
          <li key={`${entry.type}-${entry.at}-${index}`} className="grid grid-cols-[1.75rem_1fr] gap-3" aria-current={last ? "step" : undefined}>
            <span className="relative flex justify-center">
              <span aria-hidden="true" className={`z-10 mt-0.5 grid size-6 place-items-center rounded-full ${last ? "bg-primary text-on-primary" : "bg-primary-soft text-primary"}`}>
                <Check size={14} />
              </span>
              {last ? null : <span aria-hidden="true" className="absolute top-6 h-[calc(100%-0.5rem)] w-0.5 bg-line" />}
            </span>
            <div className="pb-4 text-sm">
              <p className={last ? "font-semibold" : "font-medium"}>{timelineText(entry)}</p>
              <time dateTime={entry.at} className="text-xs text-ink-muted">
                {WHEN.format(new Date(entry.at))}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
