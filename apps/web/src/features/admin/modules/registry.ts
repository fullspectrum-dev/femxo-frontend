import type { StatusKey, TimelineStep } from "@/components/admin-ui";
import type { RecordRow } from "../data/records";
import { formatDate, formatINR } from "../format";
import type { ActionSpec, ModuleSpec, ViewSpec } from "./types";

/*
 * Every admin module, described as data: columns, filters, forms, workflow
 * actions and timelines. ModulePage renders any of them, so modules share
 * one tested implementation instead of 15 copies. Actions mirror the state
 * machines in femxo-backend docs/admin-panel/system-design.md §9.
 */

/** Steps before `current` are done, `current` is in progress, the rest upcoming. */
function steps(labels: readonly string[], current: number, opts: { failed?: boolean; metas?: Record<number, string> } = {}): TimelineStep[] {
  return labels.map((label, index) => ({
    label,
    state: index < current ? "done" : index === current ? (opts.failed ? "failed" : "current") : "upcoming",
    meta: opts.metas?.[index],
  }));
}

const destructive = (title: string, description: string, confirmLabel: string, amountKey?: string) =>
  ({ kind: "destructive", title, description, confirmLabel, amountKey }) as const;
const financial = (title: string, description: string, confirmLabel: string, amountKey: string) =>
  ({ kind: "financial", title, description, confirmLabel, amountKey }) as const;

// ---------- Partner onboarding (dealers and sub-dealers share the KYC machine) ----------

const KYC_STEPS = ["Registration", "KYC review", "Approval", "Territory allocation"] as const;

function kycTimeline(row: RecordRow): TimelineStep[] {
  const joined = typeof row.joined === "string" ? formatDate(row.joined) : undefined;
  const metas = { 0: joined ?? "Done" };
  switch (row.status) {
    case "draft":
      return steps(KYC_STEPS, 0);
    case "submitted":
      return steps(KYC_STEPS, 1, { metas: { ...metas, 1: "Waiting for a reviewer" } });
    case "in_review":
      return steps(KYC_STEPS, 1, { metas });
    case "changes_requested":
      return steps(KYC_STEPS, 1, { metas: { ...metas, 1: "Changes requested from partner" } });
    case "rejected":
      return steps(KYC_STEPS, 2, { failed: true, metas: { ...metas, 2: "Rejected" } });
    case "approved":
      return steps(KYC_STEPS, 3, { metas });
    default:
      return steps(KYC_STEPS, 4, { metas });
  }
}

function kycActions(entity: "Dealer" | "Sub-dealer"): ActionSpec[] {
  return [
    { key: "review", label: "Start review", from: ["submitted"], to: "in_review", variant: "primary", toast: (r) => `KYC review started for ${r.name}.` },
    { key: "approve", label: "Approve", from: ["in_review"], to: "approved", variant: "primary", toast: () => `${entity} approved. Written to audit log.` },
    { key: "changes", label: "Request changes", from: ["in_review"], to: "changes_requested", variant: "secondary", toast: (r) => `Changes requested from ${r.name}.` },
    {
      key: "reject", label: "Reject", from: ["in_review", "submitted"], to: "rejected", variant: "danger",
      confirm: destructive(`Reject ${entity.toLowerCase()} application`, "The partner must start a new application. This is written to the audit log.", "Reject application"),
      toast: (r) => `${r.name} rejected. Written to audit log.`,
    },
    { key: "allocate", label: "Allocate territory", from: ["approved"], to: "active", variant: "primary", toast: (r) => `Territory allocated. ${r.name} is now active.` },
    {
      key: "suspend", label: "Suspend", from: ["active"], to: "suspended", variant: "danger",
      confirm: destructive(`Suspend ${entity.toLowerCase()}`, "Their sessions end immediately and new orders are blocked until reinstated.", "Suspend"),
      toast: (r) => `${r.name} suspended. Written to audit log.`,
    },
    { key: "reinstate", label: "Reinstate", from: ["suspended"], to: "active", variant: "secondary", toast: (r) => `${r.name} reinstated.` },
  ];
}

const dealersView: ViewSpec = {
  key: "dealers",
  label: "Dealers",
  dataset: "dealers",
  entity: "dealer",
  searchPlaceholder: "Search dealer, code or owner",
  searchKeys: ["name", "code", "owner", "district"],
  columns: [
    { key: "name", header: "Dealer", primary: true, sortable: true, sub: "code" },
    { key: "district", header: "District", sortable: true },
    { key: "owner", header: "Owner", hideOnMobile: true },
    { key: "wallet", header: "Wallet", format: "inr", sortable: true },
    { key: "status", header: "Status", format: "status" },
  ],
  statuses: ["active", "submitted", "in_review", "changes_requested", "approved", "suspended", "rejected"],
  details: [
    { label: "Code", key: "code" },
    { label: "Owner", key: "owner" },
    { label: "District", key: "district" },
    { label: "Mobile", key: "phone" },
    { label: "GSTIN", key: "gstin" },
    { label: "Wallet balance", key: "wallet", format: "inr" },
    { label: "Registered", key: "joined", format: "date" },
  ],
  recordName: (r) => `${r.code} · ${r.name}`,
  subtitle: (r) => `Dealer · ${r.district}`,
  timeline: { label: "Approval timeline", steps: kycTimeline },
  note: (r) => (r.status === "in_review" ? "Four-eyes rule: the approver must be different from the KYC reviewer." : null),
  actions: kycActions("Dealer"),
  empty: { title: "No dealers yet", message: "Add the first dealer to start the network." },
  pageSize: 8,
};

const subDealersView: ViewSpec = {
  key: "sub-dealers",
  label: "Sub-dealers",
  dataset: "subDealers",
  entity: "sub-dealer",
  searchPlaceholder: "Search sub-dealer, village or dealer",
  searchKeys: ["name", "code", "village", "parent", "district"],
  columns: [
    { key: "name", header: "Sub-dealer", primary: true, sortable: true, sub: "code" },
    { key: "parent", header: "Dealer", sortable: true },
    { key: "village", header: "Village / town" },
    { key: "district", header: "District", hideOnMobile: true },
    { key: "status", header: "Status", format: "status" },
  ],
  statuses: ["active", "submitted", "in_review", "changes_requested", "approved", "suspended", "rejected"],
  details: [
    { label: "Code", key: "code" },
    { label: "Parent dealer", key: "parent" },
    { label: "Village / town", key: "village" },
    { label: "District", key: "district" },
    { label: "Mobile", key: "phone" },
    { label: "Registered", key: "joined", format: "date" },
  ],
  recordName: (r) => `${r.code} · ${r.name}`,
  subtitle: (r) => `Sub-dealer · ${r.village}`,
  timeline: { label: "Approval timeline", steps: kycTimeline },
  note: () => "The sub-dealer's village must lie inside the parent dealer's territory.",
  actions: kycActions("Sub-dealer"),
  empty: { title: "No sub-dealers yet", message: "Sub-dealers appear here once dealers add them." },
};

