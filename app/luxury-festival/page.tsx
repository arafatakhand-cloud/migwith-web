"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { isMainFounderName } from "../../lib/founder";
import { PageShell } from "../_components/PageShell";
import { RefreshButton } from "../_components/RefreshButton";
import { Face, profileImageUrl } from "../_components/RankFace";
import { FestivalPayoutsCard } from "./_PayoutsCard";

// 💎 Discover › Luxury Festival: everyone sees the festival time and the top 25
// Luxury Bet players with how much each has spent (getLuxuryFestival). miglife
// also sets the start and end (Asia/Dhaka time) in
// app_settings/luxury_festival_admin and sees the bet counts. A NEW
// start gives a new festivalId → starts from zero; changing only the end keeps
// the running totals.

type Cfg = { startDate: string; startHour: number; startMinute: number; endDate: string; endHour: number; endMinute: number; festivalId: string };
type Player = { uid: string; username: string; position: number; spend?: number; bets?: number };
type Festival = {
  festival: { startMs: number; endMs: number; festivalId: string } | null;
  players: Player[];
  mySpend: number;
  myPosition: number;
  /** 🏆 prize for #1 … #25 (only while miglife's payouts are ON) */
  prizes?: number[];
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
// The countdown boxes: days / hours / minutes / seconds.
function parts(ms: number): [string, string][] {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [
    [String(Math.floor(s / 86400)), "DAYS"],
    [pad(Math.floor((s % 86400) / 3600)), "HRS"],
    [pad(Math.floor((s % 3600) / 60)), "MIN"],
    [pad(s % 60), "SEC"],
  ];
}
const short = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n.toLocaleString();
const GOLD = "#FFD36E";
const PODIUM = [
  { ring: "linear-gradient(#FFE08A,#E0A100)", step: "linear-gradient(#FFD36E,#C98A00)", text: GOLD, h: 88 },
  { ring: "linear-gradient(#E3E8F0,#9AA6B8)", step: "linear-gradient(#C9D2E0,#7E8AA0)", text: "#D6DEEA", h: 62 },
  { ring: "linear-gradient(#F3B68A,#B8642A)", step: "linear-gradient(#E9A070,#9C5222)", text: "#F3C29E", h: 46 },
];
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
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const router = useRouter();

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

  // Profile pictures of the players on the list (and mine), each read once.
  const photoKey = [...(data?.players || []).map((p) => p.uid), user?.uid || ""].filter(Boolean).join(",");
  useEffect(() => {
    const want = photoKey.split(",").filter((u) => u && !(u in photos));
    if (!want.length) return;
    let gone = false;
    Promise.all(want.map((u) => getDoc(doc(db, "users", u)).then((s) => [u, profileImageUrl(s.data())] as const).catch(() => [u, ""] as const))).then(
      (got) => !gone && setPhotos((p) => ({ ...p, ...Object.fromEntries(got) }))
    );
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey]);

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
      }, { merge: true });
      setMsg(sameStart ? "✅ Saved — the ranking keeps going." : "✅ Saved — a new festival starts from zero.");
      setTimeout(load, 1500);
    } catch (e: any) {
      setMsg(e?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const BG = "radial-gradient(120% 60% at 50% 0%, #5B2BA8 0%, #2A1150 55%, #170A2E 100%)";
  if (loading) {
    return (
      <PageShell light>
        <div className="min-h-[calc(100dvh-57px)]" style={{ background: BG }}>
          <p className="py-20 text-center text-sm text-white/70">Loading…</p>
        </div>
      </PageShell>
    );
  }

  const f = data?.festival || null;
  const status = !data ? "loading" : !f ? "none" : now < f.startMs ? "soon" : now <= f.endMs ? "live" : "ended";
  const players = data?.players || [];
  const top = players[0]?.spend || 0;
  const podium = players.slice(0, 3);
  const rest = players.slice(3);
  const meOnList = !!data && data.myPosition > 0;
  // How far to the next place up (when that player's spend is on the list).
  const above = meOnList && data!.myPosition > 1 ? players.find((p) => p.position === data!.myPosition - 1) : undefined;
  const gap = above?.spend !== undefined ? Math.max(0, above.spend - data!.mySpend) : null;
  const pill =
    status === "live"
      ? { t: "LIVE", bg: "rgba(46,229,157,.15)", c: "#7CF5C4", dot: "#2EE59D" }
      : status === "soon"
        ? { t: "STARTS SOON", bg: "rgba(255,211,110,.15)", c: GOLD, dot: GOLD }
        : status === "ended"
          ? { t: "ENDED", bg: "rgba(255,255,255,.1)", c: "#D6CCF0", dot: "#A99BD0" }
          : { t: status === "loading" ? "LOADING…" : "NO FESTIVAL", bg: "rgba(255,255,255,.1)", c: "#D6CCF0", dot: "#A99BD0" };

  return (
    <PageShell light>
      <div className="min-h-[calc(100dvh-57px)] text-white" style={{ background: BG }}>
        <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6">
          {/* header */}
          <div className="flex items-center gap-3 py-3">
            <button
              type="button"
              aria-label="Back"
              onClick={() => router.push("/explore")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl font-bold"
            >
              ‹
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black">💎 Luxury Festival</h1>
              <p className="text-[10.5px] font-extrabold tracking-[0.15em]" style={{ color: "#E9C46A" }}>
                LUXURY BET · TOP 25
              </p>
            </div>
            <RefreshButton
              onClick={() => setTick((t) => t + 1)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-white"
            />
          </div>

          {/* status + countdown */}
          <div className="rounded-[20px] border border-white/10 bg-white/[.07] p-3">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold" style={{ background: pill.bg, color: pill.c }}>
                <i className="h-[7px] w-[7px] rounded-full" style={{ background: pill.dot, boxShadow: `0 0 0 3px ${pill.dot}44` }} />
                {pill.t}
              </span>
              {f && (
                <span className="truncate text-[11.5px] text-white/75">
                  {niceMs(f.startMs)} → {niceMs(f.endMs)}
                </span>
              )}
            </div>
            {f && (status === "live" || status === "soon") ? (
              <>
                {status === "soon" && <p className="mb-1.5 text-center text-[11px] font-bold text-white/70">Starts in</p>}
                <div className="flex gap-1.5">
                  {parts((status === "live" ? f.endMs : f.startMs) - now).map(([v, l]) => (
                    <div key={l} className="flex-1 rounded-xl bg-black/25 py-1.5 text-center">
                      <b className="block text-xl tabular-nums" style={{ color: GOLD }}>
                        {v}
                      </b>
                      <span className="text-[9.5px] font-bold tracking-wider text-white/70">{l}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-center text-[13px] text-white/75">
                {status === "ended" ? "🏁 The festival has ended — here are the winners!" : status === "none" ? "No festival has been set yet. Check back soon! 💎" : "Loading…"}
              </p>
            )}
            <p className="mt-2.5 text-center text-[11.5px] text-white/60">Play Luxury Bet during the festival — the more you play, the higher you rank. 🎰</p>
          </div>

          {/* settings: miglife only */}
          {isMiglife && (
            <div className="mt-4 space-y-2.5 rounded-[20px] border border-white/10 bg-white/[.07] p-4">
              <p className="text-[11px] font-black tracking-wider text-[#E9C46A]">📅 FESTIVAL TIME (BANGLADESH) · ONLY YOU SEE THIS</p>
              {[
                ["Start", startIn, setStartIn],
                ["End", endIn, setEndIn],
              ].map(([label, v, set]) => (
                <label key={label as string} className="block text-xs font-bold text-white/75">
                  {label as string}
                  <input
                    type="datetime-local"
                    value={v as string}
                    onChange={(e) => (set as (x: string) => void)(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-sm font-semibold text-white outline-none [color-scheme:dark]"
                  />
                </label>
              ))}
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="w-full rounded-xl py-2.5 text-sm font-extrabold text-[#3A2600] disabled:opacity-60"
                style={{ background: "linear-gradient(90deg,#FFE08A,#E0A100)" }}
              >
                {saving ? "Saving…" : "💾 Save festival time"}
              </button>
              {msg && <p className="text-xs font-semibold text-white/80">{msg}</p>}
              <p className="text-[11px] leading-4 text-white/55">
                Only Luxury Bet bets placed between the start and the end count. A new start begins a new festival from zero; changing only the end keeps the ranking.
              </p>
            </div>
          )}
          {isMiglife && <FestivalPayoutsCard onReset={() => setTick((t) => t + 1)} />}

          {/* ranking */}
          {error ? (
            <p className="mt-6 px-1 text-center text-sm text-[#FFB4AB]">{error}</p>
          ) : !data || !f ? null : players.length === 0 ? (
            <p className="mt-8 px-1 text-center text-sm text-white/70">No one has played yet — be the first! 🎰</p>
          ) : (
            <>
              {/* podium: 2 · 1 · 3 */}
              <div className="mb-3 mt-7 flex items-end gap-2">
                {[1, 0, 2].map((i) => {
                  const p = podium[i];
                  const look = PODIUM[i];
                  if (!p) return <div key={i} className="flex-1" />;
                  const amount = p.spend ?? (p.username === username ? data.mySpend : undefined);
                  return (
                    <Link key={p.uid} href={`/profile/${encodeURIComponent(p.username)}`} className="min-w-0 flex-1 text-center">
                      <div className="relative mx-auto w-fit">
                        {i === 0 && <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[22px]">👑</span>}
                        <Face name={p.username} url={photos[p.uid]} size={i === 0 ? 70 : 56} ring={look.ring} glow={i === 0 ? "#FFC93C" : undefined} />
                      </div>
                      <p data-notranslate className={`mt-1.5 truncate font-extrabold ${i === 0 ? "text-[15px]" : "text-[13.5px]"}`}>
                        {p.username}
                      </p>
                      {amount !== undefined && (
                        <p className="text-[11.5px] font-extrabold" style={{ color: look.text }}>
                          🪙 {short(amount)}
                        </p>
                      )}
                      {(data.prizes?.[i] || 0) > 0 && (
                        <p className="mx-auto mt-0.5 w-fit rounded-full bg-[#2EE59D]/15 px-2 text-[10.5px] font-extrabold text-[#7CF5C4]">🎁 {short(data.prizes![i])}</p>
                      )}
                      <div
                        className="mt-2 flex items-start justify-center rounded-t-[14px] rounded-b-[4px] pt-2 text-[22px] font-black text-white"
                        style={{ height: look.h, background: look.step }}
                      >
                        {i + 1}
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* 4 – 25 */}
              <ul className="space-y-[7px]">
                {rest.map((r) => {
                  const mine = r.username === username;
                  const amount = r.spend ?? (mine ? data.mySpend : undefined);
                  return (
                    <li key={r.uid}>
                      <Link
                        href={`/profile/${encodeURIComponent(r.username)}`}
                        className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${mine ? "border-[#FFD36E77] bg-[#FFD36E]/15" : "border-white/10 bg-white/[.07]"}`}
                      >
                        <span className="w-7 text-center text-sm font-black text-[#B9A6E6]">{r.position}</span>
                        <Face name={r.username} url={photos[r.uid]} size={38} />
                        <span className="min-w-0 flex-1">
                          <span data-notranslate className="block truncate text-[14.5px] font-bold">
                            {r.username}
                          </span>
                          {top > 0 && amount !== undefined && (
                            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/10">
                              <i
                                className="block h-full rounded-full"
                                style={{ width: `${Math.max(2, Math.round((amount / top) * 100))}%`, background: "linear-gradient(90deg,#B07CFF,#FFD36E)" }}
                              />
                            </span>
                          )}
                          {r.bets !== undefined && <span className="mt-0.5 block text-[11px] text-white/60">{r.bets.toLocaleString()} bets</span>}
                          {(data.prizes?.[r.position - 1] || 0) > 0 && (
                            <span className="mt-0.5 block text-[11px] font-extrabold text-[#7CF5C4]">🎁 Prize {data.prizes![r.position - 1].toLocaleString()}</span>
                          )}
                        </span>
                        {amount !== undefined && (
                          <span className="whitespace-nowrap text-[13.5px] font-black tabular-nums" style={{ color: GOLD }}>
                            🪙 {amount.toLocaleString()}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {/* you */}
              {meOnList && (
                <div
                  className="mt-3 flex items-center gap-3 rounded-2xl border px-3 py-2.5"
                  style={{ background: "linear-gradient(90deg,rgba(255,211,110,.25),rgba(255,211,110,.08))", borderColor: "#FFD36E77" }}
                >
                  <span className="w-7 text-center text-sm font-black" style={{ color: GOLD }}>
                    #{data.myPosition}
                  </span>
                  <Face name={username || "?"} url={user ? photos[user.uid] : ""} size={38} ring="linear-gradient(#FFE08A,#E0A100)" />
                  <span className="min-w-0 flex-1">
                    <span data-notranslate className="block truncate text-[14.5px] font-bold">
                      You · {username}
                    </span>
                    <span className="block text-[11px] text-white/75">
                      {data.myPosition === 1 ? "👑 You are on top — keep it up!" : gap !== null ? `🪙 ${gap.toLocaleString()} more to reach #${data.myPosition - 1}` : "Keep playing to climb!"}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-[13.5px] font-black tabular-nums" style={{ color: GOLD }}>
                    🪙 {data.mySpend.toLocaleString()}
                  </span>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}
