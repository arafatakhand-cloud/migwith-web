"use client";

import { useState } from "react";

// 🪙 G3 badges (miglife, 2026-11): every badge is a round coin in a silver ring
// with a soft shine. Role badges are letters — A Admin (gold) · S Staff (blue) ·
// MT Mentor (red) · CR Country Representative (teal) · M Merchant (purple) — the
// same everywhere (room enter/left lines, the people list, profile, Feed). Other
// badges (Color Shop) keep their uploaded picture, else their emoji, in the ring.

type Letter = { t: string; outer: string; top: string; bottom: string; ring: string };
const LETTERS: Record<string, Letter> = {
  A: { t: "A", outer: "#FFD54A", top: "#FFB300", bottom: "#F57C00", ring: "#FFF3B0" },
  S: { t: "S", outer: "#4ADE80", top: "#2EBD3A", bottom: "#25A60D", ring: "#DCFCE7" },
  MT: { t: "MT", outer: "#FF8A80", top: "#E53935", bottom: "#B71C1C", ring: "#FFE0DE" },
  CR: { t: "CR", outer: "#5EEAD4", top: "#14B8A6", bottom: "#0F766E", ring: "#CCFBF1" },
  M: { t: "M", outer: "#C084FC", top: "#8B3FE8", bottom: "#5B21B6", ring: "#E9D5FF" },
};
/** role badge emoji → its letter coin */
const ROLE_LETTER: Record<string, string> = {
  "⚙️": "A", "⚙": "A",
  "🛠️": "S", "🛠": "S",
  "💼": "MT", "🎓": "MT",
  "🌍": "CR",
  "🛒": "M",
};
export const g3LetterFor = (emoji: string): string | undefined => ROLE_LETTER[emoji] ?? ROLE_LETTER[emoji.replace(/️/g, "")];
const ROLE_NAME: Record<string, string> = { A: "Administrator", S: "Staff", MT: "Mentor", CR: "Country Representative", M: "Merchant" };

function Ring({ size, title, children }: { size: string; title?: string; children: React.ReactNode }) {
  return (
    <span className="g3-badge" style={{ ["--g3" as string]: size }} title={title}>
      <span className="g3-in">{children}</span>
      <i className="g3-shine" />
    </span>
  );
}

/** A role letter coin (A / S / MT / CR / M). */
export function G3Letter({ k, size = "1.45em" }: { k: string; size?: string }) {
  const c = LETTERS[k];
  if (!c) return null;
  const fs = c.t.length === 1 ? 17 : 12.5;
  const id = `g3${k}`;
  return (
    <Ring size={size} title={ROLE_NAME[k]}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-label={ROLE_NAME[k]} role="img">
        <defs>
          <linearGradient id={`${id}o`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c.outer} />
            <stop offset="1" stopColor={c.bottom} />
          </linearGradient>
          <linearGradient id={`${id}i`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c.top} />
            <stop offset="1" stopColor={c.bottom} />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="20" fill={`url(#${id}o)`} />
        <circle cx="20" cy="20" r="14.5" fill={`url(#${id}i)`} stroke={c.ring} strokeWidth="1.6" />
        <text
          x="20"
          y={20 + fs * 0.36}
          textAnchor="middle"
          fontSize={fs}
          fontWeight={900}
          fill="#FFF"
          fontFamily="Arial, sans-serif"
          letterSpacing="-0.5"
          stroke="rgba(0,0,0,.25)"
          strokeWidth="1"
          style={{ paintOrder: "stroke" }}
        >
          {c.t}
        </text>
      </svg>
    </Ring>
  );
}

const failed = new Set<string>();
/** Any other badge: its uploaded picture (round) or its emoji, in the ring. */
export function G3Pic({ src, emoji, size = "1.45em" }: { src?: string; emoji: string; size?: string }) {
  const [bad, setBad] = useState(() => !!src && failed.has(src));
  return (
    <Ring size={size}>
      {src && !bad ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={emoji}
          referrerPolicy="no-referrer"
          decoding="async"
          onError={() => (failed.add(src), setBad(true))}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="g3-emo">{emoji}</span>
      )}
    </Ring>
  );
}

/** The right G3 badge for a badge emoji: a letter coin for a role, else picture / emoji. */
export function G3BadgeFor({ emoji, images, size }: { emoji: string; images?: Record<string, string>; size?: string }) {
  const k = g3LetterFor(emoji);
  if (k) return <G3Letter k={k} size={size} />;
  const src = images?.[emoji] ?? images?.[emoji.replace(/️/g, "")];
  return <G3Pic src={src} emoji={emoji} size={size} />;
}
