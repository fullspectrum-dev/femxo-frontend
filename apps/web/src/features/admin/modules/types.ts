import type { ComponentType } from "react";
import type { ButtonVariant, ConfirmKind, StatusKey, TimelineStep } from "@/components/admin-ui";
import type { Cell, DatasetKey, RecordRow } from "../data/records";
import type { ModuleKey } from "../nav";

/** How a cell value is shown. Money cells hold paise. */
export type CellFormat = "text" | "inr" | "inr2" | "count" | "date" | "datetime" | "gst" | "units" | "status";

export interface ColumnSpec {
  key: string;
  header: string;
  format?: CellFormat;
  sortable?: boolean;
  /** The row's name: bold in the table, card title on phones. */
  primary?: boolean;
  /** A second field shown muted under this one (e.g. code under name). */
  sub?: string;
  hideOnMobile?: boolean;
}

export interface DetailSpec {
  label: string;
  key: string;
  format?: CellFormat;
}

export interface FormFieldSpec {
  name: string;
  label: string;
  kind: "text" | "email" | "tel" | "password" | "number" | "money" | "select" | "textarea" | "images";
  required?: boolean;
  placeholder?: string;
  helper?: string;
  options?: readonly string[];
  pattern?: { regex: RegExp; message: string };
  /** For number and money fields (money in rupees). */
  min?: number;
  /** Upper-case as the user types (GSTIN, PAN, SKU). */
  uppercase?: boolean;
}

export type FormValues = Record<string, string>;

/** An image already saved on a record (edit forms). `url` is null until it has been processed. */
export interface ExistingImage {
  id: string;
  alt: string;
  url: string | null;
  status: string;
  reason: string | null;
}

/** An edit form for live records. `load` fetches the record's current values from the API. */
export interface EditSpec {
  label: string;
  title: string;
  description: string;
  fields: readonly FormFieldSpec[];
  validate?: (values: FormValues) => Partial<Record<string, string>>;
  load: (row: RecordRow) => Promise<{
    values: FormValues;
    images: ExistingImage[];
    /** Shown above the form, e.g. which pack size is being edited. */
    note?: string;
    /** Dropdown options, including the record's current choice even if it has since been archived. */
    options?: Record<string, readonly string[]>;
  }>;
  toast: (values: FormValues) => string;
  /** Records the Edit button is offered for (e.g. only draft applications). All when omitted. */
  when?: (row: RecordRow) => boolean;
}

export interface CreateSpec {
  label: string;
  title: string;
  description: string;
  fields: readonly FormFieldSpec[];
  status: StatusKey;
  /** Rules across fields, e.g. dealer price ≤ MRP. Returns field → message. */
  validate?: (values: FormValues) => Partial<Record<string, string>>;
  toRow: (values: FormValues) => Record<string, Cell>;
  toast: (values: FormValues) => string;
  /** Live forms: loads dropdown options (field name → options) from the API when the dialog opens. */
  prepare?: () => Promise<Record<string, readonly string[]>>;
}

export interface ActionSpec {
  key: string;
  label: string;
  /** States the action is allowed from (the server enforces the same). */
  from: readonly StatusKey[];
  /** Omitted for actions that don't change state (download, health check). */
  to?: StatusKey;
  variant: ButtonVariant;
  /** Financial and destructive actions name the amount and record first. */
  confirm?: {
    kind: ConfirmKind;
    title: string;
    description: string;
    amountKey?: string;
    confirmLabel: string;
    /** Asks for a written reason (kept in the audit log) before the action runs. Live mode only. */
    reason?: { label: string; min: number };
    /** Asks to choose one option (e.g. the approver) before the action runs. Live mode only. */
    pick?: { label: string; options: (row: RecordRow) => Promise<readonly { value: string; label: string }[]> };
  };
  /** Hidden from everyone but a Super Admin (the server refuses the rest anyway). */
  superAdminOnly?: boolean;
  /** A backend permission the action needs (Super Admins always pass); hidden from users without it. */
  requires?: string;
  toast: (row: RecordRow) => string;
  patch?: (row: RecordRow) => Record<string, Cell>;
}

export interface ViewSpec {
  key: string;
  label: string;
  dataset: DatasetKey;
  /** Singular noun for messages: "dealer". */
  entity: string;
  searchPlaceholder: string;
  searchKeys: readonly string[];
  columns: readonly ColumnSpec[];
  statuses: readonly StatusKey[];
  details: readonly DetailSpec[];
  recordName: (row: RecordRow) => string;
  subtitle?: (row: RecordRow) => string;
  timeline?: { label: string; steps: (row: RecordRow) => TimelineStep[] };
  /** A note shown in the detail drawer, e.g. the four-eyes rule. */
  note?: (row: RecordRow) => string | null;
  create?: CreateSpec;
  /** Live mode only: an Edit button in the detail drawer. */
  edit?: EditSpec;
  actions?: readonly ActionSpec[];
  /** Records here can't be changed from the panel (audit logs, ledgers). */
  readOnly?: boolean;
  empty: { title: string; message: string };
  pageSize?: number;
  /** Live mode: on/off filters shown above the list (e.g. "Assigned to me"); the keys that are on reach `list` as `flags`. */
  filters?: readonly { key: string; label: string }[];
  /** Live mode: more of the record in the detail drawer (history, assignments). `onChanged` refreshes the list. */
  extra?: ComponentType<{ row: RecordRow; onChanged: () => void }>;
  /** Live mode: a card above the list (e.g. a setting for the whole view). */
  banner?: ComponentType<{ from?: string; to?: string }>;
  /** Live mode: first and last day inputs above the list; they reach `list` as `from` and `to`. */
  dateRange?: boolean;
  /** No button row in the detail drawer: the record has its own buttons in `extra`. */
  noFooter?: boolean;
  /** Live mode: smallest and largest amount (₹) inputs above the list; they reach `list` as `minPaise` and `maxPaise`. */
  amountRange?: boolean;
  /** A whole screen instead of the list (e.g. the reconciliation report). Needs no dataset service. */
  custom?: ComponentType;
}

export interface ModuleSpec {
  key: Exclude<ModuleKey, "dashboard" | "company">;
  title: string;
  description: string;
  views: readonly ViewSpec[];
}
