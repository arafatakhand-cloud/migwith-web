"use client";

import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card } from "../_Shell";

// 🔄 Secret → Bot Restart (2026-11-25): every game bot with its state. Restart →
// the running round's entries are refunded, the game goes back to idle and the
// bot says it is ready. Same as the app (BotRestartTool). Server: secretBotRestart.
const botRestart = httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, "secretBotRestart");

type Bot = { docId: string; game: string; room: string; round: number; status: "stuck" | "playing" | "idle"; players: number; pot: number };

const BADGE: Record<Bot["status"], [string, string, string]> = {
  stuck: ["🔴 Stuck", "#FEE2E2", "#B91C1C"],
  playing: ["🟢 Playing", "#DCFCE7", "#15803D"],
  idle: ["⚪ Idle", "#F1F5F9", "#475569"],
};

export default function BotRestartPage() {
  const f = useFounderPerms();
  const allowed = f.isMigwith || f.can("coin_control");
  const [bots, setBots] = useState<Bot[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [ask, setAsk] = useState<Bot | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setBots(null);
    try {
      const { data } = await botRestart({ action: "list" });
      setBots((data.bots as Bot[]) || []);
    } catch (e) {
      setBots([]);
      setMsg((e as { message?: string })?.message || "Could not load.");
    }
  }, []);
  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const restart = async (b: Bot) => {
    setAsk(null);
    setBusy(b.docId);
    setMsg("");
    try {
      const { data } = await botRestart({ action: "restart", docId: b.docId });
      const n = Number(data.refunded || 0);
      setMsg(`🔄 ${b.game} Bot in ${b.room} restarted.${n > 0 ? ` ${n} refunded (${Number(data.coins || 0).toLocaleString()} coins).` : ""}`);
      setBots((l) => (l || []).map((x) => (x.docId === b.docId ? { ...x, status: "idle", players: 0, pot: 0 } : x)));
    } catch (e) {
      setMsg((e as { message?: string })?.message || "Could not restart.");
    } finally {
      setBusy("");
    }
  };

  const q = filter.trim().toLowerCase();
  const shown = (bots || []).filter((b) => !q || `${b.game} ${b.room}`.toLowerCase().includes(q));

  return (
    <FounderShell title="🔄 Bot Restart" allowed={allowed} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <div className="flex items-center gap-2">
          <p className="flex-1 text-xs text-[#5B6B8C]">Restart a bot that is stuck. Everyone in its running game gets their coins back, then the bot is ready for a new game.</p>
          <button type="button" onClick={() => void load()} className="shrink-0 rounded-full bg-[#F2F4F7] px-3 py-1 text-[12px] font-bold text-[#374151]">
            ⟳ Refresh
          </button>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value.slice(0, 40))}
          placeholder="🔍 Search game or room…"
          className="h-10 w-full rounded-full bg-[#F2F4F7] px-4 text-[14px] outline-none placeholder:text-[#9AA1AB]"
        />
        {msg && <p className="text-sm font-semibold text-[#0B2A5B]">{msg}</p>}
        {bots === null && <p className="py-4 text-center text-sm text-[#9AA1AB]">Loading bots…</p>}
        {bots && shown.length === 0 && <p className="py-4 text-center text-sm text-[#9AA1AB]">No bots found.</p>}
        <div className="overflow-hidden rounded-[14px] border border-[#EEF0F3]">
          {shown.map((b, i) => {
            const [label, bg, fg] = BADGE[b.status];
            return (
              <div key={b.docId} className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? "border-t border-[#F1F3F5]" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-[#111]">
                    {b.game} <span className="font-normal text-[#6B7280]">· {b.room}</span>
                  </p>
                  <p className="text-[11.5px] text-[#6B7280]">
                    <span className="mr-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: bg, color: fg }}>
                      {label}
                    </span>
                    {b.status !== "idle" && `${b.players} player${b.players === 1 ? "" : "s"} · 💰 ${b.pot.toLocaleString()}`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => (b.status === "playing" ? setAsk(b) : void restart(b))}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50 ${b.status === "stuck" ? "bg-[#EF4444]" : "bg-[#3B82F6]"}`}
                >
                  {busy === b.docId ? "…" : "🔄 Restart"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {ask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3" onClick={() => setAsk(null)}>
          <div className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">Restart {ask.game} Bot?</p>
            <p className="text-sm">
              A game is playing right now in {ask.room}. Restart ends it and gives {ask.players} player{ask.players === 1 ? "" : "s"} their coins back.
            </p>
            <div className="flex justify-end gap-4">
              <button type="button" onClick={() => setAsk(null)} className="font-bold text-[#2F80ED]">Cancel</button>
              <button type="button" onClick={() => void restart(ask)} className="font-bold text-[#EF4444]">Restart</button>
            </div>
          </div>
        </div>
      )}
    </FounderShell>
  );
}
