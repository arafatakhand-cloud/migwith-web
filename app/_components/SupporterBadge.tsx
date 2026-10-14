import type { SupporterTeam } from "../../lib/supporterTeams";

/** ⚽ The little team badge next to a name: a pill in the team's colours with its
 *  short name (miGlife's own design — never a club logo). */
export function SupporterBadge({ team, size = 10 }: { team: SupporterTeam; size?: number }) {
  return (
    <span
      title={`${team.name} supporter`}
      className="inline-flex shrink-0 items-center rounded-[5px] align-middle font-black leading-none tracking-wide text-white shadow-[0_1px_2px_rgba(0,0,0,.25)]"
      style={{
        fontSize: size,
        padding: `${size * 0.25}px ${size * 0.45}px`,
        background: `linear-gradient(135deg, ${team.c1} 0 55%, ${team.c2} 55% 100%)`,
        textShadow: "0 1px 1px rgba(0,0,0,.45)",
      }}
    >
      {team.short}
    </span>
  );
}
