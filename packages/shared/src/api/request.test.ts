import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createHttpAdapter } from "../adapters/http/http-adapter";
import { logger } from "../lib/logger";
import type { ApiAdapter, ApiRequest, ApiResponse } from "./adapter";
import { ApiError, isApiError } from "./errors";
import { request } from "./request";

const reply = (res: ApiResponse) => {
  const send = vi.fn<(req: ApiRequest) => Promise<ApiResponse>>(async () => res);
  return { adapter: { send } satisfies ApiAdapter, send };
};

const Thing = z.object({ id: z.string() });

afterEach(() => vi.restoreAllMocks());

describe("request()", () => {
  it("returns the parsed body on 2xx", async () => {
    const { adapter } = reply({ status: 200, body: { id: "a", extra: 1 } });
    await expect(request(adapter, { method: "GET", path: "/x" }, Thing)).resolves.toEqual({ id: "a" });
  });

  it("returns undefined without a schema", async () => {
    const { adapter } = reply({ status: 204, body: null });
    await expect(request(adapter, { method: "DELETE", path: "/x" })).resolves.toBeUndefined();
  });

  it("adds an idempotency key to writes only, keeping a caller's key", async () => {
    const { adapter, send } = reply({ status: 200, body: { id: "a" } });
    await request(adapter, { method: "GET", path: "/x" }, Thing);
    await request(adapter, { method: "POST", path: "/x" }, Thing);
    await request(adapter, { method: "PATCH", path: "/x", idempotencyKey: "mine" }, Thing);
    expect(send.mock.calls[0]![0].idempotencyKey).toBeUndefined();
    expect(send.mock.calls[1]![0].idempotencyKey).toEqual(expect.any(String));
    expect(send.mock.calls[1]![0].idempotencyKey!.length).toBeGreaterThan(0);
    expect(send.mock.calls[2]![0].idempotencyKey).toBe("mine");
  });

  it("turns a contract violation into an INTERNAL ApiError", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const { adapter } = reply({ status: 200, body: { id: 42 } });
    const error = await request(adapter, { method: "GET", path: "/x" }, Thing).catch((e: unknown) => e);
    expect(isApiError(error, "INTERNAL")).toBe(true);
    expect((error as ApiError).status).toBe(200);
  });

  it("maps the backend error envelope, details and Retry-After", async () => {
    const { adapter } = reply({
      status: 409,
      body: { error: { code: "OUT_OF_STOCK", message: "Gone", details: { available: 0 } } },
      headers: { "retry-after": "7" },
    });
    const error = (await request(adapter, { method: "POST", path: "/cart" }).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "OUT_OF_STOCK", message: "Gone", details: { available: 0 }, retryAfterSeconds: 7 });
  });

  it("omits retryAfterSeconds when the header is absent", async () => {
    const { adapter } = reply({ status: 401, body: { error: { code: "UNAUTHENTICATED", message: "No" } } });
    const error = (await request(adapter, { method: "GET", path: "/me" }).catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("UNAUTHENTICATED");
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it("falls back to INTERNAL for a body that is not the error envelope", async () => {
    for (const body of [null, "<html>", { error: "x" }, { error: { message: "no code" } }]) {
      const { adapter } = reply({ status: 502, body });
      const error = (await request(adapter, { method: "GET", path: "/x" }).catch((e: unknown) => e)) as ApiError;
      expect(error).toMatchObject({ status: 502, code: "INTERNAL", message: "Request failed with status 502." });
    }
  });

  it("keeps any backend error code (the backend's list is open, e.g. OTP_INVALID)", async () => {
    const { adapter } = reply({ status: 400, body: { error: { code: "OTP_INVALID", message: "The code is wrong or has expired" } } });
    const error = (await request(adapter, { method: "POST", path: "/x" }).catch((e: unknown) => e)) as ApiError;
    expect(error).toMatchObject({ status: 400, code: "OTP_INVALID" });
  });
});

describe("createHttpAdapter", () => {
  const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

  it("builds the URL, headers and body", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse({ ok: true }));
    const http = createHttpAdapter({ baseUrl: "https://api.test", fetch: fetch as typeof globalThis.fetch, csrfToken: () => "csrf" });
    const res = await http.send({
      method: "POST",
      path: "/cart",
      query: { a: 1, b: ["x", "y"], skip: undefined, none: null },
      body: { n: 1 },
      idempotencyKey: "k1",
      accessToken: "tok",
    });
    expect(res).toMatchObject({ status: 200, body: { ok: true } });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.test/cart?a=1&b=x&b=y");
    const headers = init!.headers as Headers;
    expect(headers.get("Idempotency-Key")).toBe("k1");
    expect(headers.get("Authorization")).toBe("Bearer tok");
    expect(headers.get("X-CSRF-Token")).toBe("csrf");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(init!.body).toBe('{"n":1}');
    expect(init!.credentials).toBe("include");
  });

  it("returns a null body for non-JSON responses", async () => {
    const fetch = vi.fn(async () => new Response("oops", { status: 500, headers: { "content-type": "text/html" } }));
    const http = createHttpAdapter({ baseUrl: "", fetch: fetch as typeof globalThis.fetch });
    await expect(http.send({ method: "GET", path: "/x" })).resolves.toMatchObject({ status: 500, body: null });
  });

  it("maps a network failure to ApiError status 0", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const http = createHttpAdapter({ baseUrl: "", fetch: fetch as typeof globalThis.fetch });
    const error = (await http.send({ method: "GET", path: "/x" }).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: "INTERNAL" });
  });

  it("end to end through request(): envelope errors and Retry-After survive", async () => {
    const fetch = vi.fn(async () => jsonResponse({ error: { code: "RATE_LIMITED", message: "Slow down" } }, 429, { "Retry-After": "30" }));
    const http = createHttpAdapter({ baseUrl: "", fetch: fetch as typeof globalThis.fetch });
    const error = (await request(http, { method: "GET", path: "/x" }).catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(30);
  });
});
