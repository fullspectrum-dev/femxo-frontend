import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { method: string; path: string; body?: unknown; headers?: Record<string, string> }[] = [];
const reply = vi.fn<(path?: string) => unknown>();

vi.mock("@/lib/api", () => ({
  idempotencyKey: () => "adm-test-key-0001",
  api: {
    get: async (path: string, query?: unknown) => {
      calls.push({ method: "GET", path, body: query });
      return reply(path);
    },
    post: async (path: string, body?: unknown, headers?: Record<string, string>) => {
      calls.push({ method: "POST", path, body, headers });
      return reply(path);
    },
    patch: async (path: string, body: unknown) => {
      calls.push({ method: "PATCH", path, body });
      return reply(path);
    },
    delete: async (path: string) => {
      calls.push({ method: "DELETE", path });
      return reply(path);
    },
  },
}));
vi.mock("@/features/auth", () => ({ authApi: { me: async () => ({ id: "me" }), access: async () => null } }));

import { AuthApiError } from "@/features/auth/services/auth-client";
import { describeError, ERROR_MESSAGES } from "../data/error-messages";
import { accountChangeRow, payoutAccountChangesService, payoutRow, payoutsService } from "./finance.service";
import { dealersService } from "./partners.service";
import { orderNumberOf } from "./sales.service";
import { deadLettersService } from "./ops.service";

const row = (extra: Record<string, string | number | null> = {}) => ({ id: "64b000000000000000000001", status: "requested" as const, ...extra });

beforeEach(() => {
  calls.length = 0;
  reply.mockReset();
});

describe("describeError", () => {
  it("explains the new contract codes in plain words", () => {
    for (const code of ["PRICE_CHANGED", "DISCOUNT_NEEDS_APPROVAL", "PAYOUT_ACCOUNT_ON_HOLD", "OTP_LOCKED", "MAKER_CHECKER", "APPROVER_REQUIRED"]) {
      const error = new AuthApiError(code as never, "generic", 409, undefined, "backend words");
      expect(describeError(error)).toBe(ERROR_MESSAGES[code]);
    }
  });

  it("falls back to the API's own sentence, then the generic one", () => {
    expect(describeError(new AuthApiError("UNKNOWN", "generic", 409, undefined, "Role is assigned to users"))).toBe("Role is assigned to users");
    expect(describeError(new AuthApiError("NETWORK", "We couldn't reach Femxo."))).toBe("We couldn't reach Femxo.");
    expect(describeError("boom", "fallback")).toBe("fallback");
  });

  it("adds the wait on 429", () => {
    expect(describeError(new AuthApiError("OTP_LOCKED" as never, "x", 429, 30))).toContain("30s");
  });
});

describe("payouts", () => {
  it("sends an Idempotency-Key on approve and reject", async () => {
    reply.mockReturnValue({ payout: { id: "64b000000000000000000001", ownerType: "dealer", ownerId: "DLR-1", amountPaise: 100, note: "n", status: "approved", utr: null, failureReason: null, createdAt: "2026-11-01T00:00:00Z" } });
    await payoutsService.transition!(row(), "approve", "approved");
    await payoutsService.transition!(row(), "reject", "rejected", { reason: "wrong amount" });
    expect(calls.map((c) => c.headers?.["Idempotency-Key"])).toEqual(["adm-test-key-0001", "adm-test-key-0001"]);
    expect(calls[0]!.path).toBe("/finance/payouts/64b000000000000000000001/approve");
    expect(calls[1]!.body).toEqual({ reason: "wrong amount" });
  });

  it("maps a payout to a row", () => {
    const r = payoutRow({ id: "64b0000000000000000000ab", ownerType: "sub_dealer", ownerId: "SDL-2", amountPaise: 5000, note: "", status: "paid", utr: "U1", failureReason: null, createdAt: "2026-11-02T10:00:00Z" });
    expect(r).toMatchObject({ code: "PO-0000AB", kind: "Sub-dealer", amount: 5000, created: "2026-11-02" });
  });
});

describe("bank account changes", () => {
  const change = {
    id: "64b000000000000000000002", ownerType: "dealer" as const, ownerId: "DLR-9", status: "pending" as const,
    requested: { ifsc: "HDFC0001234", last4: "4321", holderName: "Anand" }, current: null,
    requestedBy: "u1", requestedAt: "2026-11-03T00:00:00Z", decidedBy: null, decidedAt: null, reason: null, activeFrom: null,
  };

  it("masks and labels accounts", () => {
    const r = accountChangeRow(change, new Map([["u1", "Asha"]]));
    expect(r).toMatchObject({ requested: "Anand · HDFC0001234 · ••••4321", current: "None (first account)", requestedBy: "Asha" });
  });

  it("approves and rejects with a key and the reason", async () => {
    reply.mockReturnValue({ change, items: [] });
    await payoutAccountChangesService.transition!(row(), "approve", "approved");
    await payoutAccountChangesService.transition!(row(), "reject", "rejected", { reason: "mismatch" });
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts[0]).toMatchObject({ path: "/finance/payout-account-changes/64b000000000000000000001/approve", body: {}, headers: { "Idempotency-Key": "adm-test-key-0001" } });
    expect(posts[1]!.body).toEqual({ reason: "mismatch" });
  });
});

describe("dealer lifecycle", () => {
  const dealer = { id: "64b000000000000000000003", dealerId: "DLR-3", businessName: "B", ownerName: "O", mobile: "9876543210", territoryPath: ["district:1"], status: "submitted", rev: 2, createdAt: "2026-11-01T00:00:00Z" };
  beforeEach(() => reply.mockImplementation((path) => (path?.startsWith("/territories") ? { territory: { name: "Patna" } } : { dealer })));

  it("submit carries the revision and the chosen approver", async () => {
    await dealersService.transition!(row({ rev: 1 }), "submit", "submitted", { picked: "64b0000000000000000000aa" });
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: "/dealer/dealers/64b000000000000000000001/submit", body: { rev: 1, approverId: "64b0000000000000000000aa" } });
  });

  it("activate, suspend and reactivate", async () => {
    await dealersService.transition!(row({ rev: 4 }), "activate", "active");
    await dealersService.transition!(row({ rev: 5 }), "suspend", "suspended", { reason: "complaint" });
    await dealersService.transition!(row({ rev: 6 }), "reactivate", "active", { reason: "resolved" });
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts.map((c) => [c.path.split("/").pop(), c.body])).toEqual([
      ["activate", { rev: 4 }],
      ["suspend", { rev: 5, reason: "complaint" }],
      ["reactivate", { rev: 6, reason: "resolved" }],
    ]);
  });
});

describe("small contracts", () => {
  it("only sends a full order number as a filter", () => {
    expect(orderNumberOf("ord-42")).toBe("ord-42");
    expect(orderNumberOf("ORD")).toBeUndefined();
    expect(orderNumberOf(" ")).toBeUndefined();
  });

  it("encodes a dead letter id in the path", async () => {
    reply.mockReturnValue({ outcome: {} });
    await deadLettersService.transition!(row({ job: "j" }) as never, "retry", "retried" as never);
    expect(calls[0]!.path).toBe("/admin/dead-letters/64b000000000000000000001/retry");
    calls.length = 0;
    await deadLettersService.transition!({ id: "q:a/b", status: "open" } as never, "retry", "retried" as never);
    expect(calls[0]!.path).toBe("/admin/dead-letters/q%3Aa%2Fb/retry");
  });
});
