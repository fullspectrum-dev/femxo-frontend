import { z } from "zod";
import type { AccessSummary, AuthErrorCode, AuthUser, TerritoryTrail } from "../types/auth";
import { reportAuthFailure } from "./auth-monitoring";

/*
 * Talks to femxo-backend's /auth and /access routes.
 *
 * - The access token (15 minutes) lives only in memory, never in storage.
 * - The refresh token is an httpOnly cookie scoped to /auth, so page code
 *   can't read it; POST /auth/refresh swaps it for a new pair.
 * - Refresh tokens rotate and the backend revokes the whole session if an old
 *   one is reused, so refreshes must never race: one in flight per tab, and
 *   a Web Lock serialises tabs (the cookie jar is shared between them).
 */

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  isSuperAdmin: z.boolean(),
  status: z.enum(["active", "disabled"]),
  mustChangePassword: z.boolean(),
  createdAt: z.string(),
});
const tokenSchema = z.object({ accessToken: z.string().min(1), expiresIn: z.number().positive() });
const loginSchema = tokenSchema.extend({ user: userSchema });
const meSchema = z.object({ user: userSchema });
const accessSchema = z.object({
  isSuperAdmin: z.boolean(),
  permissions: z.array(z.string()),
  // Added to the backend after the first release; older APIs omit it.
  roles: z.array(z.string()).default([]),
  territoryIds: z.array(z.string()),
  locationIds: z.array(z.string()),
});
const placeSchema = z.object({ id: z.string(), type: z.string(), name: z.string() });
const trailSchema = z.object({ territory: placeSchema, ancestors: z.array(placeSchema) });
const errorBodySchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface TransportRequest {
  method: HttpMethod;
  path: string;
  body?: unknown;
  accessToken?: string;
  /** Extra headers, e.g. Idempotency-Key. */
  headers?: Record<string, string>;
}

export interface TransportResponse {
  status: number;
  body: unknown;
  retryAfterSeconds?: number;
}

/** Sends one request. Throws AuthApiError("NETWORK" | "TIMEOUT") if it never got an answer. */
export type Transport = (request: TransportRequest) => Promise<TransportResponse>;

const FRIENDLY_MESSAGES: Partial<Record<AuthErrorCode, string>> = {
  INVALID_CREDENTIALS: "That email and password don't match. Check them and try again.",
  ACCOUNT_DISABLED: "This account is disabled. Ask your admin to turn it back on.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Please wait before trying again.",
  UNAUTHENTICATED: "Your session has ended. Please sign in again.",
  PASSWORD_CHANGE_REQUIRED: "Choose a new password to continue.",
  WRONG_PASSWORD: "Your current password is wrong.",
  PASSWORD_UNCHANGED: "Your new password must be different from the current one.",
  VALIDATION_ERROR: "Some details need attention. Check the form and try again.",
  FORBIDDEN: "You don't have permission to do this.",
  NETWORK: "We couldn't reach Femxo. Check your connection and try again.",
  TIMEOUT: "The request took too long. Please try again.",
  INVALID_RESPONSE: "Femxo sent an unexpected response. Please try again.",
};

export class AuthApiError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(code: AuthErrorCode, message: string, status?: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "AuthApiError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const isAuthError = (error: unknown, code: AuthErrorCode) =>
  error instanceof AuthApiError && error.code === code;

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 12_000;
/** Refresh a little before expiry so requests don't fail on the boundary. */
const EXPIRY_MARGIN_MS = 30_000;

/** Same-origin by default (next.config rewrites /auth and /access to the API). */
export const fetchTransport: Transport = async ({ method, path, body, accessToken, headers }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: "include",
      cache: "no-store",
      headers: {
        ...headers,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = response.status === 204 ? "" : await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
    }
    const retryAfter = Number(response.headers.get("Retry-After"));
    return {
      status: response.status,
      body: parsed,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    };
  } catch {
    const code = controller.signal.aborted ? "TIMEOUT" : "NETWORK";
    throw new AuthApiError(code, FRIENDLY_MESSAGES[code]!);
  } finally {
    clearTimeout(timeout);
  }
};

function toError(path: string, response: TransportResponse): AuthApiError {
  const parsed = errorBodySchema.safeParse(response.body);
  const code = (parsed.success ? parsed.data.error.code : "UNKNOWN") as AuthErrorCode;
  reportAuthFailure({ endpoint: path, status: response.status, kind: "http" });

  // WEAK_PASSWORD's message carries the length rule for this account.
  const message =
    code === "WEAK_PASSWORD" && parsed.success
      ? parsed.data.error.message
      : FRIENDLY_MESSAGES[code] ??
        (response.status >= 500
          ? "Sign-in is temporarily unavailable. Please try again shortly."
          : "We couldn't complete that request. Please try again.");
  return new AuthApiError(code, message, response.status, response.retryAfterSeconds);
}

