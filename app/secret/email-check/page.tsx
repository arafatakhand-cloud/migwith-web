"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card, input } from "../_Shell";

// 📧 Secret → Email Check (miglife only): a MIG ID → which email the account uses;
// an email → the MIG IDs that use it. (secretEmailLookup on the server)
type Row = { username: string; emails: { kind: string; email: string }[]; loginIsHiddenId: boolean; disabled: boolean; createdMs: number; lastSignInMs: number };
const call = httpsCallable<{ q: string }, { ok: boolean; mode: "id" | "email"; results: Row[] }>(functions, "secretEmailLookup");
const when = (ms: number) => (ms ? new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default function EmailCheckPage() {
  const f = useFounderPerms();
  const allowed = f.isMigwith;
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<{ mode: "id" | "email"; results: Row[] } | null>(null);

  const look = async () => {
    const v = q.trim();
    if (v.length < 2) return;
    setBusy(true);
    setErr("");
    setRes(null);
    try {
      const r = await call({ q: v });
      setRes({ mode: r.data.mode, results: r.data.results || [] });
    } catch (e) {
      setErr((e as { message?: string })?.message || "Could not check.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FounderShell title="📧 Email Check" allowed={allowed} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <p className="text-xs text-[#5B6B8C]">Type a MIG ID to see which email it uses — or type an email to see which IDs use it.</p>
        <div className="flex gap-2">
          <input
            className={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void look()}
            placeholder="MIG ID or email"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button type="button" disabled={busy || q.trim().length < 2} onClick={() => void look()} className="shrink-0 rounded-xl bg-[#2F80ED] px-4 font-bold text-white disabled:opacity-50">
            {busy ? "…" : "Check"}
          </button>
        </div>
        {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      </div>
      {res && (
        <div className="mt-3 space-y-3">
          {res.results.length === 0 && <div className={`${card} text-sm text-[#5B6B8C]`}>{res.mode === "id" ? "No account with that MIG ID." : "No ID uses that email."}</div>}
          {res.results.map((r) => (
            <div key={r.username} className={`${card} space-y-2`}>
              <div className="flex items-center gap-2">
                <b className="text-[16px] text-[#16264A]">{r.username}</b>
                {r.disabled && <span className="rounded-md bg-red-100 px-1.5 text-[11px] font-bold text-red-700">disabled</span>}
              </div>
              {r.emails.length === 0 ? (
                <p className="text-sm text-[#5B6B8C]">No email on this ID{r.loginIsHiddenId ? " — it logs in with the MIG ID and password only." : "."}</p>
              ) : (
                r.emails.map((e) => (
                  <div key={e.kind + e.email} className="flex items-center gap-2 rounded-xl bg-[#F4F7FC] px-3 py-2">
                    <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[11px] font-bold text-[#5B6B8C]">{e.kind}</span>
                    <span className="min-w-0 flex-1 break-all text-[14px] font-semibold text-[#16264A]">{e.email}</span>
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(e.email)} className="shrink-0 text-[12px] font-bold text-[#2F80ED]">
                      Copy
                    </button>
                  </div>
                ))
              )}
              <p className="text-[12px] text-[#7C88A6]">
                Opened: {when(r.createdMs)} · Last login: {when(r.lastSignInMs)}
              </p>
            </div>
          ))}
        </div>
      )}
    </FounderShell>
  );
}
