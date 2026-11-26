"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card } from "../_Shell";

// 🎲 House Bots (miGlife only): Rafi• Nila• Sakib• Riya• Tanvir• keep LowCard &
// Cricket playing. On / off, which games, entry and how many bots
// (setHouseBots). Same as the app (HouseBotsTool).

type Cfg = { enabled: boolean; lowcard: boolean; cricket: boolean; entry: number; bots: number };
const setHouseBots = httpsCallable<Partial<Cfg>, Cfg & { ok: boolean }>(functions, "setHouseBots");

function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-[#22C55E]" : "bg-[#CBD5E1]"}`}
    >
      <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[23px]" : "left-[3px]"}`} />
    </button>
  );
}

export default function HouseBotsPage() {
  const f = useFounderPerms();
  const canTool = f.can("house_bots");
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const save = async (data: Partial<Cfg>) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await setHouseBots(data);
      setCfg(r.data);
      if (Object.keys(data).length) setMsg({ text: "✅ Saved", error: false });
    } catch (e) {
      const text = e instanceof Error ? e.message : "";
      setMsg({ text: text && !text.startsWith("internal") ? text : "Could not save. Please try again.", error: true });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (f.loaded && canTool) save({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.loaded, canTool]);

  const chip = (label: string, sel: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`rounded-[10px] px-3 py-1.5 text-[13px] font-extrabold disabled:opacity-60 ${sel ? "bg-[#2563EB] text-white" : "bg-[#F1F5FB] text-[#334155]"}`}
    >
      {label}
    </button>
  );

  return (
    <FounderShell title="🎲 House Bots" allowed={canTool} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <p className="text-xs text-[#5B6B8C]">
          Rafi• Nila• Sakib• Riya• Tanvir• keep LowCard and Cricket playing all the time. The house pays their entries; they never get XP,
          commission or leaderboard places. Anyone can join their games.
        </p>
        {!cfg ? (
          <p className="text-sm text-[#5B6B8C]">Loading…</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-[#EEF3FB] px-4 py-3">
              <span>
                <b className="block text-sm text-[#1E3A6E]">Bots on</b>
                <span className="text-[11.5px] text-[#5B6B8C]">Keep the games playing all the time</span>
              </span>
              <Switch on={cfg.enabled} disabled={busy} onChange={(v) => save({ enabled: v })} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-[#F6F9FD] px-4 py-3">
              <b className="text-sm text-[#1E3A6E]">🃏 LowCard</b>
              <Switch on={cfg.lowcard} disabled={busy} onChange={(v) => save({ lowcard: v })} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-[#F6F9FD] px-4 py-3">
              <b className="text-sm text-[#1E3A6E]">🏏 Cricket</b>
              <Switch on={cfg.cricket} disabled={busy} onChange={(v) => save({ cricket: v })} />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-extrabold tracking-wide text-[#5B6B8C]">ENTRY PER GAME</p>
              <div className="flex flex-wrap gap-1.5">
                {[100, 200, 500, 1000, 2000, 5000].map((v) => chip(v.toLocaleString("en-US"), cfg.entry === v, () => save({ entry: v })))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-extrabold tracking-wide text-[#5B6B8C]">HOW MANY BOTS</p>
              <div className="flex gap-1.5">{[2, 3, 4, 5].map((v) => chip(String(v), cfg.bots === v, () => save({ bots: v })))}</div>
            </div>
          </>
        )}
        {msg && <p className={`text-sm ${msg.error ? "text-[#B91C1C]" : "text-[#2E7D32]"}`}>{msg.text}</p>}
      </div>
    </FounderShell>
  );
}
