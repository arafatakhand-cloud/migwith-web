"use client";

import { useEffect } from "react";

// A new version was deployed while this tab was open: the old page's files are gone.
function isStaleBuild(error: Error) {
  const t = `${error?.name ?? ""} ${error?.message ?? ""}`;
  return /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Failed to fetch|Importing a module script failed/i.test(t);
}

const RELOAD_KEY = "migwith.errorReloadAt";

export function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    // Reload once by itself (not in a loop) — that fixes a stale tab after an update.
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    } catch {}
    if (Date.now() - last > 30_000 && isStaleBuild(error)) {
      try {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {}
      window.location.reload();
    }
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#D6ECFB", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 420, width: "100%", background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 4px 16px rgba(0,0,0,.12)", color: "#0B2A5B", textAlign: "center" }}>
        <div style={{ fontSize: 36 }}>😕</div>
        <div style={{ fontWeight: 700, fontSize: 18, marginTop: 6 }}>Something went wrong</div>
        <div style={{ fontSize: 13, marginTop: 6, color: "#55657F" }}>Please reload the page. If it keeps happening, send a screenshot of this screen.</div>
        <div style={{ marginTop: 12, fontSize: 12, textAlign: "left", background: "#F2F6FB", borderRadius: 8, padding: 10, wordBreak: "break-word", fontFamily: "ui-monospace, monospace", color: "#B42318" }}>
          {String(error?.message || error?.name || "Unknown error").slice(0, 400)}
          {error?.digest ? ` (${error.digest})` : ""}
          {typeof window !== "undefined" ? ` @ ${window.location.pathname}` : ""}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={() => window.location.reload()} style={{ flex: 1, padding: "10px 0", borderRadius: 10, background: "#1E4FA8", color: "#fff", fontWeight: 700, border: 0 }}>
            Reload
          </button>
          <button type="button" onClick={() => window.location.assign("/")} style={{ flex: 1, padding: "10px 0", borderRadius: 10, background: "#E7EEF8", color: "#1E4FA8", fontWeight: 700, border: 0 }}>
            Home
          </button>
        </div>
        <button type="button" onClick={reset} style={{ marginTop: 8, fontSize: 12, color: "#55657F", background: "none", border: 0, textDecoration: "underline" }}>
          Try again without reloading
        </button>
      </div>
    </div>
  );
}
