"use client";

import { useId } from "react";
import type { SupporterTeam } from "../../lib/supporterTeams";
import { useSupporterImages } from "../../lib/supporterImages";

// ⚽ The team's CREST: a shield in the team's colours with its kit pattern
// (stripes, a band, a split …), the team's letters ("FCB", "LFC" …) in a ring
// and a small star on top — miGlife's own design, never a club logo. Same
// drawing in the app (SupporterColours.kt). 📷 When miglife uploaded a picture
// for the team, that shows instead.
const SHIELD = "M20 2 L37 7 V22 C37 33 29.5 40.5 20 44 C10.5 40.5 3 33 3 22 V7 Z";
const LIGHT_KITS = ["#FFFFFF", "#FDE100", "#6CABDD", "#12A0D7"];

export function SupporterJersey({ team, size = 18 }: { team: SupporterTeam; size?: number }) {
  const id = `c${useId().replace(/:/g, "")}`;
  const picture = useSupporterImages()[team.id];
  if (picture)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={picture} alt="" width={size} height={size} className="inline-block shrink-0 rounded-full object-contain align-middle" style={{ width: size, height: size }} />
    );
  const light = LIGHT_KITS.includes(team.c1.toUpperCase());
  const c2 = team.c2.toUpperCase() === team.c1.toUpperCase() ? "#FFFFFF" : team.c2;
  const ink = light ? team.text : "#FFFFFF";
  const rim = light ? team.text : c2.toUpperCase() === "#FFFFFF" ? "#D4AF37" : c2;
  const L = team.mark.length;
  const fs = L <= 2 ? 10.5 : L === 3 ? 8.6 : L === 4 ? 7.2 : 6.4;
  const tl = L <= 2 ? 11 : L === 3 ? 15.5 : L === 4 ? 17 : 18;
  return (
    <svg width={size} height={size} viewBox="0 0 40 46" className="inline-block shrink-0 align-middle" aria-hidden>
      <defs>
        <clipPath id={id}>
          <path d={SHIELD} />
        </clipPath>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="40" height="46" fill={team.c1} />
        {team.kit === "stripes" && [0, 1, 2, 3].map((i) => <rect key={i} x={6 + i * 8} y="0" width="4" height="46" fill={c2} />)}
        {team.kit === "sleeves" && <rect x="0" y="0" width="40" height="12" fill={c2} />}
        {team.kit === "band" && <rect x="15" y="0" width="10" height="46" fill={c2} />}
        {team.kit === "diagonal" && <path d="M0 46 L40 4 L40 46 Z" fill={c2} />}
        {team.kit === "solid" && <rect x="0" y="30" width="40" height="16" fill={c2} opacity=".95" />}
        <circle cx="20" cy="25" r="10.5" fill={light ? "#FFFFFF" : "rgba(0,0,0,.28)"} stroke={light ? team.text : "#FFFFFF"} strokeOpacity=".7" strokeWidth="1" />
        <rect width="40" height="46" fill={`url(#${id}g)`} />
      </g>
      <path d={SHIELD} fill="none" stroke={rim} strokeWidth="2.4" strokeLinejoin="round" />
      <path d={SHIELD} fill="none" stroke="#FFFFFF" strokeOpacity=".55" strokeWidth=".7" transform="translate(20 23) scale(.86) translate(-20 -23)" />
      <text
        x="20"
        y={25 + fs * 0.36}
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="900"
        fontSize={fs}
        fill={ink}
        textLength={tl}
        lengthAdjust="spacingAndGlyphs"
      >
        {team.mark}
      </text>
      <text x="20" y="11.5" textAnchor="middle" fontSize="6.5" fill="#FFD54A" stroke="rgba(0,0,0,.35)" strokeWidth=".4">
        ★
      </text>
    </svg>
  );
}

/** ⚽ The badge next to a name: the team's crest + its letters. */
export function SupporterBadge({ team, size = 10 }: { team: SupporterTeam; size?: number }) {
  return (
    <span title={`${team.name} supporter`} className="inline-flex shrink-0 items-center gap-[2px] align-middle leading-none">
      <SupporterJersey team={team} size={size * 1.75} />
      <span className="font-black tracking-wide" style={{ fontSize: size, color: team.text }}>
        {team.mark}
      </span>
    </span>
  );
}
