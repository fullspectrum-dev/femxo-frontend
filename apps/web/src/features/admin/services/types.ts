import type { StatusKey } from "@/components/admin-ui";
import type { Cell, RecordRow } from "../data/records";
import type { CreateSpec, EditSpec, FormValues } from "../modules/types";

/** A page of rows. `total` is null: the API pages by cursor and doesn't count. */
export interface LivePage {
  items: RecordRow[];
  nextCursor: string | null;
  total: number | null;
}

export interface LiveListQuery {
  q?: string;
  status?: string;
  cursor?: string | null;
  limit: number;
}

/** What one dataset can do against the real API. Missing methods mean the panel hides that action. */
export interface LiveService {
  list(query: LiveListQuery): Promise<LivePage>;
  create?(values: Record<string, Cell>, files?: File[]): Promise<RecordRow>;
  /** Saves an edit. `removedImageIds` are saved images to delete; `files` are new ones to add. */
  update?(row: RecordRow, values: FormValues, files: File[], removedImageIds: string[]): Promise<RecordRow>;
  editSpec?: EditSpec;
  /** Apply an action. `actionKey` is the registry action's key; throws if the API refuses. */
  transition?(row: RecordRow, actionKey: string, to: StatusKey): Promise<RecordRow>;
  /** Registry action keys this service can run; others are hidden. */
  actions?: readonly string[];
  /** Whether the create form works against the API. */
  canCreate?: boolean;
  /** A create form written for this API; used instead of the prototype's form. */
  createSpec?: CreateSpec;
  /** What the search box really matches against this API (replaces the prototype's placeholder). */
  searchPlaceholder?: string;
  /** Wording fixes for actions whose API behaviour differs from the prototype's label (e.g. archive that really deletes). */
  actionOverrides?: Record<string, { label?: string; confirm?: { title: string; description: string; confirmLabel: string }; toast?: (row: RecordRow) => string }>;
}

/** The record was saved but a later step (e.g. an image upload) failed: show the row, and say what is missing. */
export class PartialSaveError extends Error {
  constructor(
    readonly row: RecordRow,
    message: string
  ) {
    super(message);
    this.name = "PartialSaveError";
  }
}
