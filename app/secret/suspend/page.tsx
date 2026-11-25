"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card, input } from "../_Shell";

// ⛔ Secret → Suspend ID (2026-11-25): a MIG ID → suspend it (it can't log in, every
// phone / browser is signed out at once) or bring it back. Uses ipAdmin "user" / "suspend".
const ipAdmin = httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, "ipAdmin");

export default function SuspendPage() {
  const f = useFounderPerms();
  const allowed = f.isMigwith || f.can("ip_monitor");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [info, setInfo] = useState<{ username: string; suspended: boolean; reason: string } | null>(null);
  const [reason, setReason] = useState("");
  const [ask, setAsk] = useState(false);
  const who = q.trim().replace(/^@/, "");

  const check = async () => {
    if (!who) return;
    setBusy(true);
    setMsg("");
    setInfo(null);
    try {
      const { data } = await ipAdmin({ action: "user", username: who });
      setInfo({ username: String(data.username || who), suspended: data.suspended === true, reason: String(data.suspendReason || "") });
    } catch (e) {
      setMsg((e as { message?: string })?.message || "Could not check.");
    } finally {
      setBusy(false);
    }
  };
  const set = async (suspended: boolean) => {
    if (!info) return;
    setBusy(true);
    setMsg("");
    try {
      const why = reason.trim() || "Suspended by miGlife";
      await ipAdmin({ action: "suspend", username: info.username, suspended, reason: why });
      setInfo({ ...info, suspended, reason: suspended ? why : "" });
      setMsg(suspended ? `⛔ @${info.username} is suspended and logged out everywhere.` : `✅ @${info.username} can log in again.`);
      setReason("");
    } catch (e) {
      setMsg((e as { message?: string })?.message || "Could not change.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FounderShell title="⛔ Suspend ID" allowed={allowed} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <p className="text-xs text-[#5B6B8C]">A suspended ID can&apos;t log in on the app or the web, and is logged out everywhere at once. Unsuspend brings it back with everything as it was.</p>
        <div className="flex gap-2">
          <input className={input} value={q} onChange={(e) => (setQ(e.target.value), setInfo(null), setMsg(""))} onKeyDown={(e) => e.key === "Enter" && void check()} placeholder="MIG ID" autoCapitalize="none" autoCorrect="off" />
          <button type="button" disabled={busy || !who} onClick={() => void check()} className="shrink-0 rounded-xl bg-[#2F80ED] px-4 font-bold text-white disabled:opacity-50">
            {busy && !info ? "…" : "Check"}
          </button>
        </div>
        {info && (
          <div className="space-y-2 rounded-xl bg-[#F6F8FB] p-3 text-sm">
            <p>
              <b>@{info.username}</b> · {info.suspended ? <b className="text-[#C62828]">⛔ Suspended</b> : <b className="text-[#2E7D32]">✅ Active</b>}
            </p>
            {info.suspended && info.reason && <p className="text-[#5B6B8C]">Reason: {info.reason}</p>}
            {info.suspended ? (
              <button type="button" disabled={busy} onClick={() => void set(false)} className="w-full rounded-xl bg-[#2E7D32] py-2.5 font-bold text-white disabled:opacity-50">
                {busy ? "…" : "✅ Unsuspend"}
              </button>
            ) : (
              <>
                <input className={input} value={reason} onChange={(e) => setReason(e.target.value.slice(0, 200))} placeholder="Reason (optional) — e.g. Cheating, abuse" />
                <button type="button" disabled={busy} onClick={() => setAsk(true)} className="w-full rounded-xl bg-[#C62828] py-2.5 font-bold text-white disabled:opacity-50">
                  ⛔ Suspend
                </button>
              </>
            )}
          </div>
        )}
        {msg && <p className="text-sm font-semibold text-[#0B2A5B]">{msg}</p>}
      </div>
      {ask && info && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3" onClick={() => setAsk(false)}>
          <div className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">Suspend @{info.username}?</p>
            <p className="text-sm">They are logged out now and can&apos;t log in until you unsuspend. Nothing is deleted.</p>
            <div className="flex justify-end gap-4">
              <button type="button" onClick={() => setAsk(false)} className="font-bold text-[#2F80ED]">Cancel</button>
              <button type="button" onClick={() => (setAsk(false), void set(true))} className="font-bold text-[#C62828]">Suspend</button>
            </div>
          </div>
        </div>
      )}
    </FounderShell>
  );
}
