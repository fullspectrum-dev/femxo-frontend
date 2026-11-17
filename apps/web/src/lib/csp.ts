/*
 * The Content-Security-Policy, built per request so every inline script can carry a nonce.
 * proxy.ts calls this and sets the header; the root layout reads the nonce back (x-nonce) for its own inline scripts.
 * CSP_REPORT_ONLY=true sends the policy as Content-Security-Policy-Report-Only instead (escape hatch while debugging
 * a violation in production). frame-ancestors is ignored in Report-Only, so it is then also sent on its own, enforced.
 */
const isDev = process.env.NODE_ENV === "development";

export const CSP_REPORT_ONLY = process.env.CSP_REPORT_ONLY === "true";

/*
 * Scripts. This app prerenders a static shell (Cache Components / PPR) and the browser gets that HTML, with
 * Next's inline bootstrap scripts, straight from the build: no request existed to mint a nonce for. Next's docs
 * say the same: nonces and PPR are incompatible. So by default script-src is 'self' 'unsafe-inline' (enforced;
 * everything else in the policy is strict), and the nonce is still minted and put on our own inline scripts.
 * CSP_STRICT_SCRIPTS=true switches to 'nonce-...' + 'strict-dynamic', which only works when every page is
 * rendered per request (i.e. with Cache Components off); with it on today, static-shell pages will not hydrate.
 */
export const CSP_STRICT_SCRIPTS = process.env.CSP_STRICT_SCRIPTS === "true";

function origin(value: string | undefined): string | null {
  try {
    return value?.trim() ? new URL(value).origin : null;
  } catch {
    return null;
  }
}

export function buildCsp(nonce: string): string {
  // Images are the admin's own uploads; connect-src is this site (API calls go through the same-origin rewrite)
  // plus the API origin when NEXT_PUBLIC_API_BASE_URL makes the browser call it directly.
  const apiDirect = origin(process.env.NEXT_PUBLIC_API_BASE_URL);
  const imageOrigin = origin(process.env.FEMXO_IMAGE_ORIGIN);
  return [
    "default-src 'self'",
    `script-src 'self' ${CSP_STRICT_SCRIPTS ? `'nonce-${nonce}' 'strict-dynamic'` : "'unsafe-inline'"}${isDev ? " 'unsafe-eval'" : ""}`,
    // Style attributes (React style={}, Tailwind arbitrary values at runtime, framer-motion) can't take a nonce.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:${imageOrigin ? ` ${imageOrigin}` : ""}`,
    "font-src 'self'",
    `connect-src 'self'${apiDirect ? ` ${apiDirect}` : ""}${imageOrigin ? ` ${imageOrigin}` : ""}${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self'",
  ].join("; ");
}

/** The response headers a request needs: the CSP, enforced or Report-Only. */
export function cspHeaders(nonce: string): Record<string, string> {
  const csp = buildCsp(nonce);
  return CSP_REPORT_ONLY
    ? { "Content-Security-Policy-Report-Only": csp, "Content-Security-Policy": "frame-ancestors 'none'" }
    : { "Content-Security-Policy": csp };
}
