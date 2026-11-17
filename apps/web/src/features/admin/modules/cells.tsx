import type { ReactNode } from "react";
import { StatusBadge, isStatusKey } from "@/components/admin-ui";
import type { Cell, RecordRow } from "../data/records";
import { formatCount, formatDate, formatDateTime, formatINR, formatINRExact, formatPercentBps } from "../format";
import type { CellFormat, ColumnSpec } from "./types";

export function formatCell(value: Cell | undefined, format: CellFormat = "text"): ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  switch (format) {
    case "status":
      return typeof value === "string" && isStatusKey(value) ? <StatusBadge status={value} /> : String(value);
    case "inr":
      return typeof value === "number" ? formatINR(value) : value;
    case "inr2":
      return typeof value === "number" ? formatINRExact(value) : value;
    case "count":
      return typeof value === "number" ? formatCount(value) : value;
    case "units":
      return typeof value === "number" ? `${value > 0 ? "+" : ""}${formatCount(value)}` : value;
    case "gst":
      return typeof value === "number" ? formatPercentBps(value) : value;
    case "date":
      return typeof value === "string" ? formatDate(value) : value;
    case "datetime":
      return typeof value === "string" ? formatDateTime(value) : value;
    default:
      return String(value);
  }
}

export function renderColumn(column: ColumnSpec, row: RecordRow): ReactNode {
  const main = formatCell(row[column.key], column.format);
  if (!column.sub) return main;
  return (
    <span className="grid">
      <span>{main}</span>
      <span className="text-[12px] font-normal fx-muted">{formatCell(row[column.sub])}</span>
    </span>
  );
}
