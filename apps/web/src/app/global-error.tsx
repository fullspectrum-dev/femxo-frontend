"use client";

/* Last resort: replaces the root layout when it fails, so it brings its own <html> and plain styles. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", minHeight: "100vh", placeItems: "center", margin: 0, padding: 24, textAlign: "center" }}>
        <div role="alert" style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
          <p>Femxo hit an unexpected problem. Nothing was changed. Please try again.</p>
          <button type="button" onClick={reset} style={{ padding: "10px 18px", fontSize: 16, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
