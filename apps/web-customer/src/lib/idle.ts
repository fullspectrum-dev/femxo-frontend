/**
 * Runs `work` when the browser has nothing better to do (or after `timeout`
 * ms at the latest), so background set-up doesn't compete with painting the
 * page. Returns a function that cancels it. Where there's no idle callback,
 * a short timer does the same job.
 */
export function whenIdle(work: () => void, timeout = 1500) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const id = window.requestIdleCallback(work, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(work, 1);
  return () => clearTimeout(id);
}
