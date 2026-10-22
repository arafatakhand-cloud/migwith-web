"use client";

import { useId } from "react";
import type { SupporterTeam } from "../../lib/supporterTeams";
import { useSupporterImages } from "../../lib/supporterImages";

// ⚽ A little football JERSEY in the team's kit colours (solid, stripes,
// coloured sleeves, a centre band or a diagonal split) — miGlife's own drawing,
// never a club logo. Same shape in the app (SupporterColours.kt).
// 📷 When miglife uploaded a picture for the team, that shows instead.
const SHIRT = "M13 4 L4 9.5 L7.5 18 L11.5 16 V37 H28.5 V16 L32.5 18 L36 9.5 L27 4 Q24 8.5 20 8.5 Q16 8.5 13 4 Z";
const SLEEVES = "M13 4 L4 9.5 L7.5 18 L11.5 16 V9 Z M27 4 L36 9.5 L32.5 18 L28.5 16 V9 Z";

export function SupporterJersey({ team, size = 18 }: { team: SupporterTeam; size?: number }) {
  const clip = `j${useId().replace(/:/g, "")}`;
  const picture = useSupporterImages()[team.id];
  if (picture)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={picture} alt="" width={size} height={size} className="inline-block shrink-0 rounded-full object-contain align-middle" style={{ width: size, height: size }} />
    );
  const light = ["#FFFFFF", "#FDE100", "#6CABDD"].includes(team.c1.toUpperCase());
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="inline-block shrink-0 align-middle" aria-hidden>
      <defs>
        <clipPath id={clip}>
          <path d={SHIRT} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="40" height="40" fill={team.c1} />
        {team.kit === "stripes" &&
          [0, 1, 2, 3, 4].map((i) => <rect key={i} x={12 + i * 3.6 + 1.8} y="0" width="1.8" height="40" fill={team.c2} />)}
        {team.kit === "stripes" && <rect x="4" y="0" width="7.5" height="40" fill={team.c2} />}
        {team.kit === "stripes" && <rect x="28.5" y="0" width="7.5" height="40" fill={team.c2} />}
        {team.kit === "sleeves" && <path d={SLEEVES} fill={team.c2} />}
        {team.kit === "band" && <rect x="16.5" y="0" width="7" height="40" fill={team.c2} />}
        {team.kit === "diagonal" && <path d="M0 40 L40 0 L40 40 Z" fill={team.c2} />}
        {/* soft shine */}
        <path d="M11.5 16 V37 H17 V12 Z" fill="#FFFFFF" opacity="0.12" />
      </g>
      {/* collar */}
      <path d="M13 4 Q16 8.5 20 8.5 Q24 8.5 27 4" fill="none" stroke={team.c2} strokeWidth="2.2" strokeLinecap="round" />
      {/* outline (stronger on light shirts) */}
      <path d={SHIRT} fill="none" stroke={light ? "rgba(0,0,0,.45)" : "rgba(0,0,0,.28)"} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/** ⚽ The badge next to a name: the team's jersey + its short name. */
export function SupporterBadge({ team, size = 10 }: { team: SupporterTeam; size?: number }) {
  return (
    <span title={`${team.name} supporter`} className="inline-flex shrink-0 items-center gap-[2px] align-middle leading-none">
      <SupporterJersey team={team} size={size * 1.75} />
      <span className="font-black tracking-wide" style={{ fontSize: size, color: team.text }}>
        {team.short}
      </span>
    </span>
  );
}
