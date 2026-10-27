import { Check, Circle } from "lucide-react";
import type { OrderStatus, TimelineEvent } from "@femxo/shared/contracts";
import { cn } from "@femxo/ui";
import { NORMAL_PATH, ORDER_STATUS } from "../status";

const WHEN = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/**
 * Where the order has been, and, while it is on the normal path, where it
 * goes next. Cancelled, failed and returned orders show only what happened.
 */
export function OrderTimeline({ timeline, status }: { timeline: readonly TimelineEvent[]; status: OrderStatus }) {
  const reached = new Set(timeline.map((event) => event.status));
  const onTrack = NORMAL_PATH.includes(status);
  const upcoming = onTrack ? NORMAL_PATH.filter((step) => !reached.has(step)) : [];

  return (
    <ol aria-label="Order tracking" className="grid gap-0">
      {timeline.map((event, index) => {
        const current = index === timeline.length - 1;
        return (
          <li key={`${event.status}-${event.at}`} aria-current={current ? "step" : undefined} className="relative flex gap-3 pb-5 last:pb-0">
            <span aria-hidden="true" className={cn("relative z-10 grid size-6 flex-none place-items-center rounded-full", current ? "bg-primary text-on-primary" : "bg-success text-on-primary")}>
              <Check size={14} strokeWidth={3} />
            </span>
            {index < timeline.length - 1 || upcoming.length > 0 ? <span aria-hidden="true" className="absolute left-3 top-6 -ml-px h-full w-0.5 bg-line" /> : null}
            <div className="text-sm">
              <p className="font-semibold">{ORDER_STATUS[event.status].label}</p>
              <p className="text-ink-muted">
                <time dateTime={event.at}>{WHEN.format(new Date(event.at))}</time>
                {event.note ? ` · ${event.note}` : ""}
              </p>
            </div>
          </li>
        );
      })}
      {upcoming.map((step, index) => (
        <li key={step} className="relative flex gap-3 pb-5 last:pb-0">
          <span aria-hidden="true" className="relative z-10 grid size-6 flex-none place-items-center rounded-full bg-surface-sunken text-ink-muted">
            <Circle size={10} />
          </span>
          {index < upcoming.length - 1 ? <span aria-hidden="true" className="absolute left-3 top-6 -ml-px h-full w-0.5 bg-line" /> : null}
          <p className="text-sm text-ink-muted">
            {ORDER_STATUS[step].label}
            <span className="sr-only"> (not yet)</span>
          </p>
        </li>
      ))}
    </ol>
  );
}
