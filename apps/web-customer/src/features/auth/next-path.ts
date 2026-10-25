/**
 * Where to go after signing in: only a path on this site, or the store home
 * when none was asked for. Anything that could leave the site (`//host`,
 * `/\host`, a scheme, or control characters that browsers strip before
 * parsing, like the tab in `/<tab>/host`) falls back to the home page.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/") {
  const onSite = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && !/[\u0000-\u001f\u007f]/.test(next);
  return onSite ? next : fallback;
}
