"use client";

import { useEffect, useState } from "react";
import { useFounderPerms } from "../../../lib/founder";
import { ENTRY_FX_IDS, loadSeason, rewardIcon, saveSeason, startSeason, type Reward, type SeasonData, type SeasonLevel } from "../../../lib/season";
import { FounderShell, card } from "../_Shell";

// 🎟 Season Pass (miGlife only): start a new season (name, days), the Gold price,
// SP per level, and each level's FREE / GOLD reward. Same as the app's tool.
export default function SeasonAdminPage() {
  const f = useFounderPerms();
  const [d, setD] = useState<SeasonData | null>(null);
  const [name, setName] = useState("");
  const [days, setDays] = useState(30);
  const [gold, setGold] = useState(50000);
  const [per, setPer] = useState(250);
  const [levels, setLevels] = useState<SeasonLevel[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const load = () =>
    loadSeason()
      .then((x) => {
        setD(x);
        setName(x.season.name);
        setGold(x.season.goldPrice);
        setPer(x.season.spPerLevel);
        setLevels(x.season.levels);
      })
      .catch((e) => setMsg({ text: e?.message || "Could not load.", error: true }));
  useEffect(() => {
    if (f.isMigwith) load();
  }, [f.isMigwith]);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ text: ok, error: false });
      await load();
    } catch (e: any) {
      setMsg({ text: e?.message || "Could not save.", error: true });
    }
    setBusy(false);
  };
  const setR = (i: number, lane: "free" | "gold", r: Reward) => setLevels((o) => o.map((l, j) => (j === i ? { ...l, [lane]: r } : l)));
  const input = "w-full rounded-lg border border-[#D4DDEB] bg-white px-2 py-1.5 text-[13px] text-[#16264A] outline-none";
  const editor = (i: number, lane: "free" | "gold", r: Reward) => (
    <div className="space-y-1.5 rounded-xl bg-[#F6F9FD] p-2">
      <p className="text-[11px] font-black text-[#45557A]">{lane === "gold" ? "👑 GOLD" : "FREE"}</p>
      <select
        value={r.kind}
        onChange={(e) => setR(i, lane, e.target.value === "fx" ? { kind: "fx", fx: "sparkle", days: 3 } : e.target.value === "badge" ? { kind: "badge", emoji: "🏅", label: "Badge" } : { kind: "coins", amount: 500 })}
        className={input}
      >
        <option value="coins">🪙 Coins</option>
        <option value="fx">✨ Entry effect</option>
        <option value="badge">🏅 Badge</option>
      </select>
      {r.kind === "coins" && <input inputMode="numeric" value={r.amount} onChange={(e) => setR(i, lane, { kind: "coins", amount: Number(e.target.value.replace(/\D/g, "")) || 0 })} className={input} />}
      {r.kind === "fx" && (
        <div className="grid grid-cols-2 gap-1.5">
          <select value={r.fx} onChange={(e) => setR(i, lane, { ...r, fx: e.target.value })} className={input}>
            {ENTRY_FX_IDS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <input inputMode="numeric" value={r.days} onChange={(e) => setR(i, lane, { ...r, days: Number(e.target.value.replace(/\D/g, "")) || 1 })} className={input} placeholder="days" />
        </div>
      )}
      {r.kind === "badge" && (
        <div className="grid grid-cols-[56px_1fr] gap-1.5">
          <input value={r.emoji} onChange={(e) => setR(i, lane, { ...r, emoji: e.target.value })} className={`${input} text-center`} />
          <input value={r.label} onChange={(e) => setR(i, lane, { ...r, label: e.target.value })} className={input} />
        </div>
      )}
    </div>
  );
  const s = d?.season;
  return (
    <FounderShell title="🎟 Season Pass" allowed={f.isMigwith} loaded={f.loaded}>
      {!s ? (
        <p className="p-3 text-sm text-[#5B6B8C]">{msg?.text || "Loading…"}</p>
      ) : (
        <div className="space-y-3">
          <div className={`${card} text-[13px] text-[#45557A]`}>
            {s.id ? (
              <>
                <b className="text-[#0B1F3A]">{s.name}</b> · {s.active ? `running, ends ${new Date(s.endMs).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "ended"}
              </>
            ) : (
              "No season yet — fill in and press Start."
            )}
          </div>
          <div className={`${card} grid grid-cols-2 gap-2 text-[11.5px] font-bold text-[#5B6B8C]`}>
            <label className="col-span-2">
              Season name
              <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
            </label>
            <label>
              Gold price (coins)
              <input inputMode="numeric" value={gold} onChange={(e) => setGold(Number(e.target.value.replace(/\D/g, "")) || 0)} className={input} />
            </label>
            <label>
              SP per level
              <input inputMode="numeric" value={per} onChange={(e) => setPer(Number(e.target.value.replace(/\D/g, "")) || 10)} className={input} />
            </label>
            <label>
              Days (new season)
              <input inputMode="numeric" value={days} onChange={(e) => setDays(Number(e.target.value.replace(/\D/g, "")) || 30)} className={input} />
            </label>
          </div>
          <div className={card}>
            <p className="mb-2 text-[13px] font-black text-[#0B1F3A]">Rewards · 30 levels</p>
            <div className="space-y-1.5">
              {levels.map((l, i) => (
                <div key={i} className="rounded-xl border border-[#E3ECF7]">
                  <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[13px]">
                    <b className="w-8 text-[#2563EB]">{i + 1}</b>
                    <span className="flex-1">
                      {rewardIcon(l.free)} free · {rewardIcon(l.gold)} gold
                    </span>
                    <span className="text-[#8A97A8]">{open === i ? "▴" : "▾"}</span>
                  </button>
                  {open === i && <div className="grid grid-cols-2 gap-2 p-2 pt-0">{editor(i, "free", l.free)}{editor(i, "gold", l.gold)}</div>}
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy || !s.id} onClick={() => run(() => saveSeason({ name, goldPrice: gold, spPerLevel: per, levels }), "✅ Saved")} className="rounded-xl bg-[#0B1F3A] py-3 text-[14px] font-bold text-white disabled:opacity-50">
              Save changes
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => confirm(s.id ? "Start a NEW season? Everybody starts again from level 0." : "Start the season now?") && run(() => startSeason({ name, days, goldPrice: gold, spPerLevel: per, levels }), "🎟 New season started!")}
              className="rounded-xl bg-gradient-to-b from-[#FB923C] to-[#EA580C] py-3 text-[14px] font-bold text-white disabled:opacity-50"
            >
              {s.id ? "Start new season" : "Start season"}
            </button>
          </div>
          {msg && <p className={`text-[13px] font-bold ${msg.error ? "text-[#DC2626]" : "text-[#0E9F6E]"}`}>{msg.text}</p>}
        </div>
      )}
    </FounderShell>
  );
}
