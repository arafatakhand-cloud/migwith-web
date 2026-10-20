"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { isMainFounderName } from "../../lib/founder";
import { PageShell } from "../_components/PageShell";
import { PageTitle, SectionLabel } from "../_components/LightCards";

// 💎 Discover › Luxury Festival (miglife only, like the Gift Contest's admin
// side): miglife sets a start and an end (Asia/Dhaka time) in
// app_settings/luxury_festival_admin, and the server adds up every Luxury Bet
// bet placed between them in luxury_festival/{festivalId}. This page shows the
// top 25 by spend. Saving a NEW start gives a new festivalId → starts from zero;
// changing only the end keeps the running totals.

type Cfg = { startDate: string; startHour: number; startMinute: number; endDate: string; endHour: number; endMinute: number; festivalId: string };
type Row = { uid: string; name: string; spend: number; bets: number };

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
function niceDate(date: string, h: number, m: number): string {
  const ms = dhakaMs(date, h, m);
  if (ms === null) return "—";
  return new Date(ms).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}
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
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [startIn, setStartIn] = useState("");
  const [endIn, setEndIn] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user || !isMiglife) return;
    return onSnapshot(
      doc(db, "app_settings", "luxury_festival_admin"),
      (s) => {
        const c: Cfg | null = s.exists()
          ? {
              startDate: String(s.get("startDate") || ""),
              startHour: Number(s.get("startHour") || 0),
              startMinute: Number(s.get("startMinute") || 0),
              endDate: String(s.get("endDate") || ""),
              endHour: Number(s.get("endHour") || 0),
              endMinute: Number(s.get("endMinute") || 0),
              festivalId: String(s.get("festivalId") || ""),
            }
          : null;
        setCfg(c);
        if (c) {
          setStartIn(toInput(c.startDate, c.startHour, c.startMinute));
          setEndIn(toInput(c.endDate, c.endHour, c.endMinute));
        }
        setLoaded(true);
      },
      () => setLoaded(true)
    );
  }, [user, isMiglife]);

  useEffect(() => {
    if (!cfg?.festivalId) {
      setRows([]);
      return;
    }
    setRows(null);
    return onSnapshot(
      doc(db, "luxury_festival", cfg.festivalId),
      (s) => {
        const spends = (s.get("spends") || {}) as Record<string, number>;
        const bets = (s.get("bets") || {}) as Record<string, number>;
        const names = (s.get("usernames") || {}) as Record<string, string>;
        setRows(
          Object.entries(spends)
            .map(([uid, v]) => ({ uid, name: names[uid] || "Player", spend: Number(v || 0), bets: Number(bets[uid] || 0) }))
            .filter((r) => r.spend > 0)
            .sort((a, b) => b.spend - a.spend)
            .slice(0, 25)
        );
      },
      () => setRows([])
    );
  }, [cfg?.festivalId]);

  const save = async () => {
    const a = fromInput(startIn);
    const b = fromInput(endIn);
    setMsg("");
    if (!a || !b) return setMsg("Pick both the start and the end.");
    const sMs = dhakaMs(a.date, a.hour, a.minute)!;
    const eMs = dhakaMs(b.date, b.hour, b.minute)!;
    if (eMs <= sMs) return setMsg("The end must be after the start.");
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

  if (!isMiglife) {
    return (
      <PageShell light>
        <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6">
          <PageTitle title="Luxury Festival" subtitle="Live festival · top players by spend" icon="💎" backHref="/explore" />
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="text-4xl">💎</p>
            <p className="mt-2 font-bold text-[#0B2A5B]">Coming soon</p>
          </div>
        </section>
      </PageShell>
    );
  }

  const startMs = cfg ? dhakaMs(cfg.startDate, cfg.startHour, cfg.startMinute) : null;
  const endMs = cfg ? dhakaMs(cfg.endDate, cfg.endHour, cfg.endMinute) : null;
  const status = !startMs || !endMs ? "none" : now < startMs ? "soon" : now <= endMs ? "live" : "ended";

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6">
        <PageTitle title="Luxury Festival" subtitle="Luxury Bet · Top 25 by spend · only you see this" icon="💎" backHref="/explore" />

        {/* status */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2A1B4D] via-[#4B2A86] to-[#B8860B] p-4 text-white shadow-md">
          <span className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10" />
          <p className="text-sm font-bold">
            {!loaded
              ? "Loading…"
              : status === "live"
                ? "🟢 Festival is LIVE"
                : status === "soon"
                  ? "⏳ Starts soon"
                  : status === "ended"
                    ? "🏁 Festival ended"
                    : "⚪ No festival set"}
          </p>
          {status !== "none" && cfg && (
            <>
              <p className="mt-2 text-[13px] text-white/85">
                {niceDate(cfg.startDate, cfg.startHour, cfg.startMinute)} → {niceDate(cfg.endDate, cfg.endHour, cfg.endMinute)}
              </p>
              {status === "live" && endMs && <p className="mt-1 text-lg font-black text-[#FFD66B]">⏱ {left(endMs - now)} left</p>}
              {status === "soon" && startMs && <p className="mt-1 text-lg font-black text-[#FFD66B]">⏱ starts in {left(startMs - now)}</p>}
            </>
          )}
        </div>

        {/* settings */}
        <SectionLabel>📅 Festival time (Bangladesh time)</SectionLabel>
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

        {/* ranking */}
        <SectionLabel>🏆 Ranking · Top 25</SectionLabel>
        {!cfg?.festivalId ? (
          <p className="px-1 text-sm text-[#5B6B8C]">Set the festival time above to start the ranking.</p>
        ) : rows === null ? (
          <p className="px-1 text-sm text-[#5B6B8C]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-1 text-sm text-[#5B6B8C]">No Luxury Bet bets in this festival yet.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.uid}>
                <Link
                  href={`/profile/${encodeURIComponent(r.name)}`}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 shadow-sm hover:brightness-[.98] ${
                    i < 3 ? "bg-gradient-to-r from-[#FFF6DA] to-white" : "bg-white"
                  }`}
                >
                  <span className="w-8 text-center text-lg font-black text-[#B7791F]">{["🥇", "🥈", "🥉"][i] || `#${i + 1}`}</span>
                  <span className="min-w-0 flex-1">
                    <span data-notranslate className="block truncate font-bold text-[#0B2A5B]">
                      {r.name}
                    </span>
                    <span className="block text-[11px] text-[#5B6B8C]">{r.bets.toLocaleString()} bets</span>
                  </span>
                  <span className="text-sm font-extrabold text-[#C98A0C]">🪙 {r.spend.toLocaleString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
