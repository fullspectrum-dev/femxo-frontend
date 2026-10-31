import { authApi } from "@/features/auth/services/auth-api";
import type { HttpMethod } from "@/features/auth/services/auth-client";

/*
 * The one HTTP client for femxo-backend's admin routes. It rides on the auth
 * client, so every call carries the in-memory access token, refreshes once on
 * a 401, and fails with AuthApiError({ code, status }) taken from the API's
 * `{ error: { code, message } }` body.
 */

type Query = Record<string, string | number | boolean | undefined | null>;

export function withQuery(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

const call = <T>(method: HttpMethod, path: string, body?: unknown, headers?: Record<string, string>) =>
  authApi.request<T>(method, path, body, headers);

/** A fresh key per user action (the backend wants 8 to 100 letters, digits, - or _). */
export const idempotencyKey = () => `adm-${crypto.randomUUID()}`;

export const api = {
  get: <T>(path: string, query?: Query) => call<T>("GET", withQuery(path, query)),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => call<T>("POST", path, body ?? {}, headers),
  put: <T>(path: string, body?: unknown) => call<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => call<T>("PATCH", path, body),
  delete: <T = void>(path: string) => call<T>("DELETE", path),
};
