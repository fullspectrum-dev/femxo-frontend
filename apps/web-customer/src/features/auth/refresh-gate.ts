/**
 * Runs `refresh` at most once at a time. The backend rotates refresh tokens
 * and ends the whole session if an old one is used again (ADR 0005), so two
 * refreshes racing would sign the customer out. Within a tab, callers share
 * the request in flight; across tabs (which share one cookie) a Web Lock
 * queues them where the browser has one.
 */
export function createRefreshGate<T>(refresh: () => Promise<T>) {
  let inFlight: Promise<T> | null = null;

  const exclusive = async (): Promise<T> =>
    typeof navigator !== "undefined" && navigator.locks ? await navigator.locks.request("femxo-customer-refresh", refresh) : refresh();

  return () => {
    inFlight ??= exclusive().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
