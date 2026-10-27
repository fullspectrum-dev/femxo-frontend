"use client";

import { t } from "@/i18n";

/**
 * The last resort: the layout itself broke, so there is no shell to keep.
 * Plain markup with inline styles, since the stylesheet may be what failed.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#fffaf4", color: "#12071f", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 480, margin: "0 auto", padding: "96px 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 24 }}>{t("error.title")}</h1>
          <p style={{ color: "#5e566b" }}>{t("error.message")}</p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, height: 44, padding: "0 20px", border: 0, borderRadius: 12, background: "#6c35a5", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            {t("error.retry")}
          </button>
        </main>
      </body>
    </html>
  );
}
