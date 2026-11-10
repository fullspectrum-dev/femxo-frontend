import type { RecordRow } from "./records";

/** A refusal from the API, in the one shape the admin screens handle. */
export class ApiRefusal extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "INTERNAL_ERROR" | "INVALID_TRANSITION" | "NOT_FOUND",
    message: string
  ) {
    super(message);
    this.name = "ApiRefusal";
  }
}

/** A page of rows. `total` is null: the API pages by cursor and doesn't count. */
export interface Page {
  items: RecordRow[];
  nextCursor: string | null;
  total: number | null;
}

export interface ListQuery {
  q?: string;
  status?: string;
  cursor?: string | null;
  limit: number;
}
