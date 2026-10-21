"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";

// 💎🏆 miglife only (Luxury Festival page): the festival's payouts, all paid
// from miglife's balance by the functions (luxuryFestivalPayouts /
// luxuryFestivalDailyCommission) — when the balance is not enough, the missing
// coins are added to miglife first. For each place #1 … #25 miglife sets:
//   • Prize      — coins, 10 minutes after the festival ends
//   • Total %    — commission on that player's festival Total Spent (same time)
//   • Daily %    — extra commission every night 12:00 on the days miglife
//                  picks (From … To), on what they spent in Luxury Bet that day
// Only the places in use are shown; "＋ Add" brings the next one with the
// row above copied in. One ON / OFF switch for all, and Reset (danger zone).

const ceoResetLuxuryFestival = httpsCallable<Record<string, never>, { ok: boolean }>(functions, "ceoResetLuxuryFestival");
const MEDAL = ["🥇", "🥈", "🥉"];
const PLACES = 25;
type Row = { prize: string; endPct: string; dailyPct: string };
const EMPTY: Row = { prize: "", endPct: "", dailyPct: "" };
const toText = (v: unknown) => (Number(v) > 0 ? String(Number(v)) : "");
const filled = (r: Row) => !!(r.prize || r.endPct || r.dailyPct);
const coins = (n: number) => n.toLocaleString();
const shortDay = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

