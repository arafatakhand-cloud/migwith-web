"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card } from "../_Shell";

// 🧪 Review Account (miGlife only): the test ID given to Google Play. In review
// mode the Android app keeps everything it does on its own screen (invisible in
// rooms, messages / gifts / Feed posts not sent). Same as the app (ReviewAccountTool).

type Acc = { username: string; balance: number };
type LogLine = { username: string; kind: string; where: string; text: string; at: number; device: string };
type Res = { ok: boolean; accounts: Acc[]; log: LogLine[] };
const KIND_ICON = (k: string) =>
  k === "open" ? "📲" : k.startsWith("room") ? "💬" : k === "private" ? "✉️" : k === "mail" ? "📧" : k === "gift" ? "🎁" : k === "feed" ? "📰" : "•";
const reviewAccountAdmin = httpsCallable<{ action: string; username?: string; on?: boolean }, Res>(functions, "reviewAccountAdmin");

export default function ReviewAccountPage() {
  const f = useFounderPerms();
  const [q, setQ] = useState("");
  const [list, setList] = useState<Acc[] | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const call = async (data: { action: string; username?: string; on?: boolean }, ok = "") => {
    setBusy(true);
    setMsg(null);
    try {
      const r = (await reviewAccountAdmin(data)).data;
      setList(r.accounts || []);
      setLog(r.log || []);
      if (ok) {
        setMsg({ text: ok, error: false });
        setQ("");
      }
    } catch (e) {
      const t = e instanceof Error ? e.message : "";
      setMsg({ text: t && !t.startsWith("internal") ? t : "Could not save. Please try again.", error: true });
      setList((l) => l ?? []);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (f.loaded && f.isMigwith) call({ action: "list" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.loaded, f.isMigwith]);

  return (
    <FounderShell title="🧪 Review Account" allowed={f.isMigwith} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <p className="text-xs text-[#5B6B8C]">
          The test ID you gave Google Play. Google can use the app normally, but nothing reaches real people: invisible in rooms (no &quot;has
          entered&quot;), room / private messages, gifts and Feed posts stay on its own screen. Google&apos;s robot test phones are handled the same way
          automatically.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = q.trim();
            if (name) call({ action: "set", username: name, on: true }, `✅ Review mode is ON for @${name}`);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value.slice(0, 40))}
            placeholder="Test MIG ID"
            className="min-w-0 flex-1 rounded-xl border border-[#D5DEEA] px-3 py-2.5 text-sm text-[#1E3A6E] outline-none focus:border-[#0F766E]"
          />
          <button type="submit" disabled={busy || !q.trim()} className="rounded-xl bg-[#0F766E] px-4 text-sm font-black text-white disabled:opacity-50">
            {busy ? "…" : "TURN ON"}
          </button>
        </form>
        <p className="text-[11.5px] text-[#5B6B8C]">Tip: keep 0 coins on this ID, so Google can&apos;t spend any in games.</p>
        {msg && <p className={`text-sm ${msg.error ? "text-[#B91C1C]" : "text-[#2E7D32]"}`}>{msg.text}</p>}
      </div>
      <p className="mb-2 mt-4 text-[11px] font-extrabold tracking-wide text-[#5B6B8C]">REVIEW ACCOUNTS · {list?.length ?? 0}</p>
      {list === null ? (
        <p className="text-sm text-[#5B6B8C]">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-[12.5px] text-[#5B6B8C]">None yet.</p>
      ) : (
        <div className="space-y-2">
          {list.map((a) => (
            <div key={a.username} className={`${card} flex items-center gap-2`}>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold text-[#1E3A6E]">🧪 @{a.username}</span>
                <span className={`block text-[11.5px] ${a.balance > 0 ? "text-[#B45309]" : "text-[#15803D]"}`}>
                  {a.balance > 0 ? `⚠️ ${a.balance.toLocaleString("en-US")} coins — set to 0 in Coin Control` : "0 coins ✓"}
                </span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => call({ action: "set", username: a.username, on: false }, `Review mode is OFF for @${a.username}`)}
                className="rounded-[10px] bg-[#FDECEC] px-2.5 py-1.5 text-[12.5px] font-bold text-[#B91C1C]"
              >
                Turn off
              </button>
            </div>
          ))}
        </div>
      )}
      {/* 👀 what the review account did — only miGlife sees this */}
      <div className="mb-1 mt-5 flex items-center gap-2">
        <p className="flex-1 text-[11px] font-extrabold tracking-wide text-[#5B6B8C]">👀 ACTIVITY · {log.length}</p>
        <button type="button" disabled={busy} onClick={() => call({ action: "list" })} className="text-[12px] font-bold text-[#1E3A6E]">
          ↻ Refresh
        </button>
        {log.length > 0 && (
          <button type="button" disabled={busy} onClick={() => call({ action: "clearLog" }, "Activity cleared")} className="text-[12px] font-bold text-[#B91C1C]">
            🗑 Clear
          </button>
        )}
      </div>
      <p className="mb-2 text-[11.5px] text-[#5B6B8C]">Everything the review account sent or tried. Nobody else saw any of it.</p>
      {log.length === 0 ? (
        <p className="text-[12.5px] text-[#5B6B8C]">Nothing yet.</p>
      ) : (
        <div className="space-y-2">
          {log.map((e, i) => (
            <div key={i} className={`${card} flex gap-2`}>
              <span className="text-lg">{KIND_ICON(e.kind)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] font-bold text-[#0F766E]">
                  @{e.username} · {e.where}
                </span>
                <span className="block whitespace-pre-wrap break-words text-[13.5px] text-[#1E3A6E]">{e.text}</span>
                <span className="block text-[10.5px] text-[#5B6B8C]">
                  {[e.at ? new Date(e.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "", e.device].filter(Boolean).join(" · ")}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </FounderShell>
  );
}
