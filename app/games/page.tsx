"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { roomHref } from "../../lib/rooms";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { LUXURY_ROOM } from "../_components/LuxuryBot";
import { LUXURY_BET_ROOM, useLuxuryBetAccess } from "../_components/LuxuryBet";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { LOWCARD_ROOM } from "../_components/LowCard";
import { CRICKET_ROOM } from "../_components/CricketGame";
import { TEEN_PATTI_ROOM } from "../_components/TeenPatti";
import { LUDO_ROOM } from "../_components/Ludo";
import { ROYALE_ROOM } from "../_components/RoyaleGame";
import { TN_ROOM } from "../_components/TwentyNine";
import { BackButton } from "../_components/BackButton";

// 🎮 Game List, like the app's (menu → Game List): the running games, each
// opening its official room, and what's coming soon.

const RUNNING: [string, string, string, string, string][] = [
  ["💎", "Luxury Bot", "Live betting game", "#D62F72", LUXURY_ROOM],
  ["🎰", "Luxury Bet", "King, Queen, Jax, Max, Toto, Zozo", "#B8860B", LUXURY_BET_ROOM],
  ["🃏", "LowCard", "Draw the lowest card, survive", "#1D9E75", LOWCARD_ROOM],
  ["🏏", "Cricket", "Bat 6 rounds, top scorer wins", "#3984D9", CRICKET_ROOM],
  ["🎴", "3 Patti", "Blind or seen — best hand wins", "#7B1FA2", TEEN_PATTI_ROOM],
  ["🎲", "Ludo", "Race 4 tokens home, 2–4 players", "#E5484D", LUDO_ROOM],
  ["👑", "MIG Royale", "Red vs Blue — bet on the better hand", "#6A3DE8", ROYALE_ROOM],
  ["🃏", "29", "Twenty-Nine — 4 players, 2 teams", "#2E7D5B", TN_ROOM],
];

const SOON: [string, string, string][] = [
  ["⚽", "Football", "#43B65A"],
  ["🃏", "29 Card", "#7B1FB8"],
];

export default function GameListPage() {
  const ready = useRequireLogin();
  const router = useRouter();
  const { user } = useCurrentUser();
  const luxuryBetAccess = useLuxuryBetAccess(user?.uid);
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl pb-8">
        <div className="flex items-center gap-1 px-2 py-1">
          <BackButton onClick={() => router.back()} className="mr-1.5" />
          <h1 className="text-xl font-bold text-[#12335E]">🎮 Game List</h1>
        </div>
        {ready && (
          <div className="px-4 py-2.5">
            <p className="pb-2 text-xs font-bold tracking-[1.2px] text-[#6C87B0]">RUNNING GAMES</p>
            {RUNNING.filter(([, , , , room]) => room !== LUXURY_BET_ROOM || luxuryBetAccess.canSee).map(([icon, name, sub, color, room]) => (
              <Link
                key={room}
                href={roomHref(room)}
                className="mb-2.5 flex items-center gap-3.5 rounded-[18px] border border-[#C3D9F5] bg-[#EAF2FC] p-3.5 shadow-[0_4px_10px_rgba(143,168,204,.45)]"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-2xl" style={{ background: color }}>
                  {icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-bold text-[#12335E]">{name}</span>
                  <span className="block text-xs text-[#6C87B0]">{sub}</span>
                </span>
                <span className="rounded-xl bg-[#DFF3E3] px-2.5 py-1 text-[11px] font-bold text-[#1E7A34]">● LIVE</span>
              </Link>
            ))}
            <p className="pb-2 pt-2.5 text-xs font-bold tracking-[1.2px] text-[#6C87B0]">COMING SOON</p>
            {SOON.map(([icon, name, color]) => (
              <div key={name} className="mb-2.5 flex items-center gap-3.5 rounded-[18px] border border-[#DDE3EF] bg-[#F0F3F8] p-3.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-2xl" style={{ background: `${color}59` }}>
                  <span className="opacity-60">{icon}</span>
                </span>
                <span className="flex-1 text-[17px] font-bold text-[#6C7787]">{name}</span>
                <span className="rounded-xl bg-[#E4E8EF] px-2.5 py-1 text-[10px] font-bold text-[#6C7787]">COMING SOON</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}