// ---------- Views added with the full backend integration ----------

const archiveActions = (entity: string, effect: string): ActionSpec[] => [
  {
    key: "archive", label: "Archive", from: ["active"], to: "archived", variant: "danger",
    confirm: destructive(`Archive ${entity}`, effect, "Archive"),
    toast: (r) => `${r.name} archived.`,
  },
  { key: "restore", label: "Restore", from: ["archived"], to: "active", variant: "secondary", toast: (r) => `${r.name} restored.` },
];

/** A confirm that also asks for a written reason (kept in the audit log). */
const withReason = (kind: "destructive" | "financial", title: string, description: string, confirmLabel: string, label: string, amountKey?: string) =>
  ({ kind, title, description, confirmLabel, amountKey, reason: { label, min: 3 } }) as const;

const brandsView: ViewSpec = {
  key: "brands",
  label: "Brands",
  dataset: "brands",
  entity: "brand",
  searchPlaceholder: "Search brands",
  searchKeys: ["name", "slug"],
  columns: [
    { key: "name", header: "Brand", primary: true, sub: "slug" },
    { key: "created", header: "Added", format: "date", hideOnMobile: true },
    { key: "updated", header: "Updated", format: "date", hideOnMobile: true },
    { key: "status", header: "Status", format: "status" },
  ],
  statuses: ["active", "archived"],
  details: [
    { label: "Web address", key: "slug" },
    { label: "Added", key: "created", format: "date" },
    { label: "Updated", key: "updated", format: "date" },
  ],
  recordName: (r) => String(r.name),
  actions: archiveActions("brand", "It can no longer be picked for new products. Existing products keep it."),
  empty: { title: "No brands yet", message: "Add the brands your products are sold under." },
  pageSize: 10,
};

const categoriesView: ViewSpec = {
  key: "categories",
  label: "Categories",
  dataset: "categories",
  entity: "category",
  searchPlaceholder: "Search categories",
  searchKeys: ["path", "slug"],
  columns: [
    { key: "path", header: "Category", primary: true, sub: "slug" },
    { key: "level", header: "Level", format: "count" },
    { key: "order", header: "Position", format: "count", hideOnMobile: true },
    { key: "status", header: "Status", format: "status" },
  ],
  statuses: ["active", "archived"],
  details: [
    { label: "Parent", key: "parent" },
    { label: "Level", key: "level", format: "count" },
    { label: "Position", key: "order", format: "count" },
    { label: "Web address", key: "slug" },
  ],
  recordName: (r) => String(r.path),
  actions: archiveActions("category", "It disappears from the storefront aisles. Products in it keep their category."),
  empty: { title: "No categories yet", message: "Build the aisle tree shoppers browse." },
  pageSize: 12,
};

const warehousesView: ViewSpec = {
  key: "warehouses",
  label: "Warehouses",
  dataset: "warehouses",
  entity: "warehouse",
  searchPlaceholder: "Search warehouses",
  searchKeys: ["name", "code", "address"],
  columns: [
    { key: "name", header: "Warehouse", primary: true, sub: "code" },
    { key: "address", header: "Address", hideOnMobile: true },
    { key: "created", header: "Opened", format: "date", hideOnMobile: true },
    { key: "status", header: "Status", format: "status" },
  ],
  statuses: ["active", "archived"],
  details: [
    { label: "Code", key: "code" },
    { label: "Address", key: "address" },
    { label: "Opened", key: "created", format: "date" },
  ],
  recordName: (r) => `${r.code} · ${r.name}`,
  note: () => "Only a warehouse that holds no stock can be archived.",
  actions: archiveActions("warehouse", "No stock can be received or sent from it until restored."),
  empty: { title: "No warehouses yet", message: "Add a dark store or depot to start holding stock." },
};

const returnsView: ViewSpec = {
  key: "returns",
  label: "Returns",
  dataset: "returns",
  entity: "return",
  searchPlaceholder: "Search order or reason",
  searchKeys: ["order", "reason", "requestedBy"],
  columns: [
    { key: "order", header: "Order", primary: true, sub: "reason" },
    { key: "units", header: "Units", format: "count" },
    { key: "requestedBy", header: "Requested by", hideOnMobile: true },
    { key: "requested", header: "Requested", format: "datetime", hideOnMobile: true },
    { key: "status", header: "Status", format: "status" },
  ],
  statuses: ["requested", "approved", "rejected"],
  details: [
    { label: "Order", key: "order" },
    { label: "Units", key: "units", format: "count" },
    { label: "Reason", key: "reason" },
    { label: "Requested by", key: "requestedBy" },
    { label: "Requested", key: "requested", format: "datetime" },
    { label: "Decided by", key: "decidedBy" },
    { label: "Decision note", key: "decision" },
  ],
  recordName: (r) => `Return · ${r.order}`,
  note: (r) => (r.status === "requested" ? "The commission on these units is held until you decide." : null),
  actions: [
    {
      key: "approve", label: "Approve return", from: ["requested"], to: "approved", variant: "primary",
      confirm: withReason("destructive", "Approve return", "The units come back and their commission is reversed.", "Approve return", "Note for the audit log"),
      toast: (r) => `Return on ${r.order} approved.`,
    },
    {
      key: "reject", label: "Reject", from: ["requested"], to: "rejected", variant: "danger",
      confirm: withReason("destructive", "Reject return", "The held commission is released to the partner.", "Reject return", "Why it is rejected"),
      toast: (r) => `Return on ${r.order} rejected.`,
    },
  ],
  empty: { title: "No return requests", message: "Requests made inside the return window appear here." },
};

const routesView: ViewSpec = {
  key: "routes",
  label: "Delivery runs",
  dataset: "deliveryRoutes",
  entity: "route",
  searchPlaceholder: "Day, YYYY-MM-DD",
  searchKeys: ["name", "agent"],
  columns: [
    { key: "name", header: "Route", primary: true, sub: "agent" },
    { key: "stops", header: "Stops", format: "count" },
    { key: "delivered", header: "Delivered", format: "count" },
    { key: "failed", header: "Failed", format: "count", hideOnMobile: true },
    { key: "cash", header: "Cash at door", format: "inr", hideOnMobile: true },
    { key: "status", header: "Status", format: "status" },
  ],
  statuses: ["planned", "out", "closed"],
  details: [
    { label: "Delivery partner", key: "agent" },
    { label: "Day", key: "date", format: "date" },
    { label: "Stops", key: "stops", format: "count" },
    { label: "Delivered", key: "delivered", format: "count" },
    { label: "Failed", key: "failed", format: "count" },
    { label: "Still to go", key: "pending", format: "count" },
    { label: "Completion", key: "progress" },
    { label: "Cash taken at the door", key: "cash", format: "inr" },
  ],
  recordName: (r) => String(r.name),
  subtitle: (r) => `${r.agent} · ${r.date}`,
  timeline: {
    label: "Run progress",
    steps: (r) => steps(["Planned", "Out for delivery", "Closed"], r.status === "planned" ? 0 : r.status === "out" ? 1 : 3),
  },
  note: () => "Partners start and close runs from the delivery app; every stop is confirmed with the customer's OTP.",
  readOnly: true,
  empty: { title: "No runs on this day", message: "Runs planned for the day appear here. Try another date in the search box." },
  pageSize: 20,
};

