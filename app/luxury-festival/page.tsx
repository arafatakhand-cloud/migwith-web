"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { isMainFounderName } from "../../lib/founder";
import { PageShell } from "../_components/PageShell";
import { PageTitle, SectionLabel } from "../_components/LightCards";
import { RefreshButton } from "../_components/RefreshButton";

// 💎 Discover › Luxury Festival: everyone sees the festival time and the top 25
// Luxury Bet players (getLuxuryFestival — names only; each player sees just
// their own spend, like Rankings). miglife also sets the start and end (Asia/
// Dhaka time) in app_settings/luxury_festival_admin and sees every spend. A NEW
// start gives a new festivalId → starts from zero; changing only the end keeps
// the running totals.

type Cfg = { startDate: string; startHour: number; startMinute: number; endDate: string; endHour: number; endMinute: number; festivalId: string };
type Player = { uid: string; username: string; position: number; spend?: number; bets?: number };
type Festival = {
  festival: { startMs: number; endMs: number; festivalId: string } | null;
  players: Player[];
  mySpend: number;
  myPosition: number;
};

const getLuxuryFestival = httpsCallable<Record<string, never>, Festival>(functions, "getLuxuryFestival");

const pad = (n: number) => String(n).padStart(2, "0");
// "YYYY-MM-DD" + hour:minute in Asia/Dhaka (UTC+6, no DST), same as the functions.
function dhakaMs(date: string, hour: number, minute: number): number | null {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d, hour - 6, minute);
}
const toInput = (date: string, h: number, m: number) => (date ? `${date}T${pad(h)}:${pad(m)}` : "");
function fromInput(v: string): { date: string; hour: number; minute: number } | null {
  const m = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  return m ? { date: m[1], hour: Number(m[2]), minute: Number(m[3]) } : null;
}
const niceMs = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
function left(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

export default function LuxuryFestivalPage() {
  const { user, username, loading } = useCurrentUser();
  const isMiglife = isMainFounderName(username);
  const [data, setData] = useState<Festival | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [startIn, setStartIn] = useState("");
  const [endIn, setEndIn] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // The ranking: on open, every 30 s, and on ↻.
  const load = useCallback(() => {
    getLuxuryFestival({})
      .then((r) => {
        setData(r.data);
        setError("");
      })
      .catch((e) => setError(e?.message || "Could not load the festival."));
  }, []);
  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [user, load, tick]);

  // miglife only: the saved settings, for the form.
  useEffect(() => {
    if (!user || !isMiglife) return;
    return onSnapshot(
      doc(db, "app_settings", "luxury_festival_admin"),
      (s) => {
        if (!s.exists()) return;
        const c: Cfg = {
          startDate: String(s.get("startDate") || ""),
          startHour: Number(s.get("startHour") || 0),
          startMinute: Number(s.get("startMinute") || 0),
          endDate: String(s.get("endDate") || ""),
          endHour: Number(s.get("endHour") || 0),
          endMinute: Number(s.get("endMinute") || 0),
          festivalId: String(s.get("festivalId") || ""),
        };
        setCfg(c);
        setStartIn(toInput(c.startDate, c.startHour, c.startMinute));
        setEndIn(toInput(c.endDate, c.endHour, c.endMinute));
      },
      () => {}
    );
  }, [user, isMiglife]);

  const save = async () => {
    const a = fromInput(startIn);
    const b = fromInput(endIn);
    setMsg("");
    if (!a || !b) return setMsg("Pick both the start and the end.");
    if (dhakaMs(b.date, b.hour, b.minute)! <= dhakaMs(a.date, a.hour, a.minute)!) return setMsg("The end must be after the start.");
    // Same start → keep the running totals; a new start → a new festival from zero.
    const sameStart = cfg && cfg.festivalId && cfg.startDate === a.date && cfg.startHour === a.hour && cfg.startMinute === a.minute;
    const festivalId = sameStart ? cfg!.festivalId : `lf${Date.now()}`;
    setSaving(true);
    try {
      await setDoc(doc(db, "app_settings", "luxury_festival_admin"), {
        startDate: a.date,
        startHour: a.hour,
        startMinute: a.minute,
        endDate: b.date,
        endHour: b.hour,
        endMinute: b.minute,
        festivalId,
        updatedAt: serverTimestamp(),
      });
      setMsg(sameStart ? "✅ Saved — the ranking keeps going." : "✅ Saved — a new festival starts from zero.");
      setTimeout(load, 1500);
    } catch (e: any) {
      setMsg(e?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageShell light>
        <p className="py-20 text-center text-sm text-[#5B6B8C]">Loading…</p>
      </PageShell>
    );
  }

  const f = data?.festival || null;
  const status = !data ? "loading" : !f ? "none" : now < f.startMs ? "soon" : now <= f.endMs ? "live" : "ended";
  const players = data?.players || [];

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6">
        <PageTitle title="Luxury Festival" subtitle="Luxury Bet · Top 25 players" icon="💎" backHref="/explore" />

        {/* status */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2A1B4D] via-[#4B2A86] to-[#B8860B] p-4 text-white shadow-md">
          <span className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10" />
          <div className="relative flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">
                {status === "loading"
                  ? "Loading…"
                  : status === "live"
                    ? "🟢 Festival is LIVE"
                    : status === "soon"
                      ? "⏳ Starts soon"
                      : status === "ended"
                        ? "🏁 Festival ended"
                        : "⚪ No festival right now"}
              </p>
              {f && (
                <>
                  <p className="mt-2 text-[13px] text-white/85">
                    {niceMs(f.startMs)} → {niceMs(f.endMs)}
                  </p>
                  {status === "live" && <p className="mt-1 text-lg font-black text-[#FFD66B]">⏱ {left(f.endMs - now)} left</p>}
                  {status === "soon" && <p className="mt-1 text-lg font-black text-[#FFD66B]">⏱ starts in {left(f.startMs - now)}</p>}
                </>
              )}
              <p className="mt-2 text-[12px] text-white/75">Play Luxury Bet during the festival — the more you play, the higher you rank. 🎰</p>
            </div>
            <RefreshButton
              onClick={() => setTick((t) => t + 1)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-bold text-white"
            />
          </div>
          {data && data.myPosition > 0 && (
            <div className="relative mt-3 flex items-center justify-between rounded-xl bg-white/15 px-3 py-2 text-sm">
              <span className="font-bold">⭐ You: #{data.myPosition}</span>
              <span className="font-extrabold text-[#FFD66B]">🪙 {data.mySpend.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* settings: miglife only */}
        {isMiglife && (
          <>
            <SectionLabel>📅 Festival time (Bangladesh time) · only you see this</SectionLabel>
            <div className="space-y-2.5 rounded-2xl bg-white p-4 shadow-sm">
              <label className="block text-xs font-bold text-[#5B6B8C]">
                Start
                <input
                  type="datetime-local"
                  value={startIn}
                  onChange={(e) => setStartIn(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-[#E3ECF7] bg-[#F7FAFE] px-3 py-2.5 text-sm font-semibold text-[#0B2A5B] outline-none"
                />
              </label>
              <label className="block text-xs font-bold text-[#5B6B8C]">
                End
                <input
                  type="datetime-local"
                  value={endIn}
                  onChange={(e) => setEndIn(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-[#E3ECF7] bg-[#F7FAFE] px-3 py-2.5 text-sm font-semibold text-[#0B2A5B] outline-none"
                />
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="w-full rounded-xl bg-gradient-to-r from-[#5A8FD6] to-[#2F6ABD] py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "💾 Save festival time"}
              </button>
              {msg && <p className="text-xs font-semibold text-[#5B6B8C]">{msg}</p>}
              <p className="text-[11px] leading-4 text-[#8A97B2]">
                Only Luxury Bet bets placed between the start and the end count. A new start begins a new festival from zero; changing only the end keeps the ranking.
              </p>
            </div>
          </>
        )}

        {/* ranking */}
        <SectionLabel>🏆 Ranking · Top 25</SectionLabel>
        {error ? (
          <p className="px-1 text-sm text-[#B3261E]">{error}</p>
        ) : !data ? (
          <p className="px-1 text-sm text-[#5B6B8C]">Loading…</p>
        ) : !f ? (
          <p className="px-1 text-sm text-[#5B6B8C]">No festival has been set yet. Check back soon! 💎</p>
        ) : players.length === 0 ? (
          <p className="px-1 text-sm text-[#5B6B8C]">No one has played yet — be the first! 🎰</p>
        ) : (
          <ul className="space-y-2">
            {players.map((r, i) => (
              <li key={r.uid}>
                <Link
                  href={`/profile/${encodeURIComponent(r.username)}`}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 shadow-sm hover:brightness-[.98] ${
                    r.username === username ? "bg-[#E7F0FF] ring-2 ring-[#1E63D6]" : i < 3 ? "bg-gradient-to-r from-[#FFF6DA] to-white" : "bg-white"
                  }`}
                >
                  <span className="w-8 text-center text-lg font-black text-[#B7791F]">{["🥇", "🥈", "🥉"][i] || `#${r.position}`}</span>
                  <span className="min-w-0 flex-1">
                    <span data-notranslate className="block truncate font-bold text-[#0B2A5B]">
                      {r.username}
                    </span>
                    {r.bets !== undefined && <span className="block text-[11px] text-[#5B6B8C]">{r.bets.toLocaleString()} bets</span>}
                  </span>
                  {r.spend !== undefined ? (
                    <span className="text-sm font-extrabold text-[#C98A0C]">🪙 {r.spend.toLocaleString()}</span>
                  ) : r.username === username && data ? (
                    <span className="text-sm font-extrabold text-[#C98A0C]">🪙 {data.mySpend.toLocaleString()}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
