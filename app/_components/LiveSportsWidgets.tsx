"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { lsHighlights, lsShortName, lsTime, useLiveSports, type SportRow } from "../../lib/liveSports";

// 🏠 Home widgets, like the app's LiveScores.kt: a small live card on the
// Modern Home and a "Live Scores (n)" line on the Classic Home. Tap → the full
// Live Scores page. The match shown changes every 4 s.

function useTicker(size: number): number {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (size <= 1) return;
    const t = setInterval(() => setI((n) => (n + 1) % size), 4000);
    return () => clearInterval(t);
  }, [size]);
  return size === 0 ? 0 : Math.min(i, size - 1);
}

export function LsLiveBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#E53935] px-2.5 py-1 text-[11px] font-extrabold text-white">
      <span className="mr-[5px] h-[7px] w-[7px] animate-pulse rounded-full bg-white" />
      {count} LIVE
    </span>
  );
}

function MiniTeam({ name, short, logo, score }: { name: string; short: string; logo: string; score: string }) {
  const [bad, setBad] = useState(false);
  return (
    <span className="flex items-center">
      {logo && !bad && !/\.svg$/i.test(logo) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" onError={() => setBad(true)} className="mr-1.5 h-4 w-4 object-contain" />
      )}
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{lsShortName(name, short)}</span>
      {score && <span className="ml-2 shrink-0 text-[13px] font-extrabold">{score}</span>}
    </span>
  );
}

export function HomeLiveSportsCard() {
  const data = useLiveSports(true);
  const rows: SportRow[] = data ? [...data.cricket, ...data.football] : [];
  const picks = lsHighlights(rows, Date.now());
  const liveCount = rows.filter((r) => r.status === "LIVE").length;
  const idx = useTicker(picks.length);
  const m = picks[idx];
  return (
    <Link
      href="/live-scores"
      className="mx-2.5 mt-2.5 block rounded-[18px] px-3.5 py-3 text-white"
      style={{ background: "linear-gradient(135deg, #0F1B3D, #2A2F6E, #7A1F4B)" }}
    >
      <span className="flex items-center">
        <span className="text-lg">📺</span>
        <span className="ml-1.5 text-[15px] font-extrabold">Live Sports</span>
        {liveCount > 0 && (
          <span className="ml-2">
            <LsLiveBadge count={liveCount} />
          </span>
        )}
        <span className="ml-auto text-xs font-semibold text-white/80">{rows.length > 0 ? `${rows.length} today ›` : "Schedule ›"}</span>
      </span>
      {!m ? (
        <span className="mt-2.5 block text-[12.5px] text-white/85">🏏 Cricket  •  ⚽ Football — live scores &amp; today&apos;s match times</span>
      ) : (
        <>
          <span className="mt-2.5 flex items-center rounded-xl border border-white/[0.18] bg-white/10 px-2.5 py-2">
            <span className="text-base">{m.sport === "cricket" ? "🏏" : "⚽"}</span>
            <span className="ml-2 min-w-0 flex-1 space-y-[3px]">
              <MiniTeam name={m.home} short={m.homeShort} logo={m.homeLogo} score={m.homeScore} />
              <MiniTeam name={m.away} short={m.awayShort} logo={m.awayLogo} score={m.awayScore} />
            </span>
            {m.status === "LIVE" ? (
              <span className="ml-2 shrink-0 text-[11px] font-extrabold text-[#FF8A80]">
                {m.sport === "football" && m.statusText ? m.statusText : "LIVE"}
              </span>
            ) : (
              <span className="ml-2 shrink-0 text-[11px] font-bold text-[#FFE08A]">🕒 {lsTime(m.startMs)}</span>
            )}
          </span>
          {picks.length > 1 && (
            <span className="mt-[7px] flex justify-center gap-1">
              {picks.map((_, i) => (
                <span key={i} className={`h-[5px] rounded-[3px] transition-all ${i === idx ? "w-3.5 bg-white/95" : "w-[5px] bg-white/35"}`} />
              ))}
            </span>
          )}
        </>
      )}
    </Link>
  );
}

// 📟 Classic Home line, the same look as "Email (n)" / "migAlerts (n)".
export function ClassicHomeLiveRow() {
  const data = useLiveSports(true);
  const rows: SportRow[] = data ? [...data.cricket, ...data.football] : [];
  const picks = lsHighlights(rows, Date.now());
  const liveCount = rows.filter((r) => r.status === "LIVE").length;
  const idx = useTicker(picks.length);
  const m = picks[idx];
  return (
    <Link href="/live-scores" className="flex items-center gap-3 border-b border-[#E3ECF7] px-3.5 py-2.5 hover:bg-[#F4F9FF]">
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded bg-[#E53935] text-[11px] font-bold text-white">▶</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center">
          <span className="text-[19px] font-medium text-[#E53935]">Live Scores ({liveCount})</span>
          {liveCount > 0 && (
            <span className="classic-new-pulse ml-2 rounded-[3px] bg-[#E53935] px-[5px] py-px text-[10px] font-extrabold text-white">LIVE</span>
          )}
        </span>
        {m && (
          <span className="block truncate text-xs text-[#6B7788]">
            {m.sport === "cricket" ? "🏏 " : "⚽ "}
            {lsShortName(m.home, m.homeShort)}
            {m.homeScore ? ` ${m.homeScore}` : ""} vs {lsShortName(m.away, m.awayShort)}
            {m.awayScore ? ` ${m.awayScore}` : ""}
            {m.status === "LIVE" ? "" : `  •  ${lsTime(m.startMs)}`}
          </span>
        )}
      </span>
      <span className="text-xl text-[#A9B4C2]">›</span>
    </Link>
  );
}
