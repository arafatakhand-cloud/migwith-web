"use client";

import { SupporterJersey } from "./SupporterBadge";
import type { SupporterTeam } from "../../lib/supporterTeams";

import { openPresencePopup } from "./PresencePopup";
import Link from "next/link";
import { totalXpForLevel } from "../../lib/level";
import { chatHref, useUnreadChats } from "../../lib/privateChat";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { withEmotes } from "./Emote";

// ✨ MODERN Home (the app's ModernHomeTop): gradient hero card (photo with a
// rainbow ring, name + role, status, level bar with XP; a stats card: Email / Alerts /
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

// the line icons of the stats card
// Style E: a plain line glyph (no coloured disc) with a coloured bar on the top edge.
const STAT_GLYPHS: Record<string, React.ReactNode> = {
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 004 0" />
    </>
  ),
  chat: (
    <>
      <path d="M5 6h14a2 2 0 012 2v7a2 2 0 01-2 2h-7l-4 3v-3H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3.5 19c.6-3 2.9-4.8 5.5-4.8s4.9 1.8 5.5 4.8" />
      <circle cx="16.5" cy="8.5" r="2.6" />
      <path d="M16 13.6c2.4.1 4.1 1.8 4.6 4.4" />
    </>
  ),
  online: (
    <>
      <circle cx="12" cy="12" r="5" fill="currentColor" />
      <circle cx="12" cy="12" r="9" opacity=".4" />
    </>
  ),
};

// 🎨 one slim cell of the 6D stats card: a colour 6D icon tile (gloss on top,
// a darker lip underneath) + the number and the name. Something new: a pulsing
// red dot on the tile and the number in the tile's colour.
function StatCell6D({
  href,
  glyph,
  value,
  label,
  top,
  bottom,
  lip,
  highlight = false,
  divider = false,
  onClick,
}: {
  href: string;
  glyph: keyof typeof STAT_GLYPHS;
  value: number;
  label: string;
  top: string;
  bottom: string;
  lip: string;
  highlight?: boolean;
  divider?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <Link href={href} onClick={onClick} aria-label={`${label}: ${value}`} className="relative flex min-w-0 flex-1 items-center justify-center gap-1.5 py-0.5 transition-transform active:scale-[0.92]">
      {divider && <span aria-hidden className="absolute left-0 top-1/2 h-[30px] w-px -translate-y-1/2 bg-[#E1E8F2]" />}
      {/* ✨ design B (miglife 2026-11): something new → the cell glows in its own
          colour and slowly breathes (2 s), a NEW chip on top, the bell swings.
          Same as the app (HomeStatCell6D). */}
      {highlight && (
        <>
          <span
            aria-hidden
            className="stat-glow pointer-events-none absolute inset-x-[3px] -inset-y-[5px] rounded-[14px]"
            style={{ background: `linear-gradient(${top}33,${top}66)`, border: `1.5px solid ${top}`, boxShadow: `0 0 14px ${bottom}88` }}
          />
          <span className="pointer-events-none absolute -top-[13px] left-1/2 z-10 -translate-x-1/2 rounded-md bg-gradient-to-r from-[#EF4444] to-[#F97316] px-[5px] py-px text-[7.5px] font-black leading-[9px] tracking-wide text-white">
            NEW
          </span>
        </>
      )}
      <span className="relative shrink-0">
        <span
          className={`relative flex h-[30px] w-[30px] items-center justify-center overflow-hidden rounded-[10px]${highlight && glyph === "bell" ? " stat-bell" : ""}`}
          style={{ background: `linear-gradient(${top},${bottom})`, boxShadow: `0 3px 0 ${lip}` }}
        >
          <span aria-hidden className="absolute inset-x-1 top-0.5 h-[9px] rounded-md bg-gradient-to-b from-white/50 to-white/0" />
          <svg viewBox="0 0 24 24" className="relative h-[16px] w-[16px] text-white" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
            {STAT_GLYPHS[glyph]}
          </svg>
        </span>
      </span>
      <span className="relative min-w-0 leading-none">
        <span className="block text-[17px] font-black leading-[18px]" style={{ color: lip }}>
          {value > 999 ? "999+" : value}
        </span>
        <span className="block truncate text-[10px] font-bold leading-[12px] text-[#5B6B86]">{label}</span>
      </span>
    </Link>
  );
}


