"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { db, functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell } from "../_Shell";

// 🍀 Smart Lucky User (miglife only, server: luckyUserAdmin). A lottery among the
// chatters picks the Lucky User at a random moment every minHours–maxHours; pink ID
// until the next Lucky User. Users never see how the points are counted.

type Settings = {
  on: boolean; rooms: string[]; minHours: number; maxHours: number; night: boolean; coins: number;
  lottery: boolean; maxSharePct: number; maxWinsWeek: number; firstTimerMult: number; minAgeDays: number; minLevel: number;
};
const DEFAULTS: Settings = {
  on: true, rooms: ["Bangladesh"], minHours: 4, maxHours: 5, night: true, coins: 5000,
  lottery: true, maxSharePct: 30, maxWinsWeek: 3, firstTimerMult: 2, minAgeDays: 3, minLevel: 5,
};
const call = httpsCallable<Record<string, unknown>, { settings?: Settings; nextDrawAt?: Record<string, number> }>(functions, "luckyUserAdmin");
const QUICK = ["Bangladesh", "Pakistan", "India", "Nepal"];

export default function LuckyUserSecretPage() {
  const f = useFounderPerms();
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [nextAt, setNextAt] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [allRooms, setAllRooms] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!f.can("lucky_user")) return;
    call({ action: "get" })
      .then(({ data }) => {
        if (data.settings) setS({ ...DEFAULTS, ...data.settings });
        setNextAt(data.nextDrawAt || {});
      })
      .catch((e) => setStatus(e?.message || "Could not load."))
      .finally(() => setLoaded(true));
    getDocs(query(collection(db, "rooms"), limit(400)))
      .then((x) => setAllRooms(x.docs.map((d) => d.id).sort((a, b) => a.localeCompare(b))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.loaded]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((o) => ({ ...o, [k]: v }));
  const toggleRoom = (r: string) => set("rooms", s.rooms.includes(r) ? s.rooms.filter((x) => x !== r) : [...s.rooms, r]);
  const found = q.trim() ? allRooms.filter((r) => r.toLowerCase().includes(q.trim().toLowerCase()) && !QUICK.includes(r)).slice(0, 8) : [];
  const save = async () => {
    setStatus("");
    setBusy(true);
    try {
      const { data } = await call({ action: "set", settings: s });
      if (data.settings) setS({ ...DEFAULTS, ...data.settings });
      setStatus("✅ Saved.");
    } catch (e: any) {
      setStatus(e?.message || "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-[12.5px] font-bold ${on ? "bg-gradient-to-r from-[#14B88F] to-[#2C9BEA] text-white" : "bg-[#F1F5F9] text-[#334155]"}`;
  const label = "text-[11px] font-extrabold tracking-wide text-[#64748b]";
  const box = "space-y-2 rounded-2xl bg-white p-3.5";
  // (plain functions, not components: an inner component would remount and lose the typing focus)
  const toggle = ({ text, on, onChange }: { text: string; on: boolean; onChange: (v: boolean) => void }) => (
    <label key={text} className="flex items-center gap-3 text-sm">
      <span className="flex-1">{text}</span>
      <button type="button" onClick={() => onChange(!on)} className={`relative h-6 w-11 rounded-full transition ${on ? "bg-[#14B88F]" : "bg-[#CBD5E1]"}`} aria-pressed={on}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
  const num = ({ text, k, step = 1 }: { text: string; k: keyof Settings; step?: number }) => (
    <label key={String(k)} className="block flex-1 text-xs text-[#475569]">
      {text}
      <input
        type="number"
        step={step}
        value={String(s[k])}
        onChange={(e) => set(k, Number(e.target.value) as never)}
        className="mt-1 w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-sm outline-none"
      />
    </label>
  );

  return (
    <FounderShell title="🍀 Lucky User" allowed={f.can("lucky_user")} loaded={f.loaded}>
      <p className="px-1 text-xs text-[#475569]">
        A lottery among the chatters picks the Lucky User at a random time (nobody knows when). Pink ID until the next Lucky User. Users never see how the points are counted.
      </p>
      {!loaded ? (
        <p className="p-3 text-sm text-[#64748b]">Loading…</p>
      ) : (
        <>
          <div className={box}>
            {toggle({ text: "Lucky User on", on: s.on, onChange: (v) => set("on", v) })}
          </div>
          <div className={box}>
            <p className={label}>ROOMS & TIME</p>
            <div className="flex flex-wrap gap-2">
              {[...QUICK, ...s.rooms.filter((r) => !QUICK.includes(r))].map((r) => (
                <button key={r} type="button" onClick={() => toggleRoom(r)} className={chip(s.rooms.includes(r))}>
                  {r}
                  {s.rooms.includes(r) ? " ✓" : ""}
                </button>
              ))}
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Add another room…" className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm outline-none" />
            {found.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {found.map((r) => (
                  <button key={r} type="button" onClick={() => (!s.rooms.includes(r) && toggleRoom(r), setQ(""))} className={chip(s.rooms.includes(r))}>
                    {r}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              {num({ text: "Every: min hours", k: "minHours", step: 0.5 })}
              {num({ text: "max hours", k: "maxHours", step: 0.5 })}
            </div>
            {toggle({ text: "Runs at night too (2–7 AM)", on: s.night, onChange: (v) => set("night", v) })}
            {Object.keys(nextAt).length > 0 && (
              <p className="text-xs text-[#64748b]">
                🔒 Only you see this — next pick:{" "}
                {Object.entries(nextAt)
                  .map(([r, t]) => `${r} ${t ? new Date(t).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : "soon"}`)
                  .join(" · ")}
              </p>
            )}
          </div>
          <div className={box}>
            <p className={label}>PRIZE</p>
            {num({ text: "Winner coins (+1 level, pink ID till next)", k: "coins" })}
          </div>
          <div className={box}>
            <p className={label}>FAIRNESS</p>
            {toggle({ text: "Lottery (not just the top chatter)", on: s.lottery, onChange: (v) => set("lottery", v) })}
            <div className="flex gap-2">
              {num({ text: "Max tickets per person %", k: "maxSharePct" })}
              {num({ text: "Max wins per week", k: "maxWinsWeek" })}
            </div>
            {num({ text: "First-timer bonus (tickets ×)", k: "firstTimerMult", step: 0.5 })}
            <div className="flex gap-2">
              {num({ text: "Min ID age (days)", k: "minAgeDays" })}
              {num({ text: "Min level", k: "minLevel" })}
            </div>
          </div>
          <button type="button" disabled={busy} onClick={save} className="w-full rounded-xl bg-gradient-to-r from-[#14B88F] to-[#2C9BEA] py-3 text-sm font-extrabold text-white shadow disabled:opacity-60">
            {busy ? "Saving…" : "💾 Save"}
          </button>
          {status && <p className="px-1 text-xs text-[#475569]">{status}</p>}
        </>
      )}
    </FounderShell>
  );
}
