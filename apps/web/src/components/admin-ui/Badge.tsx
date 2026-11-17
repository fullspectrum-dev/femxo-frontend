import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "success" | "warning" | "error" | "info" | "neutral" | "gold" | "purple";

/**
 * Every status the panel shows, with its label and colour. Status always pairs
 * colour with a text label (Foundations), so colour is never the only signal.
 */
export const STATUS_META = {
  active: { label: "Active", tone: "success" },
  completed: { label: "Completed", tone: "success" },
  paid: { label: "Paid", tone: "success" },
  delivered: { label: "Delivered", tone: "success" },
  approved: { label: "Approved", tone: "success" },
  generated: { label: "Generated", tone: "success" },
  received: { label: "Received", tone: "success" },
  posted: { label: "Posted", tone: "success" },
  enabled: { label: "Enabled", tone: "success" },
  healthy: { label: "Healthy", tone: "success" },
  sent: { label: "Sent", tone: "success" },
  published: { label: "Published", tone: "success" },
  live: { label: "Live", tone: "success" },
  recovered: { label: "Recovered", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
  captured: { label: "Captured", tone: "success" },
  processed: { label: "Processed", tone: "success" },

  pending: { label: "Pending", tone: "warning" },
  submitted: { label: "Submitted", tone: "warning" },
  in_review: { label: "In review", tone: "warning" },
  changes_requested: { label: "Changes requested", tone: "warning" },
  pending_review: { label: "Pending review", tone: "warning" },
  low_stock: { label: "Low stock", tone: "warning" },
  expiring: { label: "Expiring", tone: "warning" },
  retrying: { label: "Retrying", tone: "warning" },
  requested: { label: "Requested", tone: "warning" },
  placed: { label: "Placed", tone: "warning" },
  degraded: { label: "Degraded", tone: "warning" },
  escalated: { label: "Escalated", tone: "warning" },
  changes_pending: { label: "Unpublished changes", tone: "warning" },
  pending_approval: { label: "Awaiting approval", tone: "warning" },
  pending_payment: { label: "Awaiting payment", tone: "warning" },
  awaiting_approval: { label: "Awaiting approval", tone: "warning" },
  partially_refunded: { label: "Partly refunded", tone: "warning" },
  planned: { label: "Planned", tone: "info" },
  authorized: { label: "Authorized", tone: "info" },
  refunded: { label: "Refunded", tone: "info" },
  out: { label: "Out for delivery", tone: "info" },
  validated: { label: "Validated", tone: "info" },
  investigation: { label: "Investigation", tone: "info" },
  liability: { label: "Liability set", tone: "info" },

  processing: { label: "Processing", tone: "info" },
  queued: { label: "Queued", tone: "info" },
  logged: { label: "Logged", tone: "info" },
  in_transit: { label: "In transit", tone: "info" },
  released: { label: "Released", tone: "info" },
  confirmed: { label: "Confirmed", tone: "info" },
  packed: { label: "Packed", tone: "info" },
  dispatched: { label: "Dispatched", tone: "info" },
  open: { label: "Open", tone: "info" },

  failed: { label: "Failed", tone: "error" },
  suspended: { label: "Suspended", tone: "error" },
  dead_letter: { label: "Dead-letter", tone: "error" },
  blocked: { label: "Blocked", tone: "error" },
  rejected: { label: "Rejected", tone: "error" },
  out_of_stock: { label: "Out of stock", tone: "error" },
  disabled: { label: "Disabled", tone: "error" },
  delivery_failed: { label: "Delivery failed", tone: "error" },
  payment_failed: { label: "Payment failed", tone: "error" },

  reversed: { label: "Reversed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  created: { label: "Created", tone: "neutral" },
  draft: { label: "Draft", tone: "neutral" },
  archived: { label: "Archived", tone: "neutral" },
  retried: { label: "Retried", tone: "neutral" },
  inactive: { label: "Inactive", tone: "neutral" },
  not_required: { label: "Not required", tone: "neutral" },
  written_off: { label: "Written off", tone: "neutral" },
  unpublished: { label: "Never published", tone: "neutral" },
} as const satisfies Record<string, { label: string; tone: BadgeTone }>;

export type StatusKey = keyof typeof STATUS_META;

export function isStatusKey(value: string): value is StatusKey {
  return Object.hasOwn(STATUS_META, value);
}

export function statusLabel(status: StatusKey) {
  return STATUS_META[status].label;
}

export function Badge({
  tone = "neutral",
  plain,
  className,
  children,
}: {
  tone?: BadgeTone;
  /** No leading dot (role chips, counts). */
  plain?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cn("fx-badge", `fx-badge--${tone}`, plain && "fx-badge--plain", className)}>{children}</span>;
}

export function StatusBadge({ status, className }: { status: StatusKey; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}
