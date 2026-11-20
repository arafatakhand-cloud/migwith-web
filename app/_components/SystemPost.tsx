"use client";

import Link from "next/link";
import type { SysCard } from "../../lib/feed";

// =============================================================================
// ⚙️ System posts (miglife 2026-11), same as the app (BlogSystem.kt):
//   SystemCard  — the coloured card a System post draws (missions, birthdays, hadith…)
//   SysTag      — "⚙️ System post" next to the name
//   EveryoneTag — the 🌍 Everyone mark in miGlife colours (pick "D")
// =============================================================================

export const SYS_THEMES: Record<string, string> = {
  sunrise: "linear-gradient(135deg,#F59E0B,#F97316,#EC4899)",
  violet: "linear-gradient(135deg,#7C3AED,#4F46E5)",
  bd: "linear-gradient(135deg,#059669,#047857 55%,#DC2626)",
  eid: "linear-gradient(135deg,#065F46,#0F766E 60%,#CA8A04)",
  night: "linear-gradient(135deg,#1E1B4B,#4C1D95)",
  dusk: "linear-gradient(135deg,#BE123C,#7C2D12)",
  pink: "linear-gradient(135deg,#EC4899,#F472B6,#FB7185)",
  sky: "linear-gradient(135deg,#0EA5E9,#2563EB)",
  gold: "linear-gradient(135deg,#F59E0B,#D97706)",
  slate: "linear-gradient(135deg,#334155,#0F172A)",
  green: "linear-gradient(135deg,#065F46,#0F766E)",
  ocean: "linear-gradient(135deg,#1E3A8A,#0E7490)",
};

export function SysTag() {
  return <span className="ml-1.5 inline-block whitespace-nowrap rounded-full bg-[#EEF0FF] px-[7px] py-[1px] align-[1px] text-[10.5px] font-extrabold text-[#6366F1]">⚙️ System post</span>;
}

export function EveryoneIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="inline-block align-[-2px]">
      <defs>
        <linearGradient id="mig-everyone" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F59E0B" />
          <stop offset=".5" stopColor="#EC4899" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#mig-everyone)" />
      <path d="M2.5 12h19M12 2.5c2.8 3 2.8 16 0 19M12 2.5c-2.8 3-2.8 16 0 19" stroke="#fff" strokeWidth="1.6" fill="none" />
    </svg>
  );
}
export function EveryoneTag() {
  return (
    <span className="whitespace-nowrap">
      <EveryoneIcon /> <span className="font-extrabold text-[#8B5CF6]">Everyone</span>
    </span>
  );
}

// @names → profile links
function Names({ text }: { text: string }) {
  const parts = text.split(/(@[A-Za-z0-9_.\-]+)/g);
  return (
    <>
      {parts.map((x, i) =>
        x.startsWith("@") ? (
          <Link key={i} href={`/profile/${encodeURIComponent(x.slice(1))}`} onClick={(e) => e.stopPropagation()} className="font-extrabold underline-offset-2 hover:underline">
            {x}
          </Link>
        ) : (
          <span key={i}>{x}</span>
        ),
      )}
    </>
  );
}

export function SystemCard({ sys, onOpenPost }: { sys: SysCard; onOpenPost?: (id: string) => void }) {
  const lines = String(sys.text || "").split("\n").filter(Boolean);
  return (
    <div className="flex min-h-[170px] flex-col justify-center rounded-[18px] px-[18px] py-[20px] text-white" style={{ background: SYS_THEMES[sys.theme] || SYS_THEMES.violet }}>
      <div className="text-[11.5px] font-black uppercase tracking-[.12em] opacity-90">{sys.kicker}</div>
      <div className={`mt-1.5 font-black leading-tight ${sys.title.length > 70 ? "text-[17px]" : "text-[21px]"}`}>{sys.title}</div>
      {typeof sys.progress === "number" && (
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/25">
          <i className="block h-full rounded-full bg-white" style={{ width: `${Math.round(sys.progress * 100)}%` }} />
        </div>
      )}
      {sys.rows?.map((r, i) => (
        <div key={i} className="mt-1.5 flex items-center gap-2 rounded-xl bg-white/[.18] px-2.5 py-[7px] text-[13px] font-bold">
          <span className="min-w-0 flex-1">{r.l}</span>
          {r.r && <span className="shrink-0">{r.r}</span>}
        </div>
      ))}
      {sys.top?.length ? (
        <div className="mt-2.5 flex gap-2">
          {sys.top.map((t, i) => (
            <button key={t.id} type="button" onClick={(e) => (e.stopPropagation(), onOpenPost?.(t.id))} className="flex-1 rounded-xl bg-white/[.18] px-1 py-2 text-center text-[12px] font-extrabold">
              <span className="block text-[20px]">{["🥇", "🥈", "🥉"][i]}</span>
              <span className="block truncate">@{t.name}</span>❤️ {t.likes}
            </button>
          ))}
        </div>
      ) : (
        lines.length > 0 && (
          <div className="mt-2 whitespace-pre-line text-[13.5px] font-semibold leading-snug opacity-95">
            {lines.map((l, i) => (
              <div key={i}>
                <Names text={l} />
              </div>
            ))}
          </div>
        )
      )}
      {sys.foot && <div className="mt-2 text-[12.5px] font-bold opacity-90">{sys.foot}</div>}
    </div>
  );
}
