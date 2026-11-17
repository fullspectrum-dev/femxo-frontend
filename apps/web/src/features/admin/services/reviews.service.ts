import { api } from "@/lib/api";
import type { RecordRow } from "../data/records";
import { pageOf } from "./shared";
import type { LiveService } from "./types";

/* Review moderation against femxo-backend (/reviews, ADR 0021): customers' reviews wait as pending until staff publish or reject them. */

export type ReviewStatus = "pending" | "published" | "rejected";

export interface ApiReview {
  id: string;
  productId: string;
  customerId: string;
  rating: number;
  title: string;
  body: string;
  authorName: string;
  status: ReviewStatus;
  moderatedBy: string | null;
  moderatedAt: string | null;
  moderationReason: string | null;
  createdAt: string;
}

export const stars = (rating: number) => `${"★".repeat(Math.max(0, Math.min(5, rating)))}${"☆".repeat(Math.max(0, 5 - rating))} (${rating}/5)`;

export function reviewRow(r: ApiReview): RecordRow {
  return {
    id: r.id,
    summary: r.title || r.body.slice(0, 60),
    author: r.authorName,
    rating: r.rating,
    stars: stars(r.rating),
    title: r.title || null,
    body: r.body,
    productId: r.productId,
    customerId: r.customerId,
    created: r.createdAt,
    moderatedAt: r.moderatedAt,
    reason: r.moderationReason,
    status: r.status,
  };
}

export const reviewsService: LiveService = {
  actions: ["publish", "reject"],
  searchPlaceholder: "Filter the reviews on this page…",
  async list({ q, status, cursor, limit }) {
    // The API shows one status at a time and starts with pending: the queue.
    const res = await api.get<{ items: ApiReview[]; nextCursor: string | null }>("/reviews", { status: status || "pending", cursor, limit });
    const needle = q?.trim().toLowerCase();
    const rows = res.items.map(reviewRow).filter((r) => !needle || [r.summary, r.author, r.body, r.productId].some((v) => String(v ?? "").toLowerCase().includes(needle)));
    return pageOf(rows, res.nextCursor);
  },
  async transition(row, actionKey, _to, context) {
    const body = { decision: actionKey === "publish" ? "publish" : "reject", ...(context?.reason ? { reason: context.reason } : {}) };
    const res = await api.post<{ review: ApiReview }>(`/reviews/${row.id}/moderate`, body);
    return reviewRow(res.review);
  },
};
