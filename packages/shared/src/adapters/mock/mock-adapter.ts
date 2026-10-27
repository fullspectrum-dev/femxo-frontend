import { z } from "zod";
import { isWrite, type ApiAdapter, type ApiRequest, type ApiResponse, type QueryValue } from "../../api/adapter";
import { ApiError } from "../../api/errors";
import { createClock, type Clock } from "../../lib/clock";
import { logger } from "../../lib/logger";
import { createRng } from "../../lib/rng";
import { errorBody, MockHttpError } from "./errors";
import type { MockQuery, MockRouter } from "./router";
import { createMemoryStore, type MockStore } from "./store";

const IDEMPOTENCY_TTL_MS = 24 * 3600 * 1000;

export interface IdempotencyRecord {
  fingerprint: string;
  response: ApiResponse;
  at: number;
}

export type ForcedOutcome = "server-error" | "offline";

export interface MockAdapterOptions<S> {
  router: MockRouter<S>;
  store: MockStore<S>;
  clock?: Clock;
  /** Simulated network delay; false in unit tests. */
  latency?: { min: number; max: number } | false;
  sleep?: (ms: number) => Promise<void>;
  /** Random 500s on reads, while switched on (devtools). */
  chaos?: () => { enabled: boolean; failureRate: number };
  /** Kept separately from app state; persisted in the browser so a retry after a reload still matches. */
  idempotencyStore?: MockStore<Record<string, IdempotencyRecord>>;
  seed?: number;
}

function toQuery(query: Record<string, QueryValue> = {}): MockQuery {
  const result: MockQuery = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    result[key] = Array.isArray(value) ? [...value] : String(value);
  }
  return result;
}

const respond = (status: number, body: unknown, headers?: Record<string, string>): ApiResponse => ({ status, body, headers });

function errorResponse(error: unknown): ApiResponse {
  if (error instanceof MockHttpError) return respond(error.status, errorBody(error.code, error.message, error.details), error.headers);
  if (error instanceof z.ZodError) {
    const fields = Object.fromEntries(error.issues.map((issue) => [issue.path.join(".") || "_", issue.message]));
    return respond(422, errorBody("VALIDATION_FAILED", "Some fields need attention.", { fields }));
  }
  logger.error("Mock handler crashed", error instanceof Error ? error.message : error);
  return respond(500, errorBody("INTERNAL", "Something went wrong on our side."));
}

/**
 * The in-browser stand-in for femxo-backend. Same requests as HttpAdapter,
 * routed to handlers, with the behaviours a real API has: latency, failures
 * on demand, idempotent writes, validation, and transactional state.
 */
export function createMockAdapter<S>({
  router,
  store,
  clock = createClock(),
  latency = { min: 300, max: 600 },
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  chaos,
  idempotencyStore = createMemoryStore<Record<string, IdempotencyRecord>>(() => ({})),
  seed = Date.now(),
}: MockAdapterOptions<S>) {
  const rng = createRng(seed);
  let forced: ForcedOutcome | null = null;
  let state: S | undefined;
  // One request at a time: writes read-modify-write the whole state.
  let queue: Promise<unknown> = Promise.resolve();

  async function handle(req: ApiRequest, outcome: ForcedOutcome | null): Promise<ApiResponse> {
    if (latency) await sleep(rng.int(latency.min, latency.max));

    if (outcome === "offline") throw new ApiError(0, "INTERNAL", "Couldn't reach Femxo. Check your connection and try again.");
    if (outcome === "server-error") return respond(500, errorBody("INTERNAL", "Something went wrong on our side."));

    const write = isWrite(req.method);
    const chaosNow = chaos?.();
    if (!write && chaosNow?.enabled && rng.next() < chaosNow.failureRate) {
      return respond(500, errorBody("INTERNAL", "Something went wrong on our side (simulated)."));
    }

    let records: Record<string, IdempotencyRecord> | undefined;
    const fingerprint = `${req.method} ${req.path} ${JSON.stringify(req.body ?? null)}`;
    if (write) {
      if (!req.idempotencyKey) return respond(400, errorBody("IDEMPOTENCY_KEY_REQUIRED", "Writes need an Idempotency-Key header."));
      records = await idempotencyStore.load();
      const previous = records[req.idempotencyKey];
      if (previous && clock.now() - previous.at <= IDEMPOTENCY_TTL_MS) {
        if (previous.fingerprint !== fingerprint) {
          return respond(422, errorBody("IDEMPOTENCY_MISMATCH", "This Idempotency-Key was already used for a different request."));
        }
        return structuredClone(previous.response);
      }
    }

    const route = router.match(req.method, req.path);
    if (!route) return respond(404, errorBody("NOT_FOUND", `No route for ${req.method} ${req.path}.`));

    state ??= await store.load();
    const working = write ? structuredClone(state) : state;
    let response: ApiResponse;
    try {
      const result = await route.handler({
        params: route.params,
        query: toQuery(req.query),
        body: req.body === undefined ? undefined : structuredClone(req.body),
        state: working,
        clock,
        rng,
        accessToken: req.accessToken,
        idempotencyKey: req.idempotencyKey,
      });
      if (write) {
        state = working;
        await store.save(state);
      }
      response = respond(result.status, result.body === undefined ? null : structuredClone(result.body), result.headers);
    } catch (error) {
      response = errorResponse(error);
    }

    // Replays return the first answer; 5xx aren't kept so a retry can succeed.
    if (write && records && req.idempotencyKey && response.status < 500) {
      records[req.idempotencyKey] = { fingerprint, response: structuredClone(response), at: clock.now() };
      for (const [key, record] of Object.entries(records)) if (clock.now() - record.at > IDEMPOTENCY_TTL_MS) delete records[key];
      await idempotencyStore.save(records);
    }
    return response;
  }

  return {
    send(req: ApiRequest): Promise<ApiResponse> {
      // "The next request" is the next one sent: taken here, not when its turn comes, so one sent earlier (and still waiting or in flight) can't use it up.
      const outcome = forced;
      forced = null;
      const run = queue.then(() => handle(req, outcome));
      queue = run.catch(() => undefined);
      return run;
    },
    controls: {
      /** The next request fails this way, once (demo controls, tests). */
      forceNext(outcome: ForcedOutcome) {
        forced = outcome;
      },
      clock,
      /** Forget in-memory state so the next request reloads it (after a reset). */
      reload() {
        state = undefined;
      },
    },
  } satisfies ApiAdapter & { controls: unknown };
}

export type MockAdapter<S> = ReturnType<typeof createMockAdapter<S>>;
