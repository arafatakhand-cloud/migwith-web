"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";

// 💎🏆 miglife only (Luxury Festival page): the festival's payouts, all paid
// from miglife's balance by the functions (luxuryFestivalPayouts /
// luxuryFestivalDailyCommission):
//   • prize for #1 … #25 + a commission % on each one's Total Spent,
//     10 minutes after the festival ends
//   • an extra daily commission %, every night 12:00 for the days miglife
//     picks (From … To), on what each of them spent in Luxury Bet that day
//   • an ON / OFF switch for all of it
// …and Reset: the 1-25 ranking starts again from zero.

const ceoResetLuxuryFestival = httpsCallable<Record<string, never>, { ok: boolean }>(functions, "ceoResetLuxuryFestival");
const MEDAL = ["🥇", "🥈", "🥉"];

export function FestivalPayoutsCard({ onReset }: { onReset: () => void }) {
  const [on, setOn] = useState(false);
  const [prizes, setPrizes] = useState<string[]>(() => Array(25).fill(""));
  const [endPct, setEndPct] = useState("");
  const [dailyPct, setDailyPct] = useState("");
  const [dailyFrom, setDailyFrom] = useState("");
  const [dailyTo, setDailyTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        doc(db, "app_settings", "luxury_festival_admin"),
        (s) => {
          const list = (s.get("prizes") as unknown[]) || [];
          setPrizes(Array.from({ length: 25 }, (_, i) => (Number(list[i]) > 0 ? String(Number(list[i])) : "")));
          setEndPct(Number(s.get("endPct")) > 0 ? String(s.get("endPct")) : "");
          setDailyPct(Number(s.get("dailyPct")) > 0 ? String(s.get("dailyPct")) : "");
          setDailyFrom(String(s.get("dailyFrom") || ""));
          setDailyTo(String(s.get("dailyTo") || ""));
          setOn(s.get("payoutsOn") === true);
        },
        () => {}
      ),
    []
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
          prizes: prizes.map((v) => Math.max(0, Math.floor(Number(v) || 0))),
          endPct: pct(endPct),
          dailyPct: pct(dailyPct),
          dailyFrom,
          dailyTo,
          payoutsUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );
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
      onReset();
    } catch (e: any) {
      setMsg(e?.message || "Could not reset.");
    } finally {
      setResetting(false);
    }
  };

  const total = prizes.reduce((sum, v) => sum + (Number(v) || 0), 0);
  const input = "min-w-0 flex-1 bg-transparent text-[15px] font-bold text-white outline-none placeholder:text-white/35";

  return (
    <div className="mt-4 space-y-3 rounded-[20px] border border-white/10 bg-white/[.07] p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black tracking-wider text-[#E9C46A]">🏆 PRIZES & COMMISSION · ONLY YOU SEE THIS</p>
          <p className="mt-0.5 text-[11px] text-white/60">Paid automatically from your balance.</p>
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

      <div>
        <p className="mb-1.5 text-xs font-bold text-white/75">🎁 Prize money · #1 – #25</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {prizes.map((v, i) => (
            <label key={i} className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/25 px-2.5 py-1.5">
              <span className="w-7 shrink-0 text-center text-[13px] font-black text-[#FFD36E]">{MEDAL[i] || `#${i + 1}`}</span>
              <input
                inputMode="numeric"
                value={v}
                placeholder="0"
                onChange={(e) => {
                  const val = e.target.value.replace(/[^\d]/g, "").slice(0, 10);
                  setPrizes((p) => p.map((x, j) => (j === i ? val : x)));
                }}
                className={input}
              />
            </label>
          ))}
        </div>
        <p className="mt-1 text-right text-[11px] text-white/55">Prizes total: 🪙 {total.toLocaleString()}</p>
      </div>

      {(
        [
          ["💰 Commission on Total Spent (%)", "10 minutes after the festival ends", endPct, setEndPct],
          ["📅 Extra daily commission (%)", "Every night 12:00 on the days below, on that day's Luxury Bet spending", dailyPct, setDailyPct],
        ] as [string, string, string, (v: string) => void][]
      ).map(([label, hint, v, set]) => (
        <label key={label} className="block">
          <span className="block text-xs font-bold text-white/75">{label}</span>
          <span className="block text-[11px] text-white/50">{hint}</span>
          <span className="mt-1 flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/25 px-3 py-2">
            <input
              inputMode="decimal"
              value={v}
              placeholder="0"
              onChange={(e) => set(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
              className={input}
            />
            <span className="font-black text-[#FFD36E]">%</span>
          </span>
        </label>
      ))}

      <div>
        <p className="text-xs font-bold text-white/75">📅 Daily commission days (Bangladesh)</p>
        <div className="mt-1 grid grid-cols-2 gap-2">
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
                onChange={(e) => set(e.target.value)}
                className="mt-0.5 block w-full rounded-xl border border-white/15 bg-black/25 px-2.5 py-2 text-sm font-semibold text-white outline-none [color-scheme:dark]"
              />
            </label>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-white/50">Paid at 12:00 after each of these days, to the top 25 of the last festival. Empty = no daily commission.</p>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="w-full rounded-xl py-2.5 text-sm font-extrabold text-[#3A2600] disabled:opacity-60"
        style={{ background: "linear-gradient(90deg,#FFE08A,#E0A100)" }}
      >
        {saving ? "Saving…" : "💾 Save prizes & commission"}
      </button>
      {msg && <p className="text-xs font-semibold text-white/80">{msg}</p>}
      <p className="text-[11px] leading-4 text-white/55">
        Only the top 25 get these. If your balance is too low, nothing is paid and you get an alert; it is paid as soon as your balance is enough.
      </p>

      <div className="border-t border-white/10 pt-3">
        {confirmReset ? (
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