const codTasksView: ViewSpec = {
  key: "cod",
  label: "COD recovery",
  dataset: "codTasks",
  entity: "recovery task",
  searchPlaceholder: "Search order or partner",
  searchKeys: ["order", "owner"],
  columns: [
    { key: "order", header: "Order", primary: true, sub: "owner" },
    { key: "level", header: "Escalation", format: "count" },
    { key: "attempts", header: "Attempts", format: "count" },
    { key: "liability", header: "Liability", format: "inr", hideOnMobile: true },
    { key: "next", header: "Next action", format: "datetime", hideOnMobile: true },
    { key: "status", header: "Status", format: "status" },
  ],
  statuses: ["open", "escalated", "investigation", "liability", "recovered", "written_off", "closed"],
  details: [
    { label: "Partner", key: "owner" },
    { label: "Escalation level", key: "level", format: "count" },
    { label: "Attempts", key: "attempts", format: "count" },
    { label: "Last attempt", key: "lastAttempt" },
    { label: "Next action", key: "next", format: "datetime" },
    { label: "Findings", key: "findings" },
    { label: "Liable", key: "liable" },
    { label: "Liability", key: "liability", format: "inr" },
    { label: "Plan", key: "plan" },
    { label: "Opened", key: "created", format: "datetime" },
  ],
  recordName: (r) => `Recovery · ${r.order}`,
  timeline: {
    label: "Recovery progress",
    steps: (r) => {
      const labels = ["Collect", "Escalate", "Investigate", "Liability", "Settled"];
      const index = { open: 0, escalated: 1, investigation: 2, liability: 3, recovered: 5, written_off: 5, closed: 5 } as Partial<Record<StatusKey, number>>;
      return steps(labels, index[r.status] ?? 0);
    },
  },
  note: (r) => (r.status === "liability" ? "Recovery or write-off runs only after a different person approves it (maker-checker)." : null),
  actions: [
    {
      key: "attempt", label: "Log attempt", from: ["open", "escalated"], variant: "primary",
      confirm: withReason("destructive", "Log a collection attempt", "Recorded on the task with your name and the time.", "Log attempt", "What happened"),
      toast: (r) => `Attempt logged on ${r.order}.`,
    },
    {
      key: "escalate", label: "Escalate", from: ["open", "escalated"], to: "escalated", variant: "secondary",
      confirm: withReason("destructive", "Escalate recovery", "Raises the escalation level by one.", "Escalate", "Why it is escalated"),
      toast: (r) => `${r.order} escalated.`,
    },
    {
      key: "investigate", label: "Open investigation", from: ["open", "escalated"], to: "investigation", variant: "secondary",
      confirm: withReason("destructive", "Open an investigation", "Collection attempts stop while it is investigated.", "Open investigation", "Findings so far"),
      toast: (r) => `Investigation opened on ${r.order}.`,
    },
    {
      key: "execute", label: "Carry out approved plan", from: ["liability"], variant: "gold",
      confirm: financial("Carry out recovery", "Recovers the liability from the wallet or writes it off, as approved. This can't be undone.", "Carry it out", "liability"),
      toast: (r) => `${r.order} settled.`,
    },
  ],
  empty: { title: "No recovery tasks", message: "Orders that still owe money after delivery appear here." },
};

const commissionView: ViewSpec = {
  key: "commission",
  label: "Commission plans",
  dataset: "commissionPlans",
  entity: "commission plan",
  searchPlaceholder: "Search plans",
  searchKeys: ["name", "scope"],
  columns: [
    { key: "name", header: "Plan", primary: true, sub: "scope" },
    { key: "model", header: "Model", hideOnMobile: true },
    { key: "dealerRate", header: "Dealer / pool" },
    { key: "subDealerRate", header: "Sub-dealer", hideOnMobile: true },
    { key: "live", header: "Live version" },
    { key: "status", header: "Latest", format: "status" },
  ],
  statuses: ["draft", "validated", "published"],
  details: [
    { label: "Applies to", key: "scope" },
    { label: "Latest version", key: "version" },
    { label: "Live version", key: "live" },
    { label: "Model", key: "model" },
    { label: "Dealer (or pool) rate", key: "dealerRate" },
    { label: "Sub-dealer rate", key: "subDealerRate" },
    { label: "Effective from", key: "from", format: "date" },
  ],
  recordName: (r) => `${r.name} · ${r.version}`,
  timeline: {
    label: "Latest version",
    steps: (r) => steps(["Draft", "Validated", "Published"], r.status === "draft" ? 0 : r.status === "validated" ? 1 : 3),
  },
  note: (r) => (r.status === "published" ? "A published version never changes. Corrections are a new version." : null),
  actions: [
    { key: "validate", label: "Validate", from: ["draft"], to: "validated", variant: "primary", toast: (r) => `${r.name} ${r.version} validated.` },
    {
      key: "publish", label: "Publish", from: ["validated"], to: "published", variant: "gold",
      confirm: withReason("financial", "Publish commission version", "Orders use these rates from the effective date. It can never be edited again.", "Publish", "Note for the audit log"),
      toast: (r) => `${r.name} ${r.version} published.`,
    },
  ],
  empty: { title: "No commission plans", message: "Plans decide what dealers and sub-dealers earn per order." },
};

const approvalsView: ViewSpec = {
  key: "approvals",
  label: "Approval queue",
  dataset: "approvals",
  entity: "approval",
  searchPlaceholder: "Search request, maker or checker",
  searchKeys: ["kind", "subject", "maker", "checker"],
  columns: [
    { key: "kind", header: "Request", primary: true, sub: "subject" },
    { key: "maker", header: "Raised by", hideOnMobile: true },
    { key: "checker", header: "Assigned to" },
    { key: "due", header: "Due", format: "datetime", hideOnMobile: true },
    { key: "sla", header: "SLA" },
    { key: "status", header: "Status", format: "status" },
  ],
  statuses: ["pending", "approved", "rejected"],
  details: [
    { label: "Record", key: "subject" },
    { label: "Raised by (maker)", key: "maker" },
    { label: "Assigned to (checker)", key: "checker" },
    { label: "Due", key: "due", format: "datetime" },
    { label: "SLA", key: "sla" },
    { label: "Decided by", key: "decidedBy" },
    { label: "Decided", key: "decidedAt", format: "datetime" },
    { label: "Reason", key: "decision" },
  ],
  recordName: (r) => String(r.kind),
  subtitle: (r) => String(r.subject),
  note: (r) => (r.status === "pending" ? "Four-eyes rule: the person who raised a request can't decide it." : null),
  actions: [
    {
      key: "approve", label: "Approve", from: ["pending"], to: "approved", variant: "primary",
      confirm: withReason("financial", "Approve request", "The action it guards runs as soon as you approve.", "Approve", "Reason"),
      toast: (r) => `${r.kind} approved.`,
    },
    {
      key: "reject", label: "Reject", from: ["pending"], to: "rejected", variant: "danger",
      confirm: withReason("destructive", "Reject request", "Nothing it guards is carried out.", "Reject", "Reason"),
      toast: (r) => `${r.kind} rejected.`,
    },
  ],
  empty: { title: "Nothing waiting", message: "Requests that need a second person land here." },
  pageSize: 10,
};