function parseBody<T>(path: string, schema: z.ZodType<T>, response: TransportResponse): T {
  const parsed = schema.safeParse(response.body);
  if (!parsed.success) {
    reportAuthFailure({ endpoint: path, status: response.status, kind: "invalid_response" });
    throw new AuthApiError("INVALID_RESPONSE", FRIENDLY_MESSAGES.INVALID_RESPONSE!, response.status);
  }
  return parsed.data;
}

/** Runs `task` while holding a cross-tab lock, when the browser supports it. */
function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  // lib.dom types the result as Promise<Promise<T>>; the lock resolves with the task's value.
  return locks ? (locks.request("femxo-auth-refresh", task) as unknown as Promise<T>) : task();
}

export function createAuthClient(transport: Transport) {
  let accessToken: string | null = null;
  let expiresAt = 0;
  let refreshing: Promise<void> | null = null;

  function storeToken(token: { accessToken: string; expiresIn: number }) {
    accessToken = token.accessToken;
    expiresAt = Date.now() + token.expiresIn * 1000;
  }

  function clearToken() {
    accessToken = null;
    expiresAt = 0;
  }

  async function send(request: TransportRequest) {
    try {
      return await transport(request);
    } catch (error) {
      if (error instanceof AuthApiError) {
        reportAuthFailure({ endpoint: request.path, kind: error.code === "TIMEOUT" ? "timeout" : "network" });
        throw error;
      }
      throw new AuthApiError("NETWORK", FRIENDLY_MESSAGES.NETWORK!);
    }
  }

  /** Gets a new access token from the refresh cookie. Concurrent callers share one request. */
  function refresh(): Promise<void> {
    refreshing ??= withRefreshLock(async () => {
      const response = await send({ method: "POST", path: "/auth/refresh" });
      if (response.status !== 200) {
        clearToken();
        throw toError("/auth/refresh", response);
      }
      storeToken(parseBody("/auth/refresh", tokenSchema, response));
    }).finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  /** A request that needs the access token; refreshes once and retries on 401. */
  async function authorized<T>(
    method: HttpMethod,
    path: string,
    schema: z.ZodType<T> | null,
    body?: unknown,
    headers?: Record<string, string>
  ) {
    if (!accessToken || Date.now() > expiresAt - EXPIRY_MARGIN_MS) await refresh();

    let response = await send({ method, path, body, headers, accessToken: accessToken ?? undefined });
    if (response.status === 401) {
      await refresh();
      response = await send({ method, path, body, headers, accessToken: accessToken ?? undefined });
    }
    if (response.status >= 400) throw toError(path, response);
    return schema ? parseBody(path, schema, response) : (undefined as T);
  }

  return {
    async login(email: string, password: string): Promise<AuthUser> {
      const response = await send({ method: "POST", path: "/auth/login", body: { email, password } });
      if (response.status !== 200) throw toError("/auth/login", response);
      const { user, ...token } = parseBody("/auth/login", loginSchema, response);
      storeToken(token);
      return user;
    },

    /** The signed-in user after a page load, or null when there's no valid session. */
    async restoreSession(): Promise<AuthUser | null> {
      try {
        if (!accessToken) await refresh();
        return await this.me();
      } catch (error) {
        if (isAuthError(error, "UNAUTHENTICATED")) return null;
        throw error;
      }
    },

    async me(): Promise<AuthUser> {
      return (await authorized("GET", "/auth/me", meSchema)).user;
    },

    /** Fails with PASSWORD_CHANGE_REQUIRED until a temporary password is replaced. */
    access(): Promise<AccessSummary> {
      return authorized("GET", "/access/me", accessSchema);
    },

    territory(id: string): Promise<TerritoryTrail> {
      return authorized("GET", `/territories/${encodeURIComponent(id)}`, trailSchema);
    },

    /** Any other authenticated route. The caller narrows the response; the backend's own validation is the contract. */
    request<T>(method: HttpMethod, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
      return authorized(method, path, z.custom<T>(() => true), body, headers);
    },

    /** Also signs out the user's other sessions (the backend keeps this one). */
    changePassword(currentPassword: string, newPassword: string): Promise<void> {
      return authorized("POST", "/auth/password", null, { currentPassword, newPassword });
    },

    async logout(): Promise<void> {
      try {
        await send({ method: "POST", path: "/auth/logout" });
      } finally {
        clearToken();
      }
    },
  };
}

export type AuthClient = ReturnType<typeof createAuthClient>;
