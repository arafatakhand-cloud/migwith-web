"use client";

import { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";

// 🏆 miglife secret › Daily Game Rewards: every night at 12:00 (Bangladesh)
// the day's top players are paid from miglife's balance by payDailyGameRewards
// — Luxury #1-#10, LowCard #1-#3, Cricket #1-#3, in the Rankings order. Here
// miglife sets each place's amount (app_settings/daily_game_rewards), turns it
// on / off, sees the last nights' payouts, and can pay a missed day again.

const GAMES = [
  { key: "luxury", label: "💎 Luxury Bet", places: 10, tint: "#8E24AA" },
  { key: "lowcard", label: "🪙 LowCard", places: 3, tint: "#D9A400" },
  { key: "cricket", label: "🏏 Cricket", places: 3, tint: "#1E8C4E" },
] as const;
type GameKey = (typeof GAMES)[number]["key"];
type Amounts = Record<GameKey, string[]>;
type LogGame = { label: string; icon: string; total: number; error?: string; have?: number | null; paid: { username: string; place: number; amount: number }[] };
type Log = { date: string; games: Record<string, LogGame> };

const ceoPayDailyGameRewards = httpsCallable<{ date: string }, unknown>(functions, "ceoPayDailyGameRewards");
const MEDAL = ["🥇", "🥈", "🥉"];
const empty = (): Amounts => ({ luxury: Array(10).fill(""), lowcard: Array(3).fill(""), cricket: Array(3).fill("") });
const coins = (n: number) => n.toLocaleString();

export function DailyGameRewardsCard() {
  const [enabled, setEnabled] = useState(false);
  const [amounts, setAmounts] = useState<Amounts>(empty);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [paying, setPaying] = useState("");

  useEffect(
    () =>
      onSnapshot(
        doc(db, "app_settings", "daily_game_rewards"),
        (s) => {
          const next = empty();
          GAMES.forEach((g) => {
            const list = (s.get(g.key) as unknown[]) || [];
            next[g.key] = next[g.key].map((_, i) => (Number(list[i]) > 0 ? String(Number(list[i])) : ""));
          });
          setAmounts(next);
          setEnabled(s.get("enabled") === true);
          setLoaded(true);
        },
        () => setLoaded(true)
      ),
    []
  );
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "daily_game_rewards_log"), orderBy("date", "desc"), limit(7)),
        (q) => setLogs(q.docs.map((d) => ({ date: String(d.get("date") || d.id), games: (d.get("games") as Record<string, LogGame>) || {} }))),
        () => {}
      ),
    []
  );

  const totalOf = (k: GameKey) => amounts[k].reduce((sum, v) => sum + (Number(v) || 0), 0);
  const nightly = GAMES.reduce((sum, g) => sum + totalOf(g.key), 0);

  const save = async (on = enabled) => {
    setMsg("");
    setSaving(true);
    try {
      const data: Record<string, unknown> = { enabled: on, updatedAt: serverTimestamp() };
      GAMES.forEach((g) => (data[g.key] = amounts[g.key].map((v) => Math.max(0, Math.floor(Number(v) || 0)))));
      await setDoc(doc(db, "app_settings", "daily_game_rewards"), data);
      setMsg(on ? "✅ Saved — rewards will be paid tonight at 12:00." : "✅ Saved — daily rewards are OFF.");
    } catch (e: any) {
      setMsg(e?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const payAgain = async (date: string) => {
    setPaying(date);
    try {
      await ceoPayDailyGameRewards({ date });
    } catch (e: any) {
      setMsg(e?.message || "Could not pay.");
    } finally {
      setPaying("");
    }
  };

  if (!loaded) return <p className="py-8 text-center text-sm text-[#5B6B8C]">Loading…</p>;

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-[22px] border border-[#D4AF37] bg-white p-4 shadow-md">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold">🏆 Daily Game Rewards</p>
            <p className="text-xs text-[#5B6B8C]">
              Every night at 12:00 (Bangladesh) the day&apos;s top players get these coins from your balance — the same order as Rankings. You get an
              alert each night.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setEnabled(!enabled);
              void save(!enabled);
            }}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${enabled ? "bg-[#22A55A]" : "bg-[#C9D2DE]"}`}
            aria-label="Daily rewards on / off"
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>

        {GAMES.map((g) => (
          <div key={g.key} className="rounded-2xl border p-3" style={{ borderColor: `${g.tint}44`, background: `${g.tint}0D` }}>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-extrabold" style={{ color: g.tint }}>
                {g.label} · Top {g.places}
              </p>
              <p className="text-[11px] font-bold text-[#5B6B8C]">🪙 {coins(totalOf(g.key))} / night</p>
            </div>
            <div className={`grid gap-2 ${g.places > 3 ? "grid-cols-2" : "grid-cols-3"}`}>
              {amounts[g.key].map((v, i) => (
                <label key={i} className="flex items-center gap-1.5 rounded-xl border border-[#E3EAF5] bg-white px-2.5 py-1.5">
                  <span className="w-7 shrink-0 text-center text-sm font-black text-[#5B6B8C]">{MEDAL[i] || `#${i + 1}`}</span>
                  <input
                    inputMode="numeric"
                    value={v}
                    placeholder="0"
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^\d]/g, "").slice(0, 9);
                      setAmounts((a) => ({ ...a, [g.key]: a[g.key].map((x, j) => (j === i ? val : x)) }));
                    }}
                    className="min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between rounded-xl bg-[#FFF8E1] px-3 py-2 text-sm">
          <span className="font-bold text-[#7A5A00]">Every night, at most</span>
          <span className="font-black text-[#B7791F]">🪙 {coins(nightly)}</span>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="w-full rounded-xl bg-gradient-to-r from-[#E0A100] to-[#B8860B] py-2.5 font-extrabold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "💾 Save rewards"}
        </button>
        {msg && <p className="text-xs font-semibold text-[#5B6B8C]">{msg}</p>}
        <p className="text-[11px] leading-4 text-[#8A97B2]">
          A place left at 0 gets nothing. If your balance is less than a game&apos;s total, that game is not paid and you get an alert — top up
          and tap &quot;Pay again&quot; below. You never pay yourself.
        </p>
      </div>

      <div className="space-y-2 rounded-[22px] bg-white p-4 shadow-md">
        <p className="font-extrabold">📜 Last nights</p>
        {logs.length === 0 && <p className="text-xs text-[#5B6B8C]">Nothing paid yet.</p>}
        {logs.map((l) => {
          const games = Object.values(l.games);
          const failed = games.some((g) => g.error);
          return (
            <div key={l.date} className="rounded-2xl border border-[#E3EAF5] p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-sm font-black">{l.date}</p>
                {failed && (
                  <button
                    type="button"
                    disabled={!!paying}
                    onClick={() => void payAgain(l.date)}
                    className="rounded-full bg-[#E53935] px-3 py-1 text-[11px] font-extrabold text-white disabled:opacity-50"
                  >
                    {paying === l.date ? "Paying…" : "↻ Pay again"}
                  </button>
                )}
              </div>
              {games.map((g) => (
                <p key={g.label} className="text-[12px] leading-5 text-[#3A4A66]">
                  <b>
                    {g.icon} {g.label}:
                  </b>{" "}
                  {g.error === "low-balance" ? (
                    <span className="font-bold text-[#B3261E]">not paid — balance {coins(Number(g.have || 0))} &lt; {coins(g.total)}</span>
                  ) : g.error ? (
                    <span className="font-bold text-[#B3261E]">not paid</span>
                  ) : g.paid.length === 0 ? (
                    "no players"
                  ) : (
                    g.paid.map((w) => `#${w.place} ${w.username} ${coins(w.amount)}`).join(", ")
                  )}
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
