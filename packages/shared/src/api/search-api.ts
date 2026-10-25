import { z } from "zod";
import { SearchResult, Suggestion, type SearchQueryInput } from "../contracts/search";
import type { ApiAdapter } from "./adapter";
import { toQueryParams } from "./products-api";
import { request } from "./request";

/** SearchApi: faceted search and the suggestions under the search box. */
export function createSearchApi(adapter: ApiAdapter) {
  return {
    search: (input: SearchQueryInput = {}, signal?: AbortSignal) =>
      request(adapter, { method: "GET", path: "/search", query: toQueryParams(input), signal }, SearchResult),
    /** Pass a signal to drop a stale request when the customer keeps typing. */
    suggest: (q: string, signal?: AbortSignal) =>
      request(adapter, { method: "GET", path: "/search/suggest", query: { q }, signal }, z.array(Suggestion)),
  };
}

export type SearchApi = ReturnType<typeof createSearchApi>;
