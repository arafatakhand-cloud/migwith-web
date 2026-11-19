"use client";

import { useEffect, useState } from "react";
import { useFounderPerms } from "../../../lib/founder";
import { loadMissionConfig, saveMissionConfig, type MissionConfig } from "../../../lib/missions";
import { FounderShell, card } from "../_Shell";

// 🎯 Daily Missions (miGlife only): each mission's name, emoji, target, Season
// Points and on/off, and the "all done" bonus. Same as the app's tool.
export default function MissionsAdminPage() {
  const f = useFounderPerms();
  const [c, setC] = useState<MissionConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => {
    if (f.isMigwith) loadMissionConfig().then(setC).catch((e) => setMsg({ text: e?.message || "Could not load.", error: true }));
  }, [f.isMigwith]);
  const set = (i: number, p: Partial<MissionConfig["missions"][number]>) => setC((o) => (o ? { ...o, missions: o.missions.map((m, j) => (j === i ? { ...m, ...p } : m)) } : o));
  const save = async () => {
    if (!c) return;
    setBusy(true);
    setMsg(null);
    try {
      setC(await saveMissionConfig(c));
      setMsg({ text: "✅ Saved — the new missions start now.", error: false });
    } catch (e: any) {
      setMsg({ text: e?.message || "Could not save.", error: true });
    }
    setBusy(false);
  };
  const input = "w-full rounded-lg border border-[#D4DDEB] bg-white px-2 py-1.5 text-[13px] text-[#16264A] outline-none";
  return (
    <FounderShell title="🎯 Daily Missions" allowed={f.isMigwith} loaded={f.loaded}>
      {!c ? (
        <p className="p-3 text-sm text-[#5B6B8C]">{msg?.text || "Loading…"}</p>
      ) : (
        <div className="space-y-3">
          {c.missions.map((m, i) => (
            <div key={m.key} className={`${card} space-y-2`}>
              <div className="flex items-center gap-2">
                <input value={m.emoji} onChange={(e) => set(i, { emoji: e.target.value })} className={`${input} w-14 text-center text-lg`} />
                <input value={m.title} onChange={(e) => set(i, { title: e.target.value })} className={input} />
                <label className="flex shrink-0 items-center gap-1 text-[12px] font-bold text-[#45557A]">
                  <input type="checkbox" checked={m.on} onChange={(e) => set(i, { on: e.target.checked })} /> On
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11.5px] font-bold text-[#5B6B8C]">
                <label>
                  Target ({m.unit})
                  <input inputMode="numeric" value={m.target} onChange={(e) => set(i, { target: Number(e.target.value.replace(/\D/g, "")) || 0 })} className={input} />
                </label>
                <label>
                  Season Points
                  <input inputMode="numeric" value={m.sp} onChange={(e) => set(i, { sp: Number(e.target.value.replace(/\D/g, "")) || 0 })} className={input} />
                </label>
              </div>
            </div>
          ))}
          <div className={card}>
            <label className="text-[12px] font-bold text-[#5B6B8C]">
              🎉 All done — bonus SP
              <input inputMode="numeric" value={c.bonusSp} onChange={(e) => setC({ ...c, bonusSp: Number(e.target.value.replace(/\D/g, "")) || 0 })} className={input} />
            </label>
          </div>
          <button type="button" disabled={busy} onClick={save} className="w-full rounded-xl bg-[#0B1F3A] py-3 text-[14px] font-bold text-white disabled:opacity-60">
            {busy ? "Saving…" : "Save"}
          </button>
          {msg && <p className={`text-[13px] font-bold ${msg.error ? "text-[#DC2626]" : "text-[#0E9F6E]"}`}>{msg.text}</p>}
        </div>
      )}
    </FounderShell>
  );
}
