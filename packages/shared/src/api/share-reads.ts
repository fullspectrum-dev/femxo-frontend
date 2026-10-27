import type { ApiAdapter, ApiResponse } from "./adapter";

/**
 * Lets identical reads made at the same moment share one request and its answer
 * (two components asking for the same list, or React running an effect twice in
 * development). Writes are never shared, and neither is a read that can be
 * cancelled: one caller's abort mustn't cancel another's.
 */
export function shareReads(adapter: ApiAdapter): ApiAdapter {
  const inFlight = new Map<string, Promise<ApiResponse>>();
  return {
    send(req) {
      if (req.method !== "GET" || req.signal) return adapter.send(req);
      const key = JSON.stringify([req.path, req.query ?? null, req.accessToken ?? null]);
      let shared = inFlight.get(key);
      if (!shared) {
        shared = adapter.send(req).finally(() => inFlight.delete(key));
        inFlight.set(key, shared);
      }
      return shared;
    },
  };
}