// ---------- Modules ----------

export const MODULES: readonly ModuleSpec[] = [
  {
    key: "users",
    title: "User Management",
    description: "Internal staff and partner logins. Roles decide what they can do; territories decide where.",
    views: [
      {
        key: "users",
        label: "Users",
        dataset: "users",
        entity: "user",
        searchPlaceholder: "Search name, email or role",
        searchKeys: ["name", "email", "role", "scope"],
        columns: [
          { key: "name", header: "Name", primary: true, sortable: true, sub: "email" },
          { key: "role", header: "Role", sortable: true },
          { key: "scope", header: "Territory" },
          { key: "lastLogin", header: "Last login", format: "datetime", sortable: true, hideOnMobile: true },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["active", "disabled"],
        details: [
          { label: "Email", key: "email" },
          { label: "Role", key: "role" },
          { label: "Territory", key: "scope" },
          { label: "Last login", key: "lastLogin", format: "datetime" },
        ],
        recordName: (r) => String(r.name),
        subtitle: (r) => String(r.role),
        actions: [
          {
            key: "disable", label: "Disable user", from: ["active"], to: "disabled", variant: "danger",
            confirm: destructive("Disable user", "All their sessions end immediately. They can't sign in until re-enabled.", "Disable user"),
            toast: (r) => `${r.name} disabled. Sessions revoked.`,
          },
          { key: "enable", label: "Enable user", from: ["disabled"], to: "active", variant: "secondary", toast: (r) => `${r.name} enabled.` },
          { key: "reset", label: "Reset password", from: ["active"], variant: "secondary", toast: (r) => `Temporary password sent to ${r.name}.` },
        ],
        empty: { title: "No users yet", message: "Add the first team member." },
      },
    ],
  },
  {
    key: "roles",
    title: "Roles & Permissions",
    description: "Roles are sets of permissions named module.action. Custom roles like Finance Admin are built here.",
    views: [
      {
        key: "roles",
        label: "Roles",
        dataset: "roles",
        entity: "role",
        searchPlaceholder: "Search roles",
        searchKeys: ["name", "scope", "kind"],
        columns: [
          { key: "name", header: "Role", primary: true, sortable: true },
          { key: "kind", header: "Type" },
          { key: "users", header: "Users", format: "count", sortable: true },
          { key: "permissions", header: "Permissions", format: "count", sortable: true },
          { key: "scope", header: "Typical scope", hideOnMobile: true },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["active", "archived"],
        details: [
          { label: "Type", key: "kind" },
          { label: "Users", key: "users", format: "count" },
          { label: "Permissions", key: "permissions", format: "count" },
          { label: "Typical scope", key: "scope" },
        ],
        recordName: (r) => String(r.name),
        note: () => "You can only grant permissions you hold yourself. Adding a sensitive permission needs a second approver.",
        create: {
          label: "Create role",
          title: "Create role",
          description: "Start empty, then add permissions. Sensitive permissions need a second approver.",
          fields: [
            { name: "name", label: "Role name", kind: "text", required: true, placeholder: "Finance Admin" },
            { name: "scope", label: "Typical scope", kind: "select", required: true, options: ["State", "District", "Warehouse", "Assigned area"] },
            { name: "description", label: "Description", kind: "textarea", placeholder: "What this role is for" },
          ],
          status: "active",
          toRow: (v) => ({ name: v.name!, kind: "Custom", users: 0, permissions: 0, scope: v.scope! }),
          toast: (v) => `Role "${v.name}" created. Written to audit log.`,
        },
        actions: [
          {
            key: "archive", label: "Archive role", from: ["active"], to: "archived", variant: "danger",
            confirm: destructive("Archive role", "Users keep their other roles. This role can no longer be assigned.", "Archive role"),
            toast: (r) => `Role "${r.name}" archived.`,
          },
        ],
        empty: { title: "No roles yet", message: "Create a role to group permissions." },
      },
    ],
  },
  {
    key: "security",
    title: "Security & Audit Logs",
    description: "Append-only records. Nothing here can be edited or deleted.",
    views: [
      {
        key: "events",
        label: "Security events",
        dataset: "securityEvents",
        entity: "event",
        searchPlaceholder: "Search events or actors",
        searchKeys: ["event", "actor", "ip"],
        columns: [
          { key: "event", header: "Event", primary: true },
          { key: "actor", header: "Actor", sortable: true },
          { key: "ip", header: "IP (masked)" },
          { key: "at", header: "Time", format: "datetime", sortable: true },
          { key: "status", header: "Outcome", format: "status" },
        ],
        statuses: ["blocked", "logged"],
        details: [
          { label: "Actor", key: "actor" },
          { label: "IP (masked)", key: "ip" },
          { label: "Time", key: "at", format: "datetime" },
        ],
        recordName: (r) => String(r.event),
        readOnly: true,
        empty: { title: "No security events", message: "Blocked logins, role changes and revoked sessions appear here." },
      },
      {
        key: "audit",
        label: "Audit log",
        dataset: "auditLog",
        entity: "audit entry",
        searchPlaceholder: "Search action, actor or record",
        searchKeys: ["action", "actor", "entity"],
        columns: [
          { key: "action", header: "Action", primary: true },
          { key: "entity", header: "Record" },
          { key: "actor", header: "Actor", sortable: true },
          { key: "at", header: "Time", format: "datetime", sortable: true },
        ],
        statuses: [],
        details: [
          { label: "Record", key: "entity" },
          { label: "Actor", key: "actor" },
          { label: "Time", key: "at", format: "datetime" },
        ],
        recordName: (r) => String(r.action),
        readOnly: true,
        empty: { title: "No audit entries", message: "Every change made in the panel is recorded here." },
      },
    ],
  },
  {
    key: "products",
    title: "Products & Catalog",
    description: "SKUs, prices by partner tier, and GST. No price can exceed MRP.",
    views: [
      {
        key: "products",
        label: "Products",
        dataset: "products",
        entity: "product",
        searchPlaceholder: "Search product, SKU or brand",
        searchKeys: ["name", "sku", "brand", "category"],
        columns: [
          { key: "name", header: "Product", primary: true, sortable: true, sub: "sku" },
          { key: "category", header: "Category", sortable: true },
          { key: "mrp", header: "MRP", format: "inr", sortable: true },
          { key: "dealerPrice", header: "Dealer price", format: "inr", hideOnMobile: true },
          { key: "gst", header: "GST", format: "gst" },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["active", "draft", "archived"],
        details: [
          { label: "SKU", key: "sku" },
          { label: "Brand", key: "brand" },
          { label: "Category", key: "category" },
          { label: "MRP", key: "mrp", format: "inr" },
          { label: "Dealer price", key: "dealerPrice", format: "inr" },
          { label: "GST", key: "gst", format: "gst" },
        ],
        recordName: (r) => `${r.sku} · ${r.name}`,
        subtitle: (r) => `${r.brand} · ${r.category}`,
        actions: [
          { key: "publish", label: "Publish", from: ["draft"], to: "active", variant: "primary", toast: (r) => `${r.name} is live in the catalogue.` },
          {
            key: "archive", label: "Archive", from: ["active", "draft"], to: "archived", variant: "danger",
            confirm: destructive("Archive product", "It disappears from ordering apps. Past orders keep it.", "Archive product"),
            toast: (r) => `${r.name} archived.`,
          },
          { key: "restore", label: "Restore", from: ["archived"], to: "active", variant: "secondary", toast: (r) => `${r.name} restored.` },
        ],
        empty: { title: "No records yet", message: "Create the first product to start the catalogue." },
        pageSize: 8,
      },
      brandsView,
      categoriesView,
    ],
  },
  {
    key: "approvals",
    title: "Approvals",
    description: "Everything that needs a second pair of eyes. Decisions are written to the audit log.",
    views: [approvalsView],
  },
  { key: "dealers", title: "Dealers", description: "District partners: KYC, approval, territory and wallet.", views: [dealersView] },
  { key: "sub-dealers", title: "Sub-Dealers", description: "Village partners under a dealer, with the same KYC checks.", views: [subDealersView] },
  {
    key: "warehouse",
    title: "Warehouse & Inventory",
    description: "Stock comes from an append-only ledger. Corrections are adjustments, never edits.",
    views: [
      {
        key: "stock",
        label: "Stock",
        dataset: "stock",
        entity: "stock line",
        searchPlaceholder: "Search product, batch or warehouse",
        searchKeys: ["product", "batch", "warehouse"],
        columns: [
          { key: "product", header: "Product", primary: true, sortable: true, sub: "batch" },
          { key: "warehouse", header: "Warehouse", sortable: true },
          { key: "qty", header: "Units", format: "count", sortable: true },
          { key: "expiry", header: "Expiry", format: "date", sortable: true, hideOnMobile: true },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["healthy", "low_stock", "expiring", "out_of_stock"],
        details: [
          { label: "Warehouse", key: "warehouse" },
          { label: "Batch", key: "batch" },
          { label: "Units", key: "qty", format: "count" },
          { label: "Expiry", key: "expiry", format: "date" },
        ],
        recordName: (r) => `${r.product} · ${r.batch}`,
        subtitle: (r) => String(r.warehouse),
        note: () => "Balances are derived from the stock ledger. To change them, request a transfer or an adjustment.",
        readOnly: true,
        empty: { title: "No stock yet", message: "Receive goods into a warehouse to see stock here." },
      },
      {
        key: "transfers",
        label: "Transfers",
        dataset: "transfers",
        entity: "transfer",
        searchPlaceholder: "Search TR number or warehouse",
        searchKeys: ["code", "from", "to", "requestedBy"],
        columns: [
          { key: "code", header: "Transfer", primary: true, sortable: true },
          { key: "from", header: "From" },
          { key: "to", header: "To" },
          { key: "units", header: "Units", format: "count", sortable: true },
          { key: "date", header: "Requested", format: "date", sortable: true, hideOnMobile: true },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["requested", "approved", "in_transit", "received", "cancelled"],
        details: [
          { label: "From", key: "from" },
          { label: "To", key: "to" },
          { label: "Lines", key: "lines", format: "count" },
          { label: "Units", key: "units", format: "count" },
          { label: "Requested by", key: "requestedBy" },
          { label: "Requested", key: "date", format: "date" },
        ],
        recordName: (r) => `${r.code} · ${r.from} → ${r.to}`,
        timeline: {
          label: "Transfer progress",
          steps: (r) => {
            const labels = ["Requested", "Approved", "Dispatched", "Received"];
            const index = { requested: 1, approved: 2, in_transit: 3, received: 4 } as Partial<Record<StatusKey, number>>;
            if (r.status === "cancelled") return steps(labels, 1, { failed: true, metas: { 1: "Cancelled" } });
            return steps(labels, index[r.status] ?? 0);
          },
        },
        note: (r) => (r.status === "requested" ? "Four-eyes rule: the approver must be different from the requester." : null),
        actions: [
          { key: "approve", label: "Approve", from: ["requested"], to: "approved", variant: "primary", toast: (r) => `${r.code} approved.` },
          { key: "dispatch", label: "Dispatch", from: ["approved"], to: "in_transit", variant: "primary", toast: (r) => `${r.code} dispatched. Stock ledger updated.` },
          { key: "receive", label: "Mark received", from: ["in_transit"], to: "received", variant: "primary", toast: (r) => `${r.code} received. Stock ledger updated.` },
          {
            key: "cancel", label: "Cancel transfer", from: ["requested", "approved"], to: "cancelled", variant: "danger",
            confirm: destructive("Cancel transfer", "Only possible before dispatch. No stock has moved yet.", "Cancel transfer"),
            toast: (r) => `${r.code} cancelled.`,
          },
        ],
        empty: { title: "No transfers yet", message: "Request a transfer to move stock between warehouses." },
      },
      {
        key: "adjustments",
        label: "Adjustments",
        dataset: "adjustments",
        entity: "adjustment",
        searchPlaceholder: "Search ADJ number or reason",
        searchKeys: ["code", "warehouse", "type", "reason"],
        columns: [
          { key: "code", header: "Adjustment", primary: true, sortable: true },
          { key: "warehouse", header: "Warehouse" },
          { key: "type", header: "Type" },
          { key: "units", header: "Units", format: "units", sortable: true },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["submitted", "posted", "rejected"],
        details: [
          { label: "Warehouse", key: "warehouse" },
          { label: "Type", key: "type" },
          { label: "Units", key: "units", format: "units" },
          { label: "Reason", key: "reason" },
          { label: "Requested by", key: "requestedBy" },
        ],
        recordName: (r) => `${r.code} · ${r.type}`,
        note: () => "Posted adjustments are permanent ledger entries. Mistakes are fixed with a new adjustment.",
        actions: [
          { key: "approve", label: "Approve & post", from: ["submitted"], to: "posted", variant: "primary", toast: (r) => `${r.code} posted to the stock ledger.` },
          {
            key: "reject", label: "Reject", from: ["submitted"], to: "rejected", variant: "danger",
            confirm: destructive("Reject adjustment", "Nothing is posted to the stock ledger.", "Reject"),
            toast: (r) => `${r.code} rejected.`,
          },
        ],
        empty: { title: "No adjustments", message: "Damage, expiry and count corrections appear here." },
      },
      warehousesView,
    ],
  },
  {
    key: "prime",
    title: "Prime Membership",
    description: "Customer membership plans and subscriptions.",
    views: [
      {
        key: "subscriptions",
        label: "Subscriptions",
        dataset: "primeSubscriptions",
        entity: "subscription",
        searchPlaceholder: "Search customer or plan",
        searchKeys: ["customer", "plan", "district"],
        columns: [
          { key: "customer", header: "Customer", primary: true, sortable: true },
          { key: "plan", header: "Plan", sortable: true },
          { key: "district", header: "District", hideOnMobile: true },
          { key: "end", header: "Ends", format: "date", sortable: true },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["active", "expiring", "pending", "expired", "cancelled"],
        details: [
          { label: "Plan", key: "plan" },
          { label: "District", key: "district" },
          { label: "Started", key: "start", format: "date" },
          { label: "Ends", key: "end", format: "date" },
        ],
        recordName: (r) => `${r.customer} · ${r.plan}`,
        actions: [
          {
            key: "cancel", label: "Cancel membership", from: ["active", "expiring"], to: "cancelled", variant: "danger",
            confirm: destructive("Cancel membership", "Prime benefits stop now. Refunds are a separate finance action.", "Cancel membership"),
            toast: (r) => `Membership for ${r.customer} cancelled.`,
          },
        ],
        empty: { title: "No subscriptions", message: "Customers subscribe from the customer app." },
      },
      {
        key: "plans",
        label: "Plans",
        dataset: "primePlans",
        entity: "plan",
        searchPlaceholder: "Search plans",
        searchKeys: ["name"],
        columns: [
          { key: "name", header: "Plan", primary: true },
          { key: "price", header: "Price", format: "inr", sortable: true },
          { key: "duration", header: "Days", format: "count" },
          { key: "members", header: "Members", format: "count", sortable: true },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["active", "archived"],
        details: [
          { label: "Price", key: "price", format: "inr" },
          { label: "Duration (days)", key: "duration", format: "count" },
          { label: "Members", key: "members", format: "count" },
        ],
        recordName: (r) => String(r.name),
        actions: [
          {
            key: "archive", label: "Archive plan", from: ["active"], to: "archived", variant: "danger",
            confirm: destructive("Archive plan", "No new subscriptions. Current members keep it until it ends.", "Archive plan"),
            toast: (r) => `${r.name} archived.`,
          },
        ],
        empty: { title: "No plans", message: "Create a plan customers can subscribe to." },
      },
    ],
  },
  {
    key: "customers",
    title: "Customers",
    description: "End customers. Phone numbers are masked unless your role can view personal data.",
    views: [
      {
        key: "customers",
        label: "Customers",
        dataset: "customers",
        entity: "customer",
        searchPlaceholder: "Search name or district",
        searchKeys: ["name", "district", "prime"],
        columns: [
          { key: "name", header: "Customer", primary: true, sortable: true },
          { key: "phone", header: "Mobile (masked)" },
          { key: "district", header: "District", sortable: true },
          { key: "prime", header: "Prime" },
          { key: "orders", header: "Orders", format: "count", sortable: true, hideOnMobile: true },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["active", "blocked"],
        details: [
          { label: "Mobile (masked)", key: "phone" },
          { label: "District", key: "district" },
          { label: "Prime", key: "prime" },
          { label: "Orders", key: "orders", format: "count" },
          { label: "Customer since", key: "joined", format: "date" },
        ],
        recordName: (r) => String(r.name),
        actions: [
          {
            key: "block", label: "Block customer", from: ["active"], to: "blocked", variant: "danger",
            confirm: destructive("Block customer", "They can't sign in or order until unblocked.", "Block customer"),
            toast: (r) => `${r.name} blocked.`,
          },
          { key: "unblock", label: "Unblock", from: ["blocked"], to: "active", variant: "secondary", toast: (r) => `${r.name} unblocked.` },
        ],
        empty: { title: "No customers yet", message: "Customers appear when they sign up in the customer app." },
      },
    ],
  },
  {
    key: "orders",
    title: "Orders & Delivery",
    description: "Orders from the customer app, field staff and partners, through to delivery.",
    views: [
      {
        key: "orders",
        label: "Orders",
        dataset: "orders",
        entity: "order",
        searchPlaceholder: "Search order number or buyer",
        searchKeys: ["code", "buyer", "district", "channel"],
        columns: [
          { key: "code", header: "Order", primary: true, sortable: true, sub: "buyer" },
          { key: "channel", header: "Channel" },
          { key: "district", header: "District", hideOnMobile: true },
          { key: "amount", header: "Amount", format: "inr", sortable: true },
          { key: "date", header: "Placed", format: "datetime", sortable: true, hideOnMobile: true },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["placed", "confirmed", "packed", "dispatched", "delivered", "delivery_failed", "cancelled"],
        details: [
          { label: "Buyer", key: "buyer" },
          { label: "Channel", key: "channel" },
          { label: "District", key: "district" },
          { label: "Amount", key: "amount", format: "inr" },
          { label: "Payment", key: "payment" },
          { label: "Placed", key: "date", format: "datetime" },
        ],
        recordName: (r) => `${r.code} · ${r.buyer}`,
        timeline: {
          label: "Order progress",
          steps: (r) => {
            const labels = ["Placed", "Confirmed", "Packed", "Dispatched", "Delivered"];
            const index = { placed: 1, confirmed: 2, packed: 3, dispatched: 4, delivered: 5 } as Partial<Record<StatusKey, number>>;
            if (r.status === "cancelled") return steps(labels, 1, { failed: true, metas: { 1: "Cancelled" } });
            if (r.status === "delivery_failed") return steps(labels, 4, { failed: true, metas: { 4: "Delivery failed" } });
            return steps(labels, index[r.status] ?? 0);
          },
        },
        actions: [
          { key: "confirm", label: "Confirm", from: ["placed"], to: "confirmed", variant: "primary", toast: (r) => `${r.code} confirmed. Stock reserved.` },
          { key: "pack", label: "Mark packed", from: ["confirmed"], to: "packed", variant: "primary", toast: (r) => `${r.code} packed.` },
          { key: "dispatch", label: "Dispatch", from: ["packed"], to: "dispatched", variant: "primary", toast: (r) => `${r.code} dispatched. Invoice issued.` },
          { key: "deliver", label: "Mark delivered", from: ["dispatched"], to: "delivered", variant: "primary", toast: (r) => `${r.code} delivered.` },
          { key: "reattempt", label: "Re-attempt delivery", from: ["delivery_failed"], to: "dispatched", variant: "secondary", toast: (r) => `${r.code} sent out again.` },
          {
            key: "cancel", label: "Cancel order", from: ["placed", "confirmed"], to: "cancelled", variant: "danger",
            confirm: destructive("Cancel order", "Reserved stock is released and any payment is refunded.", "Cancel order", "amount"),
            toast: (r) => `${r.code} cancelled. Refund recorded.`,
          },
        ],
        empty: { title: "No orders yet", message: "Orders appear when customers, field staff or partners place them." },
        pageSize: 8,
      },
      routesView,
      returnsView,
      codTasksView,
    ],
  },
  {
    key: "billing",
    title: "Billing & Invoices",
    description: "GST invoices and e-invoice (IRN) status. Issued invoices are corrected with credit notes.",
    views: [
      {
        key: "invoices",
        label: "Invoices",
        dataset: "invoices",
        entity: "invoice",
        searchPlaceholder: "Search invoice number or buyer",
        searchKeys: ["number", "buyer", "gstin"],
        columns: [
          { key: "number", header: "Invoice", primary: true, sortable: true, sub: "buyer" },
          { key: "issued", header: "Issued", format: "date", sortable: true },
          { key: "amount", header: "Amount", format: "inr", sortable: true },
          { key: "gstin", header: "Buyer GSTIN", hideOnMobile: true },
          { key: "status", header: "E-invoice", format: "status" },
        ],
        statuses: ["pending", "retrying", "generated", "dead_letter", "not_required", "cancelled"],
        details: [
          { label: "Buyer", key: "buyer" },
          { label: "Buyer GSTIN", key: "gstin" },
          { label: "Amount", key: "amount", format: "inr" },
          { label: "Issued", key: "issued", format: "date" },
        ],
        recordName: (r) => `${r.number} · ${r.buyer}`,
        note: (r) => (r.status === "generated" ? "An IRN can only be cancelled within 24 hours. After that, issue a credit note." : null),
        actions: [
          { key: "retry", label: "Retry e-invoice", from: ["dead_letter", "retrying"], to: "pending", variant: "primary", toast: (r) => `E-invoice for ${r.number} re-queued.` },
          {
            key: "cancel", label: "Cancel invoice", from: ["pending", "generated", "not_required"], to: "cancelled", variant: "danger",
            confirm: destructive("Cancel invoice", "The invoice number stays used. A cancelled IRN can't be reused.", "Cancel invoice", "amount"),
            toast: (r) => `${r.number} cancelled. Written to audit log.`,
          },
        ],
        empty: { title: "No invoices", message: "Invoices are issued when orders are dispatched." },
      },
    ],
  },
  {
    key: "finance",
    title: "Finance & Wallet",
    description: "Partner wallets and settlements. Every rupee is a ledger entry; reversals add entries, never edit them.",
    views: [
      {
        key: "settlements",
        label: "Settlements",
        dataset: "settlements",
        entity: "settlement",
        searchPlaceholder: "Search ST number or partner",
        searchKeys: ["code", "partner", "period"],
        columns: [
          { key: "code", header: "Settlement", primary: true, sortable: true, sub: "partner" },
          { key: "period", header: "Period" },
          { key: "amount", header: "Amount", format: "inr", sortable: true },
          { key: "maker", header: "Created by", hideOnMobile: true },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["pending_review", "approved", "released", "paid", "failed", "reversed", "rejected"],
        details: [
          { label: "Partner", key: "partner" },
          { label: "Period", key: "period" },
          { label: "Amount", key: "amount", format: "inr" },
          { label: "Created by (maker)", key: "maker" },
          { label: "Created", key: "created", format: "date" },
        ],
        recordName: (r) => `${r.code} · ${r.partner}`,
        timeline: {
          label: "Settlement progress",
          steps: (r) => {
            const labels = ["Created", "Reviewed", "Released", "Paid"];
            if (r.status === "rejected") return steps(labels, 1, { failed: true, metas: { 1: "Rejected" } });
            if (r.status === "failed") return steps(labels, 3, { failed: true, metas: { 3: "Payout failed" } });
            if (r.status === "reversed") return steps(labels, 3, { failed: true, metas: { 3: "Reversed to wallet" } });
            const index = { pending_review: 1, approved: 2, released: 3, paid: 4 } as Partial<Record<StatusKey, number>>;
            return steps(labels, index[r.status] ?? 0);
          },
        },
        note: (r) =>
          r.status === "pending_review"
            ? `Maker: ${r.maker}. The checker who approves must be a different person.`
            : r.status === "approved"
              ? "Releasing debits the partner wallet and starts the payout."
              : null,
        actions: [
          { key: "approve", label: "Approve", from: ["pending_review"], to: "approved", variant: "primary", toast: (r) => `${r.code} approved. Written to audit log.` },
          {
            key: "reject", label: "Reject", from: ["pending_review"], to: "rejected", variant: "danger",
            confirm: destructive("Reject settlement", "Nothing is paid. The maker can create a corrected settlement.", "Reject settlement", "amount"),
            toast: (r) => `${r.code} rejected.`,
          },
          {
            key: "release", label: "Release payment", from: ["approved"], to: "released", variant: "gold",
            confirm: financial("Confirm financial action", "Release payment updates ledgers and cannot be undone.", "Confirm and release", "amount"),
            toast: (r) => `${r.code} released. Wallet debited and written to audit log.`,
          },
          { key: "paid", label: "Mark paid (UTR)", from: ["released"], to: "paid", variant: "primary", toast: (r) => `${r.code} marked paid.` },
          {
            key: "reverse", label: "Reverse to wallet", from: ["failed"], to: "reversed", variant: "gold",
            confirm: financial("Reverse settlement", "Credits the amount back to the partner wallet as a reversal entry.", "Confirm reversal", "amount"),
            toast: (r) => `${r.code} reversed. Wallet credited.`,
          },
        ],
        empty: { title: "No settlements", message: "Settlements are created for each partner and period." },
      },
      {
        key: "wallets",
        label: "Wallets",
        dataset: "wallets",
        entity: "wallet",
        searchPlaceholder: "Search partner",
        searchKeys: ["partner", "kind"],
        columns: [
          { key: "partner", header: "Partner", primary: true, sortable: true, sub: "kind" },
          { key: "balance", header: "Balance", format: "inr", sortable: true },
          { key: "held", header: "Held for settlement", format: "inr" },
          { key: "lastTxn", header: "Last entry", format: "datetime", hideOnMobile: true },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["active", "suspended"],
        details: [
          { label: "Partner type", key: "kind" },
          { label: "Balance", key: "balance", format: "inr" },
          { label: "Held for settlement", key: "held", format: "inr" },
          { label: "Last ledger entry", key: "lastTxn", format: "datetime" },
        ],
        recordName: (r) => String(r.partner),
        note: () => "The balance is the sum of the wallet ledger. Manual adjustments need a second approver.",
        readOnly: true,
        empty: { title: "No wallets", message: "Wallets are created when a partner is activated." },
      },
      commissionView,
    ],
  },
  {
    key: "reports",
    title: "Reports & Analytics",
    description: "Reports run in the background and stay downloadable for 7 days.",
    views: [
      {
        key: "reports",
        label: "Reports",
        dataset: "reports",
        entity: "report",
        searchPlaceholder: "Search reports",
        searchKeys: ["name", "requestedBy", "range"],
        columns: [
          { key: "name", header: "Report", primary: true, sortable: true, sub: "range" },
          { key: "format", header: "Format" },
          { key: "requestedBy", header: "Requested by", hideOnMobile: true },
          { key: "requested", header: "Requested", format: "datetime", sortable: true },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["queued", "processing", "completed", "failed", "expired"],
        details: [
          { label: "Range", key: "range" },
          { label: "Format", key: "format" },
          { label: "Requested by", key: "requestedBy" },
          { label: "Requested", key: "requested", format: "datetime" },
        ],
        recordName: (r) => String(r.name),
        timeline: {
          label: "Report progress",
          steps: (r) => {
            const labels = ["Queued", "Processing", "Ready to download"];
            if (r.status === "failed") return steps(labels, 1, { failed: true, metas: { 1: "Failed after 3 attempts" } });
            if (r.status === "expired") return steps(labels, 3, { metas: { 2: "File expired after 7 days" } });
            const index = { queued: 0, processing: 1, completed: 3 } as Partial<Record<StatusKey, number>>;
            return steps(labels, index[r.status] ?? 0);
          },
        },
        actions: [
          { key: "download", label: "Download", from: ["completed"], variant: "primary", toast: (r) => `Download link for "${r.name}" created (valid 5 minutes).` },
          { key: "retry", label: "Retry", from: ["failed"], to: "queued", variant: "secondary", toast: (r) => `"${r.name}" re-queued.` },
        ],
        empty: { title: "No reports yet", message: "Request a report to export data." },
      },
    ],
  },
  {
    key: "notifications",
    title: "Notifications",
    description: "Outbound SMS and email, with delivery status, and the templates they use.",
    views: [
      {
        key: "deliveries",
        label: "Deliveries",
        dataset: "deliveries",
        entity: "delivery",
        searchPlaceholder: "Search template or recipient",
        searchKeys: ["template", "channel", "recipient"],
        columns: [
          { key: "template", header: "Template", primary: true, sortable: true, sub: "channel" },
          { key: "recipient", header: "Recipient (masked)" },
          { key: "attempts", header: "Attempts", format: "count" },
          { key: "at", header: "Time", format: "datetime", sortable: true, hideOnMobile: true },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["queued", "sent", "delivered", "retrying", "failed", "dead_letter"],
        details: [
          { label: "Channel", key: "channel" },
          { label: "Recipient (masked)", key: "recipient" },
          { label: "Attempts", key: "attempts", format: "count" },
          { label: "Time", key: "at", format: "datetime" },
        ],
        recordName: (r) => `${r.template} · ${r.recipient}`,
        actions: [
          { key: "retry", label: "Retry now", from: ["dead_letter", "failed"], to: "queued", variant: "primary", toast: () => "Message re-queued. Written to audit log." },
        ],
        empty: { title: "No messages yet", message: "Messages sent by the platform appear here." },
      },
      {
        key: "templates",
        label: "Templates",
        dataset: "templates",
        entity: "template",
        searchPlaceholder: "Search templates",
        searchKeys: ["name", "key", "channel"],
        columns: [
          { key: "name", header: "Template", primary: true, sortable: true, sub: "key" },
          { key: "channel", header: "Channel" },
          { key: "dlt", header: "DLT template ID" },
          { key: "updated", header: "Updated", format: "date", hideOnMobile: true },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["active", "draft"],
        details: [
          { label: "Key", key: "key" },
          { label: "Channel", key: "channel" },
          { label: "DLT template ID", key: "dlt" },
          { label: "Updated", key: "updated", format: "date" },
        ],
        recordName: (r) => String(r.name),
        note: (r) => (r.channel === "SMS" ? "Indian SMS needs a DLT-registered template before it can be sent." : null),
        actions: [
          { key: "activate", label: "Activate", from: ["draft"], to: "active", variant: "primary", toast: (r) => `${r.name} activated.` },
        ],
        empty: { title: "No templates", message: "Templates define the text of each message." },
      },
    ],
  },
  {
    key: "integrations",
    title: "API & Integrations",
    description: "Vendor connections and background jobs. Secrets are write-only and shown masked.",
    views: [
      {
        key: "integrations",
        label: "Integrations",
        dataset: "integrations",
        entity: "integration",
        searchPlaceholder: "Search integrations",
        searchKeys: ["name", "provider"],
        columns: [
          { key: "name", header: "Integration", primary: true, sub: "provider" },
          { key: "secret", header: "Secret" },
          { key: "queue", header: "Queue", hideOnMobile: true },
          { key: "lastSuccess", header: "Last success", format: "datetime" },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["enabled", "degraded", "disabled"],
        details: [
          { label: "Provider", key: "provider" },
          { label: "Secret", key: "secret" },
          { label: "Queue", key: "queue" },
          { label: "Last success", key: "lastSuccess", format: "datetime" },
        ],
        recordName: (r) => String(r.name),
        note: () => "Secrets are stored in the secrets manager. The panel never shows more than the last 4 characters.",
        actions: [
          {
            key: "rotate", label: "Rotate secret", from: ["enabled", "degraded"], variant: "danger",
            confirm: destructive("Rotate secret", "The old secret stops working immediately. Needs your 2FA code in the live panel.", "Rotate secret"),
            toast: (r) => `${r.name} secret rotated. Security event logged.`,
          },
          { key: "check", label: "Run health check", from: ["enabled", "degraded"], variant: "secondary", toast: (r) => `Health check queued for ${r.name}.` },
        ],
        empty: { title: "No integrations", message: "Connect a vendor to send SMS, e-invoices or payouts." },
      },
      {
        key: "dead-letters",
        label: "Failed jobs",
        dataset: "deadLetters",
        entity: "failed job",
        searchPlaceholder: "Search job or reason",
        searchKeys: ["job", "queue", "reason"],
        columns: [
          { key: "job", header: "Job", primary: true, sub: "queue" },
          { key: "reason", header: "Reason" },
          { key: "attempts", header: "Attempts", format: "count" },
          { key: "failedAt", header: "Failed", format: "datetime", sortable: true, hideOnMobile: true },
          { key: "status", header: "Status", format: "status" },
        ],
        statuses: ["open", "retried"],
        details: [
          { label: "Queue", key: "queue" },
          { label: "Reason", key: "reason" },
          { label: "Attempts", key: "attempts", format: "count" },
          { label: "Failed", key: "failedAt", format: "datetime" },
        ],
        recordName: (r) => String(r.job),
        actions: [
          { key: "retry", label: "Retry job", from: ["open"], to: "retried", variant: "primary", toast: () => "Job re-queued. Written to audit log." },
        ],
        empty: { title: "No failed jobs", message: "Jobs that fail after every retry land here." },
      },
    ],
  },
];

export function getModule(key: ModuleSpec["key"]) {
  const spec = MODULES.find((module) => module.key === key);
  if (!spec) throw new Error(`Unknown admin module: ${key}`);
  return spec;
}

/** Amount shown in confirm dialogs. */
export function amountOf(row: RecordRow, key: string | undefined) {
  const value = key ? row[key] : null;
  return typeof value === "number" ? formatINR(value) : undefined;
}
