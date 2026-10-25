import type { ApiAdapter } from "./adapter";

/**
 * Attaches the current access token to every request that doesn't carry
 * one. The token lives in memory in the session provider; domain clients
 * never see it.
 */
export function withAuth(adapter: ApiAdapter, getAccessToken: () => string | undefined): ApiAdapter {
  return {
    send: (req) => adapter.send(req.accessToken ? req : { ...req, accessToken: getAccessToken() }),
  };
}
