"use client";

import { useRouter } from "next/navigation";
import { roomHref } from "../../lib/rooms";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { LUXURY_BET_ROOM, useLuxuryBetAccess } from "../_components/LuxuryBet";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { LOWCARD_ROOM } from "../_components/LowCard";
import { CRICKET_ROOM } from "../_components/CricketGame";
import { TEEN_PATTI_ROOM } from "../_components/TeenPatti";
import { LUDO_FREE_ROOM, LUDO_ROOM } from "../_components/Ludo";
import { ROYALE_ROOM } from "../_components/RoyaleGame";
import { TN_FREE_ROOM, TN_ROOM } from "../_components/TwentyNine";
import { TRIVIA_ROOM } from "../_components/Trivia";
import { BackButton } from "../_components/BackButton";
import { PastelCard } from "../_components/LightCards";
import { ClassicListRow, ClassicTitleBar, useIsClassic } from "../_components/Classic";

// 🎮 Game List, like the app's (menu → Game List): the running games, each
// opening its official room, and what's coming soon.

const RUNNING: [string, string, string, string, string][] = [
  ["🎰", "Luxury Bet", "King · Queen · Prince · Fairy · Elf · Mermaid", "#B8860B", LUXURY_BET_ROOM],
  ["🃏", "LowCard", "Draw the lowest card, survive", "#1D9E75", LOWCARD_ROOM],
  ["🏏", "Cricket", "Bat 6 rounds, top scorer wins", "#3984D9", CRICKET_ROOM],
  ["🎴", "3 Patti", "Blind or seen — best hand wins", "#7B1FA2", TEEN_PATTI_ROOM],
  ["🎲", "Ludo", "Race 4 tokens home, 2–4 players", "#E5484D", LUDO_ROOM],
  ["🆓", "Ludo Free", "Same Ludo — no coins, play for fun", "#1E9B5A", LUDO_FREE_ROOM],
  ["👑", "MIG Royale", "Red vs Blue — bet on the better hand", "#6A3DE8", ROYALE_ROOM],
  ["🃏", "29 Card", "Twenty-Nine — 4 players, 2 teams", "#2E7D5B", TN_ROOM],
  ["🆓", "29 Card Free", "Same 29 — no coins, play for fun", "#1E9B5A", TN_FREE_ROOM],
  ["🧠", "Trivia", "Quiz in বাংলা / English — points & leaderboard", "#6A4BD8", TRIVIA_ROOM],
];

const SOON: [string, string, string][] = [
  ["⚽", "Football", "#43B65A"],
];

export default function GameListPage() {
  const ready = useRequireLogin();
  const router = useRouter();
  const { user } = useCurrentUser();
  const luxuryBetAccess = useLuxuryBetAccess(user?.uid);
  const classic = useIsClassic();
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl pb-8">
        {classic ? (
          <ClassicTitleBar title="🎮 Play Zone" subtitle="Running games" onBack={() => router.back()} />
        ) : (
          <div className="flex items-center gap-1 px-2 py-1">
            <BackButton onClick={() => router.back()} className="mr-1.5" />
            <h1 className="text-xl font-bold text-[#12335E]">🎮 Play Zone</h1>
          </div>
        )}
        {/* 🎲 Google Play: games use virtual coins only — say so where the games are. */}
        <p className="mx-3 mt-2 rounded-xl bg-[#FFF8E1] px-3 py-2 text-[12px] leading-4 text-[#7A5A00]">
          🪙 For fun only — games use free virtual coins. No real money, no cash prizes, and coins can&apos;t be sold or cashed out.
        </p>
        {/* 📟 Classic: plain list lines. */}
        {ready && classic && (
          <div>
            {RUNNING.filter(([, , , , room]) => room !== LUXURY_BET_ROOM || luxuryBetAccess.canSee).map(([icon, name, sub, color, room]) => (
              <ClassicListRow
                key={room}
                icon={icon}
                title={name}
                subtitle={sub}
                color={color}
                href={roomHref(room)}
                right={<span className="text-[11px] font-bold text-[#2E9B3A]">● LIVE</span>}
              />
            ))}
            {SOON.map(([icon, name]) => (
              <ClassicListRow key={name} icon={icon} title={name} color="#9AA3AE" right={<span className="text-[10px] font-bold text-[#8A97A8]">COMING SOON</span>} />
            ))}
          </div>
        )}
        {ready && !classic && (
          <div className="px-4 py-2.5">
            <p className="pb-2 text-xs font-bold tracking-[1.2px] text-[#6C87B0]">RUNNING GAMES</p>
            {/* 🎨 the Community page's cards, "● LIVE" where the › is */}
            <div className="space-y-2.5">
              {RUNNING.filter(([, , , , room]) => room !== LUXURY_BET_ROOM || luxuryBetAccess.canSee).map(([icon, name, sub, color, room]) => (
                <PastelCard
                  key={room}
                  icon={icon}
                  title={name}
                  subtitle={sub}
                  color={color}
                  href={roomHref(room)}
                  right={<span className="shrink-0 rounded-xl bg-[#DFF3E3] px-2.5 py-1 text-[11px] font-bold text-[#1E7A34]">● LIVE</span>}
                />
              ))}
            </div>
            <p className="pb-2 pt-4 text-xs font-bold tracking-[1.2px] text-[#6C87B0]">COMING SOON</p>
            <div className="space-y-2.5 opacity-60">
              {SOON.map(([icon, name, color]) => (
                <PastelCard
                  key={name}
                  icon={icon}
                  title={name}
                  subtitle="Coming soon"
                  color={color}
                  right={<span className="shrink-0 rounded-xl bg-[#E4E8EF] px-2.5 py-1 text-[10px] font-bold text-[#6C7787]">COMING SOON</span>}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </PageShell>
  );
}
