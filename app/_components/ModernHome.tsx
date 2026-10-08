"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { dhakaTime, useLiveSports, type SportRow } from "../../lib/liveSports";
import { totalXpForLevel } from "../../lib/level";
import { chatHref } from "../../lib/privateChat";

// ✨ MODERN Home (the app's ModernHomeTop): gradient hero card (photo with a
// rainbow ring, name + role, status, level bar with XP, Email / Alerts /
// Friends / Online), a live sports card, friend search, an "online now" strip
// and friend cards. Classic keeps its own strip and folder list.

export type HomeFriend = {
  name: string;
  photo: string;
  online: boolean;
  level: number;
  country: string;
  status: string;
};

function Avatar({ name, photo, size, ring }: { name: string; photo: string; size: number; ring?: string }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-[#174EA6]"
      style={{ width: size, height: size, background: photo ? undefined : "#E0E8F4", border: ring ? `2px solid ${ring}` : undefined }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

export function ModernHomeTop({
  username,
  photo,
  roleLabel,
  presence,
  status,
  xp,
  level,
  levelIcon,
  friends,
  unreadEmails,
  unreadAlerts,
  search,
  onSearch,
  onStatus,
}: {
  username: string;
  photo: string;
  roleLabel: string;
  presence: string;
  status: string;
  xp: number;
  level: number;
  levelIcon: string;
  friends: HomeFriend[];
  unreadEmails: number;
  unreadAlerts: number;
  search: string;
  onSearch: (v: string) => void;
  onStatus: () => void;
}) {
  const online = friends.filter((f) => f.online);
  const start = totalXpForLevel(level);
  const next = totalXpForLevel(level + 1);
  const frac = next > start ? Math.min(1, Math.max(0, (xp - start) / (next - start))) : 0;
  const dot = { ONLINE: "#3CC24A", BUSY: "#E53935", AWAY: "#FFB300" }[presence] || "#9AA3AE";
  return (
    <div className="bg-[#EEF4FD] pb-1.5">
      {/* hero card */}
      <div
        className="m-2.5 rounded-[22px] p-3.5 text-white shadow-[0_8px_20px_rgba(21,101,216,.35)]"
        style={{ background: "linear-gradient(135deg, #1565D8, #3B7BF0, #7B5CF0)" }}
      >
        <div className="flex items-center">
          <Link href="/profile/me" className="relative h-16 w-16 shrink-0">
            <span
              className="block h-full w-full rounded-full p-[3px]"
              style={{ background: "conic-gradient(#FFD36B, #FF6FA5, #8B5CFF, #3FC1E8, #FFD36B)" }}
            >
              <Avatar name={username || "U"} photo={photo} size={58} ring="#FFFFFF" />
            </span>
          </Link>
          <Link
            href="/presence"
            aria-label="Presence status"
            className="-ml-4 mt-12 h-4 w-4 shrink-0 rounded-full border-[2.5px] border-white"
            style={{ background: dot }}
          />
          <div className="ml-3 min-w-0 flex-1">
            <div className="flex items-center">
              <Link href="/profile/me" data-notranslate className="min-w-0 truncate text-[19px] font-extrabold">
                {username || "User"}
              </Link>
              <span className="ml-1.5 shrink-0 rounded-[10px] border border-white/50 bg-white/[0.22] px-[7px] text-[9.5px] font-extrabold uppercase">
                {roleLabel}
              </span>
            </div>
            <button type="button" onClick={onStatus} data-notranslate className="block w-full truncate text-left text-[13px] text-white/90">
              💬 {status || "What are you thinking?"}
            </button>
          </div>
        </div>
        {/* level bar */}
        <Link href="/level" className="mt-3 block">
          <span className="flex items-center text-[11.5px] font-bold">
            {levelIcon} Level {level}
            <span className="ml-auto text-[11px] text-white/90">
              {xp.toLocaleString("en-US")} / {next.toLocaleString("en-US")} XP
            </span>
          </span>
          <span className="mt-[5px] block h-[7px] overflow-hidden rounded-[5px] bg-white/25">
            <span className="block h-full rounded-[5px] bg-gradient-to-r from-[#FFE08A] to-[#FFB547]" style={{ width: `${frac * 100}%` }} />
          </span>
        </Link>
        {/* stats */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          {(
            [
              ["/mail", `✉️ ${unreadEmails}`, "Email"],
              ["/alerts", `🔔 ${unreadAlerts}`, "Alerts"],
              ["/friends", `👥 ${friends.length}`, "Friends"],
              ["/friends", `🟢 ${online.length}`, "Online"],
            ] as const
          ).map(([href, value, label]) => (
            <Link key={label} href={href} className="rounded-xl border border-white/30 bg-white/[0.16] py-1.5 text-center">
              <span className="block truncate text-sm font-extrabold">{value}</span>
              <span className="block text-[10px] text-white/85">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* (Email / Alerts now sit in the hero card's stat row; the Rooms / Games
          buttons were removed — the tabs above already open them.) */}
      {/* 📺 live sports card (rotating live / next match) */}
      <HomeLiveSportsCard />

      {/* search */}
      <div className="mx-2.5 my-2.5 rounded-[14px] bg-white px-3 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,.1)]">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="🔍 Search friends"
          className="w-full bg-transparent text-[13px] text-[#16264A] outline-none placeholder:text-[#8A97A8]"
        />
      </div>

      {/* online now */}
      {online.length > 0 && (
        <>
          <p className="px-3.5 pb-1.5 pt-3 text-xs font-extrabold tracking-[0.6px] text-[#3A4B6B]">ONLINE NOW · {online.length}</p>
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-2.5" data-notranslate>
            {online.map((f) => (
              <Link key={f.name} href={chatHref(f.name)} className="flex w-[58px] shrink-0 flex-col items-center">
                <span className="rounded-full bg-gradient-to-br from-[#3CC24A] to-[#3FC1E8] p-[2.5px]">
                  <Avatar name={f.name} photo={f.photo} size={49} ring="#FFFFFF" />
                </span>
                <span className="w-full truncate text-center text-[10.5px] text-[#2E3B4E]">{f.name}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* friend cards */}
      <p className="px-3.5 pb-1.5 pt-3 text-xs font-extrabold tracking-[0.6px] text-[#3A4B6B]">FRIENDS · {friends.length}</p>
      {friends.length === 0 && (
        <p className="px-4 py-2 text-[13px] text-[#6C87B0]">{search.trim() ? "No friends match your search." : "No friends yet. Add friends to see them here."}</p>
      )}
      <div data-notranslate>
        {friends.map((f) => (
          <div key={f.name} className="mx-2.5 my-1 flex items-center rounded-2xl bg-white px-[11px] py-[9px] shadow-[0_2px_6px_rgba(0,0,0,.08)]">
            <Link href={`/profile/${encodeURIComponent(f.name)}`} className="relative shrink-0">
              <Avatar name={f.name} photo={f.photo} size={42} />
              <span
                className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${f.online ? "bg-[#3CC24A]" : "bg-[#C9D2DE]"}`}
              />
            </Link>
            <Link href={chatHref(f.name)} className="ml-2.5 min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold text-[#16264A]">{f.name}</span>
              <span className={`block truncate text-xs text-[#6B7A90] ${f.status ? "italic" : ""}`}>
                {f.status || [f.online ? null : "Offline", `Level ${f.level}`, f.country || null].filter(Boolean).join(" · ")}
              </span>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Matches worth showing on Home: live ones first, then the next ones today. */
export function homeSportsPicks(rows: SportRow[]): SportRow[] {
  const live = rows.filter((r) => r.status === "LIVE");
  if (live.length) return live.slice(0, 6);
  const now = Date.now();
  return rows
    .filter((r) => r.status === "UPCOMING" && r.startMs >= now - 3600_000)
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, 6);
}

// 📺 Home card: one live (or next) match at a time, switching every 5 seconds.
function HomeLiveSportsCard() {
  const data = useLiveSports(true);
  const picks = data ? homeSportsPicks([...data.cricket, ...data.football]) : [];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (picks.length < 2) return;
    const t = setInterval(() => setI((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [picks.length]);
  if (!data || picks.length === 0) return null;
  const r = picks[i % picks.length];
  const live = r.status === "LIVE";
  return (
    <Link
      href="/live-scores"
      className="mx-2.5 block rounded-2xl bg-white px-3 py-2.5 shadow-[0_2px_6px_rgba(0,0,0,.08)]"
    >
      <span className="flex items-center gap-2 text-[11px] font-bold">
        <span className={live ? "text-[#E53935]" : "text-[#1E63D6]"}>{live ? "● LIVE" : `⏰ ${dhakaTime(r.startMs)}`}</span>
        <span className="min-w-0 flex-1 truncate text-[#6B7A99]">
          {r.sport === "cricket" ? "🏏" : "⚽"} {r.league}
        </span>
        <span className="text-[#2F80ED]">All ›</span>
      </span>
      <span className="mt-1 flex items-center gap-2 text-[13.5px] font-bold text-[#16264A]">
        <span className="min-w-0 flex-1 truncate">{r.home}</span>
        <span className="shrink-0 font-extrabold">{r.homeScore || "–"}</span>
      </span>
      <span className="flex items-center gap-2 text-[13.5px] font-bold text-[#16264A]">
        <span className="min-w-0 flex-1 truncate">{r.away}</span>
        <span className="shrink-0 font-extrabold">{r.awayScore || "–"}</span>
      </span>
      {live && r.statusText && <span className="mt-0.5 block truncate text-[11px] font-semibold text-[#1E7A34]">{r.statusText}</span>}
    </Link>
  );
}