export function FestivalPayoutsCard({ onReset }: { onReset: () => void }) {
  const [on, setOn] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: PLACES }, () => ({ ...EMPTY })));
  // how many places are shown (the used ones, at least 3)
  const [shown, setShown] = useState(3);
  const [dailyFrom, setDailyFrom] = useState("");
  const [dailyTo, setDailyTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        doc(db, "app_settings", "luxury_festival_admin"),
        (s) => {
          if (dirty) return; // don't overwrite what miglife is typing
          const list = (k: string) => (s.get(k) as unknown[]) || [];
          const p = list("prizes"), e = list("endPcts"), dd = list("dailyPcts");
          const next = Array.from({ length: PLACES }, (_, i) => ({ prize: toText(p[i]), endPct: toText(e[i]), dailyPct: toText(dd[i]) }));
          setRows(next);
          const last = next.map(filled).lastIndexOf(true);
          setShown(Math.max(3, last + 1));
          setDailyFrom(String(s.get("dailyFrom") || ""));
          setDailyTo(String(s.get("dailyTo") || ""));
          setOn(s.get("payoutsOn") === true);
        },
        () => {}
      ),
    [dirty]
  );

  const pct = (v: string) => Math.min(100, Math.max(0, Number(v) || 0));
  const save = async (nextOn = on) => {
    setMsg("");
    if (dailyFrom && dailyTo && dailyTo < dailyFrom) return setMsg("The daily commission's To date must be after From.");
    setSaving(true);
    try {
      await setDoc(
        doc(db, "app_settings", "luxury_festival_admin"),
        {
          payoutsOn: nextOn,
          prizes: rows.map((r) => Math.max(0, Math.floor(Number(r.prize) || 0))),
          endPcts: rows.map((r) => pct(r.endPct)),
          dailyPcts: rows.map((r) => pct(r.dailyPct)),
          dailyFrom,
          dailyTo,
          payoutsUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setDirty(false);
      setMsg(nextOn ? "✅ Saved — payouts are ON." : "✅ Saved — payouts are OFF.");
    } catch (e: any) {
      setMsg(e?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setResetting(true);
    setMsg("");
    try {
      await ceoResetLuxuryFestival({});
      setMsg("🗑 Reset — the ranking starts again from zero.");
      setConfirmReset(false);
      setDangerOpen(false);
      onReset();
    } catch (e: any) {
      setMsg(e?.message || "Could not reset.");
    } finally {
      setResetting(false);
    }
  };

  const edit = (i: number, k: keyof Row, raw: string) => {
    const val = k === "prize" ? raw.replace(/[^\d]/g, "").slice(0, 10) : raw.replace(/[^\d.]/g, "").slice(0, 5);
    setRows((p) => p.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
    setDirty(true);
  };
  const clearRow = (i: number) => {
    setRows((p) => p.map((r, j) => (j === i ? { ...EMPTY } : r)));
    // the last shown row emptied → hide it (keep at least 3)
    if (i === shown - 1 && shown > 3) setShown(shown - 1);
    setDirty(true);
  };
  // ＋ Add: the next place, with the row above copied in (usually the same)
  const addRow = () => {
    if (shown >= PLACES) return;
    setRows((p) => p.map((r, j) => (j === shown ? { ...p[shown - 1] } : r)));
    setShown(shown + 1);
    setDirty(true);
  };

  const used = rows.slice(0, shown).filter(filled).length;
  const prizeTotal = rows.reduce((sum, r) => sum + (Number(r.prize) || 0), 0);
  const dailyDays = dailyFrom && dailyTo ? `${shortDay(dailyFrom)} – ${shortDay(dailyTo)}` : "Off";
  const cell =
    "w-full min-w-0 rounded-lg border border-white/15 bg-black/25 px-2 py-1.5 text-center text-[13px] font-bold text-white outline-none placeholder:text-white/25 focus:border-[#FFD36E]";

  return (
    <div className="mt-4 space-y-3 rounded-[20px] border border-white/10 bg-white/[.07] p-4">
      {/* title + ON / OFF */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black tracking-wider text-[#E9C46A]">🏆 PRIZES & COMMISSION · ONLY YOU SEE THIS</p>
          <p className="mt-0.5 text-[11px] text-white/60">{on ? "ON — paid automatically from your balance." : "OFF — nothing is paid."}</p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setOn(!on);
            void save(!on);
          }}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-[#22A55A]" : "bg-white/25"}`}
          aria-label="Payouts on / off"
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      {/* one look summary */}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["🎁", "Prizes", `🪙 ${coins(prizeTotal)}`],
            ["👥", "Places", `${used} / ${PLACES}`],
            ["📅", "Daily %", dailyDays],
          ] as const
        ).map(([icon, label, value]) => (
          <div key={label} className="rounded-xl bg-black/25 px-2 py-2 text-center">
            <p className="text-[10px] font-bold text-white/55">
              {icon} {label}
            </p>
            <p className="mt-0.5 truncate text-[13px] font-black text-[#FFD36E]">{value}</p>
          </div>
        ))}
      </div>

      {/* the places in use */}
      <div className="overflow-hidden rounded-xl border border-white/10">
        <div className="grid grid-cols-[34px_1.4fr_1fr_1fr_26px] gap-1.5 bg-black/30 px-2 py-1.5 text-[10.5px] font-black text-[#E9C46A]">
          <span className="text-center">#</span>
          <span className="text-center">🎁 Prize</span>
          <span className="text-center">💰 Total %</span>
          <span className="text-center">📅 Daily %</span>
          <span />
        </div>
        <div className="space-y-1 p-1.5">
          {rows.slice(0, shown).map((r, i) => (
            <div key={i} className="grid grid-cols-[34px_1.4fr_1fr_1fr_26px] items-center gap-1.5">
              <span className="text-center text-[13px] font-black text-[#FFD36E]">{MEDAL[i] || `#${i + 1}`}</span>
              <input inputMode="numeric" value={r.prize} placeholder="—" onChange={(e) => edit(i, "prize", e.target.value)} className={cell} />
              <input inputMode="decimal" value={r.endPct} placeholder="—" onChange={(e) => edit(i, "endPct", e.target.value)} className={cell} />
              <input inputMode="decimal" value={r.dailyPct} placeholder="—" onChange={(e) => edit(i, "dailyPct", e.target.value)} className={cell} />
              <button
                type="button"
                onClick={() => clearRow(i)}
                className={`h-6 w-6 rounded-full text-[12px] font-bold ${filled(r) ? "bg-white/10 text-white/70" : "text-white/20"}`}
                aria-label={`Clear #${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
          {shown < PLACES && (
            <button
              type="button"
              onClick={addRow}
              className="mt-1 w-full rounded-lg border border-dashed border-[#FFD36E]/50 py-2 text-[12.5px] font-extrabold text-[#FFD36E]"
            >
              ＋ Add #{shown + 1} <span className="font-semibold text-white/50">(copies #{shown})</span>
            </button>
          )}
        </div>
      </div>
      <p className="text-[11px] leading-4 text-white/55">
        🎁 Prize + 💰 Total % are paid 10 minutes after the festival ends. 📅 Daily % is paid every night 12:00 on the days below, on that
        day&apos;s Luxury Bet play. An empty box = nothing for that place.
      </p>

      {/* daily commission days */}
      <div className="rounded-xl bg-black/20 p-2.5">
        <p className="text-xs font-bold text-white/75">📅 Daily commission days (Bangladesh)</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {(
            [
              ["From", dailyFrom, setDailyFrom],
              ["To", dailyTo, setDailyTo],
            ] as [string, string, (v: string) => void][]
          ).map(([label, v, set]) => (
            <label key={label} className="block text-[11px] font-bold text-white/60">
              {label}
              <input
                type="date"
                value={v}
                onChange={(e) => {
                  set(e.target.value);
                  setDirty(true);
                }}
                className="mt-0.5 block w-full rounded-xl border border-white/15 bg-black/25 px-2.5 py-2 text-sm font-semibold text-white outline-none [color-scheme:dark]"
              />
            </label>
          ))}
        </div>
        {(dailyFrom || dailyTo) && (
          <button
            type="button"
            onClick={() => {
              setDailyFrom("");
              setDailyTo("");
              setDirty(true);
            }}
            className="mt-1.5 text-[11px] font-bold text-white/55 underline"
          >
            No daily commission
          </button>
        )}
      </div>

      {/* save (stays at the bottom of the screen while there are changes) */}
      <div className={dirty ? "sticky bottom-2 z-10" : ""}>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="w-full rounded-xl py-2.5 text-sm font-extrabold text-[#3A2600] shadow-lg disabled:opacity-60"
          style={{ background: "linear-gradient(90deg,#FFE08A,#E0A100)" }}
        >
          {saving ? "Saving…" : dirty ? "💾 Save changes" : "💾 Save prizes & commission"}
        </button>
      </div>
      {msg && <p className="text-xs font-semibold text-white/80">{msg}</p>}
      <p className="text-[11px] leading-4 text-white/55">💰 If your balance is not enough, the missing coins are added to your balance first — nobody is left unpaid.</p>

      {/* danger zone */}
      <div className="border-t border-white/10 pt-3">
        {!dangerOpen ? (
          <button type="button" onClick={() => setDangerOpen(true)} className="w-full text-center text-[12px] font-bold text-white/45">
            ⚠️ Danger zone ›
          </button>
        ) : confirmReset ? (
          <div className="space-y-2">
            <p className="text-[13px] font-bold text-[#FFB4AB]">Delete all names from the 1–25 ranking and start from zero?</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={resetting}
                onClick={() => void reset()}
                className="flex-1 rounded-xl bg-[#E53935] py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {resetting ? "Resetting…" : "Yes, reset"}
              </button>
              <button type="button" onClick={() => setConfirmReset(false)} className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm font-bold">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="w-full rounded-xl border border-[#FF8A8A66] bg-[#E53935]/15 py-2.5 text-sm font-extrabold text-[#FFB4AB]"
          >
            🗑 Reset ranking (1–25)
          </button>
        )}
      </div>
    </div>
  );
}
