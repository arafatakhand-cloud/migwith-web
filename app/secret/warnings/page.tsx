"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card, input } from "../_Shell";

// ⚠️ Warnings (miGlife only). A warning is sent as a Support mail, with the rule it
// broke. Each member's warnings are counted. miGlife decides any suspension.

type Reason = { key: string; label: string };
type Row = { id: string; username: string; reasonLabel: string; note: string; count: number; atMs: number };

const issueWarning = httpsCallable<{ username: string; reason: string; note?: string }, { ok: boolean; username: string; count: number; suspendAt: number }>(
  functions,
  "issueWarning"
);
const listWarnings = httpsCallable<{ username?: string }, { warnings: Row[]; reasons: Reason[]; suspendAt: number }>(functions, "listWarnings");

export default function WarningsPage() {
  const f = useFounderPerms();
  const allowed = f.isMigwith;
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("harassment");
  const [note, setNote] = useState("");
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [suspendAt, setSuspendAt] = useState(3);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const load = (name = "") =>
    listWarnings({ username: name || undefined })
      .then((r) => {
        setRows(r.data.warnings);
        setReasons(r.data.reasons);
        setSuspendAt(r.data.suspendAt);
      })
      .catch(() => setMsg({ text: "Could not load warnings.", error: true }));

  useEffect(() => {
    if (allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const give = async () => {
    if (busy || !username.trim()) return;
    const label = reasons.find((r) => r.key === reason)?.label || reason;
    if (!window.confirm(`Give a warning to ${username.trim()} for "${label}"? The mail is sent right away.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await issueWarning({ username: username.trim(), reason, note: note.trim() || undefined });
      setMsg({ text: `⚠️ Warning ${r.data.count} given to ${r.data.username}.${r.data.count >= suspendAt ? " Consider suspension." : ""}`, error: false });
      setNote("");
      load(filter);
    } catch (e) {
      const t = e instanceof Error ? e.message : "";
      setMsg({ text: t && !t.startsWith("internal") ? t : "Could not give the warning.", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FounderShell title="⚠️ Warnings" allowed={allowed} loaded={f.loaded}>
      <div className={`${card} space-y-4`}>
        <p className="text-xs text-[#5B6B8C]">
          The member gets a Support mail with the rule they broke. Warnings are counted. At <b>{suspendAt}</b> warnings, miGlife decides whether to suspend.
        </p>

        <label className="block">
          <span className="text-sm font-bold">MIG ID</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. life" className={`${input} mt-1`} />
        </label>

        <label className="block">
          <span className="text-sm font-bold">Reason (rule broken)</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={`${input} mt-1`}>
            {reasons.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-bold">Note for the member (optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} className={`${input} mt-1 resize-y`} />
        </label>

        <button
          type="button"
          disabled={busy || !username.trim()}
          onClick={give}
          className="w-full rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#DC2626] py-3 font-extrabold text-white disabled:opacity-40"
        >
          {busy ? "Sending…" : "⚠️ Give warning"}
        </button>

        {msg && <p className={`text-sm font-bold ${msg.error ? "text-[#B91C1C]" : "text-[#B45309]"}`}>{msg.text}</p>}

        <div className="border-t border-[#E5EAF5] pt-3">
          <div className="mb-2 flex gap-2">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by MIG ID" className={input} />
            <button type="button" onClick={() => load(filter.trim())} className="shrink-0 rounded-xl bg-[#EEF3FB] px-4 font-bold text-[#1E3A6E]">
              Show
            </button>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-[#5B6B8C]">No warnings yet.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((w) => (
                <li key={w.id} className="rounded-xl border border-[#E5EAF5] p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <b>{w.username}</b>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${w.count >= suspendAt ? "bg-[#FDE2E2] text-[#B91C1C]" : "bg-[#FFF3D6] text-[#B45309]"}`}>
                      Warning {w.count}
                    </span>
                  </div>
                  <div className="mt-1 text-[#1E3A6E]">{w.reasonLabel}</div>
                  {w.note && <div className="mt-1 text-xs text-[#5B6B8C]">Note: {w.note}</div>}
                  <div className="mt-1 text-[11px] text-[#8A96AD]">{w.atMs ? new Date(w.atMs).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }) : ""}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </FounderShell>
  );
}
