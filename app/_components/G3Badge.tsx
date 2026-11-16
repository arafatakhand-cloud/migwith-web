"use client";

import { useState } from "react";

// 🪙 G3 badges (miglife, 2026-11): every badge is a round coin in a silver ring
// with a soft shine. Role badges are letters — A Admin (gold) · S Staff (green) · EB Executive Board (black, gold letters) ·
// MT Mentor (red) · CR Country Representative (brown) · M Merchant (purple) — the
// same everywhere (room enter/left lines, the people list, profile, Feed). Other
// badges (Color Shop) keep their uploaded picture, else their emoji, in the ring.

type Letter = { t: string; outer: string; top: string; bottom: string; ring: string; fg?: string; glow: string };
// deep colours + a coloured glow (miglife: "আরো উজ্জ্বল", then "গাঢ়")
const LETTERS: Record<string, Letter> = {
  A: { t: "A", outer: "#FFD54F", top: "#F59E0B", bottom: "#E07B00", ring: "#FFF3B0", glow: "#FFC107" },
  S: { t: "S", outer: "#5BD96B", top: "#22A314", bottom: "#167A08", ring: "#DCFCE7", glow: "#3EE04F" },
  MT: { t: "MT", outer: "#FF6B6B", top: "#E0102A", bottom: "#B80016", ring: "#FFE0DE", glow: "#FF5252" },
  CR: { t: "CR", outer: "#D6964A", top: "#9A5A12", bottom: "#6E3E06", ring: "#F5E1C8", glow: "#E39B3C" },
  M: { t: "M", outer: "#C77DFF", top: "#8E2DC8", bottom: "#6A1B9A", ring: "#E9D5FF", glow: "#C266FF" },
  EB: { t: "EB", outer: "#4B5563", top: "#1F2937", bottom: "#0B0F19", ring: "#FFE066", fg: "#FFE066", glow: "#9CA3AF" },
};
/** role badge emoji → its letter coin */
const ROLE_LETTER: Record<string, string> = {
  "⚙️": "A", "⚙": "A",
  "🛠️": "S", "🛠": "S",
  "💼": "MT", "🎓": "MT",
  "🌍": "CR",
  "🛒": "M",
  "🏛️": "EB", "🏛": "EB",
};
export const g3LetterFor = (emoji: string): string | undefined => ROLE_LETTER[emoji] ?? ROLE_LETTER[emoji.replace(/️/g, "")];
const ROLE_NAME: Record<string, string> = { A: "Administrator", S: "Staff", MT: "Mentor", CR: "Country Representative", M: "Merchant", EB: "Executive Board" };

function Ring({ size, title, glow, children }: { size: string; title?: string; glow?: string; children: React.ReactNode }) {
  return (
    <span className="g3-badge" style={{ ["--g3" as string]: size, ...(glow ? { ["--g3glow" as string]: glow } : {}) }} title={title}>
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
    <Ring size={size} title={ROLE_NAME[k]} glow={c.glow}>
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
          fill={c.fg ?? "#FFF"}
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