// 🎨 The role chip's writing in the role's own colour (the app's role colours;
// the light ones a shade darker so they read on the white chip).
function roleInk(label: string): string {
  const r = label.trim().toLowerCase();
  if (r === "merchant") return "#9C27B0";
  if (r === "mentor") return "#E0102F";
  // (Founder stays the plain blue, like a normal user)
  if (r === "admin" || r === "administrator") return "#FFBF00";
  if (r === "staff") return "#1FA80E";
  if (r === "elite" || r === "elite user") return "#0097A7";
  if (r === "country rep") return "#9A6E52";
  return "#3984D9";
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
  levelBadgeUrl = "",
  supporter = null,
  friends,
  unreadEmails,
  unreadAlerts,
  unreadChats = 0,
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
  /** The uploaded tier picture, if miglife set one. */
  levelBadgeUrl?: string;
  /** ⚽ my Supporter Colours team: its jersey shows faint behind the card (like the profile). */
  supporter?: SupporterTeam | null;
  friends: HomeFriend[];
  unreadEmails: number;
  unreadAlerts: number;
  /** Unread private messages (the 4th tile: Chat). */
  unreadChats?: number;
  search: string;
  onSearch: (v: string) => void;
  onStatus: () => void;
}) {
  const online = friends.filter((f) => f.online);
  const router = useRouter();
  const unreadList = useUnreadChats(username);
  const [sendersOpen, setSendersOpen] = useState(false);
  const start = totalXpForLevel(level);
  const next = totalXpForLevel(level + 1);
  const frac = next > start ? Math.min(1, Math.max(0, (xp - start) / (next - start))) : 0;
  const dot = { ONLINE: "#3CC24A", BUSY: "#E53935", AWAY: "#FFB300" }[presence] || "#9AA3AE";
  const presenceLabel = { ONLINE: "Online", BUSY: "Busy", AWAY: "Away", INVISIBLE: "Invisible" }[presence] || "Offline";
  return (
    // see-through: the Lobby's background shows behind (Dashboard)
    <div className="pb-1.5">
      {/* ✨ AURORA hero card (the app's AuroraProfileCard): soft coloured lights
          drift behind the card, the photo's rainbow ring turns, the status sits
          in a bubble (2 lines) and the XP bar says how much is left, with a shine. */}
      <div
        className="aurora-card relative m-2.5 overflow-hidden rounded-[26px] p-4 text-white shadow-[0_10px_24px_rgba(21,101,216,.4)]"
        style={{ background: "linear-gradient(170deg, #0B2A3C, #0F3B52)" }}
      >
        <span aria-hidden className="aurora-light aurora-a" />
        <span aria-hidden className="aurora-light aurora-b" />
        <span aria-hidden className="aurora-light aurora-c" />
        {supporter && (
          // 🛡 B2: still behind, but clearer and 6D (half see-through)
          <span className="pointer-events-none absolute right-16 -top-5 opacity-50" aria-hidden>
            <SupporterJersey team={supporter} size={150} depth />
          </span>
        )}
        <div className="relative flex items-center">
          <Link href="/profile/me" className="relative h-[70px] w-[70px] shrink-0">
            <span
              aria-hidden
              className="aurora-ring absolute inset-0 rounded-full"
              style={{ background: "conic-gradient(#FFD36B, #FF6FA5, #8B5CFF, #3FC1E8, #FFD36B)" }}
            />
            <span className="absolute inset-[3px]">
              <Avatar name={username || "U"} photo={photo} size={64} ring="#FFFFFF" />
            </span>
          </Link>
          <div className="ml-3 min-w-0 flex-1">
            <Link href="/profile/me" data-notranslate className="block truncate text-xl font-black">
              {username || "User"}
            </Link>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span
                className="mh-chip mh-role glass-shine rounded-xl border border-white/[0.42] bg-white/[0.18] px-2 py-0.5 text-[10.5px] font-extrabold uppercase"
                style={{ ["--role-ink" as string]: roleInk(roleLabel) }}
              >
                {roleLabel}
              </span>
              <button
                type="button"
                onClick={openPresencePopup}
                className="mh-chip glass-shine flex items-center gap-1 rounded-xl border border-white/[0.42] bg-white/[0.18] px-2 py-0.5 text-[10.5px] font-extrabold"
              >
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: dot }} />
                {presenceLabel}
              </button>
            </div>
          </div>
          <Link href="/level" className="ml-2 shrink-0 self-center rounded-2xl bg-white/15 px-3 py-1.5 text-[12px] font-extrabold text-white">
            Level {level}
          </Link>
        </div>
        {/* status bubble */}
        <button
          type="button"
          onClick={onStatus}
          data-notranslate
          className="mh-status glass-shine-a relative mt-3 flex w-full items-start rounded-[14px] border border-white/20 bg-white/10 px-[11px] py-2 text-left text-[13px] leading-[17px] before:absolute before:-top-[7px] before:left-5 before:border-x-[7px] before:border-b-[7px] before:border-x-transparent before:border-b-white/30 before:content-['']"
        >
          <span className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-[19px]">💬 {status || "What are you thinking?"}</span>
          <span className="pl-1.5 text-xs text-white/70">✎</span>
        </button>
        {/* XP bar: how much is left to the next level, with a shine */}
        <Link href="/level" className="relative mt-2 ml-auto block w-[42%]">
          <span className="hidden items-center text-[12px]">
            <span className="font-bold text-white/95">
              ⚡ {Math.max(0, next - xp).toLocaleString("en-US")} XP to Level {level + 1}
            </span>
            <span className="ml-auto font-semibold text-white/90">
              {xp.toLocaleString("en-US")} / {next.toLocaleString("en-US")}
            </span>
          </span>
          <span className="mt-[5px] block h-[9px] overflow-hidden rounded-md bg-white/[0.22]">
            <span
              className="xp-fill relative block h-full overflow-hidden rounded-md bg-gradient-to-r from-[#5EEAD4] to-[#38BDF8]"
              style={{ width: `${frac * 100}%` }}
            >
              <span aria-hidden className="xp-shine absolute inset-y-0 w-[35%]" />
            </span>
          </span>
        </Link>
      </div>

      {/* 📊 stats card — smart tiles: each its own colour; something NEW lights
          its tile up with a glowing border and a pulsing dot; Online pulses
          while friends are online (see StatCell6D below). */}
      {/* 🎨 6D C2 (miglife): all four in ONE raised white card, slim cells — a
          colour 6D icon tile on the left, the number + name on the right, thin
          lines between them. Same as the app (HomeStatCell6D). */}
      <div
        className="mh-stats6d relative mx-2.5 mb-2 flex items-center rounded-[22px] px-1 py-2.5"
        style={{ background: "linear-gradient(180deg,#FFFFFF,#EEF4FB)", boxShadow: "0 4px 0 #B9CCE4, 0 10px 16px -8px rgba(30,60,110,.35)" }}
      >
        <StatCell6D href="/mail" glyph="mail" value={unreadEmails} label="Email" top="#5AB2FF" bottom="#2F6FE0" lip="#1A48A8" highlight={unreadEmails > 0} />
        <StatCell6D divider href="/alerts" glyph="bell" value={unreadAlerts} label="Alerts" top="#FFD15C" bottom="#F59E0B" lip="#B86E00" highlight={unreadAlerts > 0} />
        <StatCell6D divider href="/friends" glyph="users" value={friends.length} label="Friends" top="#C3A8FF" bottom="#7C4DEB" lip="#4F25B0" />
        <StatCell6D
          divider
          href="/messages"
          glyph="chat"
          value={unreadChats}
          label="Chat"
          top="#5FE0C6"
          bottom="#14A88C"
          lip="#0B6E5C"
          highlight={unreadChats > 0}
          onClick={(e) => {
            // 💬 C2: who sent new messages — one person opens their inbox at once,
            // several show a small box under the tile, none → all chats (as before)
            if (unreadList.length === 0) return;
            e.preventDefault();
            if (unreadList.length === 1) return router.push(chatHref(unreadList[0].from));
            setSendersOpen((v) => !v);
          }}
        />
        {sendersOpen && unreadList.length > 1 && (
          <>
            <span className="fixed inset-0 z-30" onClick={() => setSendersOpen(false)} />
            <div className="absolute right-2.5 top-full z-40 mt-2 w-[min(290px,calc(100%-20px))] rounded-[18px] bg-[#FFFFFF] p-1.5 text-left shadow-[0_14px_30px_rgba(11,31,58,.25)]">
              <span aria-hidden className="absolute -top-[7px] right-[12%] h-0 w-0 border-x-[8px] border-b-[8px] border-x-transparent border-b-[#FFFFFF]" />
              <p className="px-2.5 pb-1.5 pt-1 text-[14px] font-black text-[#0B1F3A]">💬 New messages</p>
              <div className="max-h-[300px] overflow-y-auto" data-notranslate>
                {unreadList.map((u) => {
                  const f = friends.find((x) => x.name.toLowerCase() === u.from.toLowerCase());
                  return (
                    <Link
                      key={u.from}
                      href={chatHref(u.from)}
                      onClick={() => setSendersOpen(false)}
                      className="flex items-center gap-2.5 rounded-2xl px-2 py-2 active:bg-[#F1F6FD]"
                    >
                      <Avatar name={u.from} photo={f?.photo || ""} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-extrabold text-[#0B1F3A]">{u.from}</span>
                        <span className="block truncate text-[12px] text-[#5B6B8C]">{u.last ? withEmotes(u.last, 12) : "New message"}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-[#EF4444] px-2 py-0.5 text-[11.5px] font-extrabold text-white">{u.count > 99 ? "99+" : u.count}</span>
                    </Link>
                  );
                })}
              </div>
              <Link href="/messages" onClick={() => setSendersOpen(false)} className="block py-2.5 text-center text-[13px] font-extrabold text-[#2563EB]">
                See all chats ›
              </Link>
            </div>
          </>
        )}
      </div>

      {/* (Email / Alerts now sit in their own stats card above; the Rooms / Games
          buttons were removed — the tabs above already open them.) */}

      {/* search */}
      <div className="mh-search glass-card mx-2.5 my-3 rounded-[18px] px-3.5 py-3">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="🔍 Search friends"
          className="w-full bg-transparent text-[15px] text-[#16264A] outline-none placeholder:text-[#8A97A8]"
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

    </div>
  );
}
