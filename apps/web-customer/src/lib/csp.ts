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

/*
 * Razorpay Checkout (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/): the script comes from
 * checkout.razorpay.com (loaded only when a customer pays, see src/lib/razorpay.ts), the payment window is an iframe from
 * api.razorpay.com / checkout.razorpay.com, and it reports to lumberjack.razorpay.com. Card issuers' 3-D Secure pages open in
 * that window or a popup, not in our frames. Nothing here is a wildcard.
 */
const RAZORPAY_SCRIPT = "https://checkout.razorpay.com";
const RAZORPAY_FRAMES = "https://api.razorpay.com https://checkout.razorpay.com";
const RAZORPAY_CONNECT = "https://api.razorpay.com https://checkout.razorpay.com https://lumberjack.razorpay.com https://lumberjack-cx.razorpay.com";
const RAZORPAY_IMAGES = "https://cdn.razorpay.com https://checkout.razorpay.com";

export function buildCsp(nonce: string): string {
  // Product pictures come from the backend storage (FEMXO_IMAGE_ORIGIN). connect-src is this site (the browser
  // reaches the API through the same-origin /store/v1 rewrite) plus that image origin.
  const imageOrigin = origin(process.env.FEMXO_IMAGE_ORIGIN);
  return [
    "default-src 'self'",
    `script-src 'self' ${CSP_STRICT_SCRIPTS ? `'nonce-${nonce}' 'strict-dynamic'` : "'unsafe-inline'"} ${RAZORPAY_SCRIPT}${isDev ? " 'unsafe-eval'" : ""}`,
    // Style attributes (React style={}, Tailwind arbitrary values at runtime, framer-motion) can't take a nonce.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${RAZORPAY_IMAGES}${imageOrigin ? ` ${imageOrigin}` : ""}`,
    "font-src 'self'",
    `connect-src 'self' ${RAZORPAY_CONNECT}${imageOrigin ? ` ${imageOrigin}` : ""}${isDev ? " ws: wss:" : ""}`,
    `frame-src ${RAZORPAY_FRAMES}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://api.razorpay.com",
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
