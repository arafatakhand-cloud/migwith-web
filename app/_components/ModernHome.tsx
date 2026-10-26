"use client";

import { SupporterJersey } from "./SupporterBadge";
import type { SupporterTeam } from "../../lib/supporterTeams";

import { openPresencePopup } from "./PresencePopup";
import Link from "next/link";
import { totalXpForLevel } from "../../lib/level";
import { chatHref } from "../../lib/privateChat";

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

/** One stats tile (the app's HomeStatTile). */
function StatTile({
  href,
  icon,
  value,
  label,
  accent,
  accent2,
  highlight = false,
  live = false,
}: {
  href: string;
  icon: string;
  value: number;
  label: string;
  accent: string;
  accent2: string;
  highlight?: boolean;
  live?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-w-0 flex-1 flex-col items-center rounded-[16px] pb-2.5 pt-3 transition-transform active:scale-[0.93] ${highlight ? "" : "glass-shine stat-glass"}`}
      style={{
        // (the Glass theme's .stat-glass washes the tile with this colour)
        ["--accent" as string]: accent,
        background: `linear-gradient(${accent}1A, ${accent2}0A)`,
        border: highlight ? "1.6px solid transparent" : `1px solid ${accent}38`,
        ...(highlight
          ? {
              backgroundImage: `linear-gradient(rgba(255,255,255,.6), rgba(255,255,255,.6)), linear-gradient(${accent}1A, ${accent2}0A), linear-gradient(135deg, ${accent}, ${accent2})`,
              backgroundOrigin: "border-box",
              backgroundClip: "padding-box, padding-box, border-box",
              boxShadow: `0 4px 12px ${accent}55`,
            }
          : {}),
      }}
    >
      <span className="relative flex h-[30px] w-[30px] items-center justify-center">
        {(highlight || live) && <span aria-hidden className="stat-pulse absolute inset-0 rounded-full" style={{ background: accent }} />}
        <span className="glass-shine relative flex h-[30px] w-[30px] items-center justify-center rounded-full text-sm" style={{ background: `linear-gradient(135deg, ${accent}, ${accent2})` }}>
          {icon}
        </span>
        {highlight && <span className="stat-dot absolute -right-[3px] -top-[2px] h-[9px] w-[9px] rounded-full border-[1.5px] border-white bg-[#FF3B3B]" />}
      </span>
      <span className="mt-1.5 text-[19px] font-black leading-tight" style={{ color: highlight ? accent : "#16264A" }}>
        {value > 999 ? "999+" : value}
      </span>
      <span className={`mt-0.5 max-w-full truncate px-0.5 text-[11.5px] ${highlight ? "font-bold" : "font-medium"}`} style={{ color: highlight ? accent : "#5A6E8C" }}>
        {label}
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
  if (r === "admin" || r === "administrator") return "#B8900A";
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
  search: string;
  onSearch: (v: string) => void;
  onStatus: () => void;
}) {
  const online = friends.filter((f) => f.online);
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
        style={{ background: "linear-gradient(135deg, #2F72DB, #4F55E3 55%, #8A4FD3)" }}
      >
        <span aria-hidden className="aurora-light aurora-a" />
        <span aria-hidden className="aurora-light aurora-b" />
        <span aria-hidden className="aurora-light aurora-c" />
        {supporter && (
          <span className="pointer-events-none absolute right-16 -top-5 rotate-12 opacity-[0.17]" aria-hidden>
            <SupporterJersey team={supporter} size={150} />
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
          {/* 🏅 level badge in a glass hexagon, the level under it */}
          <Link href="/level" className="ml-2 flex shrink-0 flex-col items-center self-start">
            <span
              className="hex-glass flex h-[68px] w-[62px] items-center justify-center"
              style={{
                clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)",
                background: "linear-gradient(rgba(255,255,255,.36), rgba(255,255,255,.08))",
              }}
            >
              {levelBadgeUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={levelBadgeUrl} alt="" className="h-full w-full scale-[1.32] object-contain" />
              ) : (
                <span className="text-[46px] leading-none">{levelIcon}</span>
              )}
            </span>
            <span className="mt-1 whitespace-nowrap text-[11.5px] font-extrabold">Level {level}</span>
          </Link>
        </div>
        {/* status bubble */}
        <button
          type="button"
          onClick={onStatus}
          data-notranslate
          className="mh-status glass-shine-a relative mt-3 flex w-full items-start rounded-[14px] border border-white/30 bg-white/[0.16] px-[11px] py-2 text-left text-[13px] leading-[17px] before:absolute before:-top-[7px] before:left-5 before:border-x-[7px] before:border-b-[7px] before:border-x-transparent before:border-b-white/30 before:content-['']"
        >
          <span className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-[19px]">💬 {status || "What are you thinking?"}</span>
          <span className="pl-1.5 text-xs text-white/70">✎</span>
        </button>
        {/* XP bar: how much is left to the next level, with a shine */}
        <Link href="/level" className="relative mt-3 block">
          <span className="flex items-center text-[12px]">
            <span className="font-bold text-white/95">
              ⚡ {Math.max(0, next - xp).toLocaleString("en-US")} XP to Level {level + 1}
            </span>
            <span className="ml-auto font-semibold text-white/90">
              {xp.toLocaleString("en-US")} / {next.toLocaleString("en-US")}
            </span>
          </span>
          <span className="mt-[5px] block h-[9px] overflow-hidden rounded-md bg-white/[0.22]">
            <span
              className="xp-fill relative block h-full overflow-hidden rounded-md bg-gradient-to-r from-[#FFE08A] to-[#FFB547]"
              style={{ width: `${frac * 100}%` }}
            >
              <span aria-hidden className="xp-shine absolute inset-y-0 w-[35%]" />
            </span>
          </span>
        </Link>
      </div>

      {/* 📊 stats card — smart tiles: each its own colour; something NEW lights
          its tile up with a glowing border and a pulsing dot; Online pulses
          while friends are online (the app's HomeStatTile). */}
      <div className="mh-stats glass-card mx-2.5 mb-1.5 flex gap-2 rounded-[22px] p-2.5">
        <StatTile href="/mail" icon="✉️" value={unreadEmails} label={unreadEmails > 0 ? "New mail" : "Email"} accent="#2E86DE" accent2="#5B5BF0" highlight={unreadEmails > 0} />
        <StatTile href="/alerts" icon="🔔" value={unreadAlerts} label={unreadAlerts > 0 ? "New alerts" : "Alerts"} accent="#FF9F1C" accent2="#FF5E62" highlight={unreadAlerts > 0} />
        <StatTile href="/friends" icon="👥" value={friends.length} label="Friends" accent="#8E5CF5" accent2="#D6336C" />
        <StatTile href="/friends" icon="🟢" value={online.length} label="Online" accent="#16A34A" accent2="#14B8A6" live={online.length > 0} />
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

      {/* friend cards */}
      <p className="px-3.5 pb-1.5 pt-3 text-xs font-extrabold tracking-[0.6px] text-[#3A4B6B]">FRIENDS · {friends.length}</p>
      {friends.length === 0 && (
        <p className="px-4 py-2 text-[13px] text-[#6C87B0]">{search.trim() ? "No friends match your search." : "No friends yet. Add friends to see them here."}</p>
      )}
      <div data-notranslate>
        {friends.map((f) => (
          <div key={f.name} className="mh-row glass-card mx-2.5 my-1.5 flex items-center rounded-[18px] px-3 py-2.5">
            <Link href={`/profile/${encodeURIComponent(f.name)}`} className="relative shrink-0">
              <Avatar name={f.name} photo={f.photo} size={44} />
              <span
                className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${f.online ? "bg-[#3CC24A]" : "bg-[#C9D2DE]"}`}
              />
            </Link>
            <Link href={chatHref(f.name)} className="ml-2.5 min-w-0 flex-1">
              <span className="block truncate text-[15.5px] font-bold text-[#16264A]">{f.name}</span>
              <span className={`mt-0.5 block truncate text-[13px] text-[#6B7A90] ${f.status ? "italic" : ""}`}>
                {f.status || [f.online ? null : "Offline", `Level ${f.level}`, f.country || null].filter(Boolean).join(" · ")}
              </span>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
