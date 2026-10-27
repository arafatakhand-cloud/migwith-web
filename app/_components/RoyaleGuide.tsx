"use client";

// ▶ MIG Royale guide: a little "video" made of 13 animated scenes in 4 chapters,
// with a player bar (play/pause, previous/next, replay, 2x, captions, seek).
// Everything is drawn with HTML — no video file to download.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MiniCard } from "./Cards";

type Scene = { ch: number; title: string; cap: string; desc: string; len: number; draw: (t: number) => ReactNode };

const CHAPTERS = ["Join a round", "Bets & multipliers", "Reveal & payouts", "Roadmap", "Fair play"];

/* ---------- small pieces ---------- */
function Back({ xs }: { xs?: boolean }) {
  return (
    <span
      className={`inline-block rounded-md border-2 border-amber-200/70 shadow ${xs ? "h-7 w-5" : "h-9 w-7"}`}
      style={{ background: "repeating-linear-gradient(45deg,#5B3FC9 0 4px,#6E54DA 4px 8px)" }}
    />
  );
}
function Cards({ cards, shown = 3, xs, glow }: { cards: string[]; shown?: number; xs?: boolean; glow?: boolean }) {
  return (
    <span className={`inline-flex gap-0.5 rounded-lg p-0.5 transition ${glow ? "bg-amber-300/90 shadow-[0_0_14px_rgba(252,211,77,.7)]" : ""}`}>
      {cards.map((c, i) =>
        i < shown ? (
          <span key={`f${i}`} className="fx-pop inline-block">
            <MiniCard card={c} size={xs ? "xs" : "sm"} />
          </span>
        ) : (
          <Back key={`b${i}`} xs={xs} />
        )
      )}
    </span>
  );
}
function Pill({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "red" | "blue" | "dim" | "green" }) {
  const c = {
    gold: "bg-amber-300 text-[#3A2500]",
    red: "bg-red-500 text-white",
    blue: "bg-blue-500 text-white",
    dim: "bg-white/10 text-[#DCE3FF]",
    green: "bg-green-500 text-white",
  }[tone];
  return <span className={`inline-block rounded-full px-2 py-[1px] text-[9.5px] font-black ${c}`}>{children}</span>;
}
function Bubble({ who, text, bot, right }: { who: string; text: string; bot?: boolean; right?: boolean }) {
  return (
    <div className={`royale-tick max-w-[78%] rounded-[10px] px-2 py-1 text-[10px] leading-snug shadow ${right ? "ml-auto" : ""} ${bot ? "bg-[#FFF6DA] text-[#3A2500]" : "bg-white text-[#14183A]"}`}>
      <span className={`block text-[8.5px] font-black ${bot ? "text-amber-700" : "text-violet-600"}`}>{who}</span>
      <span className="font-bold">{text}</span>
    </div>
  );
}
function Avatar({ l, c, label }: { l: string; c: string; label: string }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-white/80 text-[11px] font-black text-white shadow" style={{ background: c }}>
        {l}
      </span>
      <span className="text-[8.5px] font-bold text-[#C9D2F2]">{label}</span>
    </span>
  );
}
function Side({ red, children, win, lose, label }: { red: boolean; children?: ReactNode; win?: boolean; lose?: boolean; label?: string }) {
  return (
    <div
      className={`relative flex min-h-[76px] flex-1 flex-col items-center justify-center rounded-[12px] border-2 px-1 py-1.5 transition duration-500 ${win ? "scale-[1.04]" : ""} ${lose ? "opacity-50" : ""}`}
      style={{
        background: red ? "rgba(239,68,68,.15)" : "rgba(59,130,246,.17)",
        borderColor: win ? "#FCD34D" : red ? "rgba(239,68,68,.5)" : "rgba(59,130,246,.5)",
        boxShadow: win ? "0 0 18px rgba(252,211,77,.5)" : undefined,
      }}
    >
      <span className={`mb-1 text-[10px] font-black ${red ? "text-[#FF9C9C]" : "text-[#9DC4FF]"}`}>{label ?? (red ? "🔴 Red · 1.9x" : "🔵 Blue · 1.9x")}</span>
      {children}
    </div>
  );
}
function Chip({ v, on }: { v: string; on?: boolean }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black transition ${on ? "scale-110 border-amber-200 bg-[#F5C842] text-[#3A2500] shadow-[0_0_10px_rgba(245,200,66,.6)]" : "border-white/15 bg-white/5 text-[#DCE3FF]"}`}>
      {v}
    </span>
  );
}
const Finger = ({ className = "" }: { className?: string }) => <span className={`pointer-events-none absolute animate-bounce text-[18px] ${className}`}>👆</span>;
function Ring({ s, hot }: { s: number | string; hot?: boolean }) {
  return (
    <span className={`grid h-8 w-8 place-items-center rounded-full border-[3px] text-[11px] font-black ${hot ? "border-red-400 text-red-300" : "border-amber-300 text-amber-200"}`}>{s}</span>
  );
}
const Ico = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
    <path d={d} />
  </svg>
);
const PREV = "M6 5h2v14H6zM20 5v14L9 12z";
const NEXT = "M16 5h2v14h-2zM4 5v14l11-7z";
const REPLAY = "M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z";
const at = (t: number, ms: number) => t >= ms;
const count = (t: number, list: number[]) => list.filter((x) => t >= x).length;
function Confetti() {
  const colors = ["#FCD34D", "#F472B6", "#60A5FA", "#34D399", "#F87171", "#A78BFA"];
  return (
    <span className="pointer-events-none absolute inset-x-0 top-0 h-0" aria-hidden>
      {Array.from({ length: 22 }, (_, i) => (
        <i
          key={i}
          className="royale-confetti absolute block h-[6px] w-[4px] rounded-[1px]"
          style={{ left: `${4 + ((i * 47) % 92)}%`, background: colors[i % colors.length], animationDelay: `${(i % 7) * 0.06}s`, ["--dx" as string]: `${((i * 37) % 40) - 20}px` }}
        />
      ))}
    </span>
  );
}

/* ---------- the 13 scenes ---------- */
const RED_RUN = ["4♠", "5♥", "6♦"];
const BLUE_COLOR = ["2♣", "9♣", "J♣"];

const SCENES: Scene[] = [
  {
    ch: 0,
    title: "Red vs Blue",
    cap: "Two 3-card hands. Bet on the winner — or on its hand.",
    desc: "MIG Royale is a round run by the bot. Two Teen Patti hands, Red and Blue, are dealt from one shuffled deck after betting closes. Back a side, or the type of hand the winner holds — rarer hands pay more.",
    len: 6500,
    draw: (t) => {
      const r = count(t, [1600, 2300, 3000]);
      const b = count(t, [1950, 2650, 3400]);
      const done = at(t, 4000);
      return (
        <>
          <p className="royale-tick text-center text-[15px] font-black tracking-wide text-amber-200">👑 MIG Royale</p>
          <div className="mt-2 flex gap-2">
            <Side red win={done} lose={false}>
              {at(t, 400) && <Cards cards={RED_RUN} shown={r} glow={done} />}
              <span className="mt-1 h-3.5">{r === 3 && <Pill tone="red">Run</Pill>}</span>
            </Side>
            <Side red={false} lose={done}>
              {at(t, 700) && <Cards cards={BLUE_COLOR} shown={b} />}
              <span className="mt-1 h-3.5">{b === 3 && <Pill tone="blue">Color</Pill>}</span>
            </Side>
          </div>
          {done && <p className="royale-tick mt-2 text-center text-[13px] font-black text-amber-300">🏆 Red wins with Run</p>}
        </>
      );
    },
  },
  {
    ch: 0,
    title: "Open a round",
    cap: "Type !start or tap Start. Opening a round is free.",
    desc: "In the 👑 MIG Royale Official room anyone can open a round with !start or the Start button. Nobody is charged for opening it — you only pay for your own bets. The bot posts the options and a 45-second timer.",
    len: 5500,
    draw: (t) => (
      <div className="flex h-full flex-col justify-end gap-1.5">
        {at(t, 500) && <Bubble who="You" text="!start" right />}
        {at(t, 1600) && <Bubble who="MIG Royale Bot" bot text="MIG Royale started! Red vs Blue. Type !bet [option] [amount] (e.g. !bet red 500). [45 seconds]" />}
        {at(t, 2600) && (
          <div className="royale-tick flex items-center justify-center gap-2 pt-1">
            <Ring s={45 - Math.min(5, Math.floor((t - 2600) / 600))} />
            <span className="text-[11px] font-black text-green-300">● Bets open</span>
          </div>
        )}
      </div>
    ),
  },
  {
    ch: 0,
    title: "The betting window",
    cap: "Everyone bets in the same 45 seconds — as often as they like.",
    desc: "Betting stays open for 45 seconds. Bet with !bet <option> <amount> in chat, or from the game box. You can place several bets on several options; the totals on each side update live for everyone.",
    len: 6500,
    draw: (t) => {
      const red = (at(t, 1200) ? 500 : 0) + (at(t, 3600) ? 1000 : 0);
      const blue = at(t, 2400) ? 2000 : 0;
      const k = (n: number) => (n >= 1000 ? `${n / 1000}K` : String(n));
      return (
        <>
          <div className="flex items-center gap-2">
            <Side red label="🔴 Red · 1.9x">
              <span className="text-[14px] font-black text-white">{red ? `🪙 ${k(red)}` : "—"}</span>
            </Side>
            <Ring s={45 - Math.floor(t / 600)} />
            <Side red={false} label="🔵 Blue · 1.9x">
              <span className="text-[14px] font-black text-white">{blue ? `🪙 ${k(blue)}` : "—"}</span>
            </Side>
          </div>
          <div className="mt-2 grid grid-cols-3 items-end gap-1">
            <div className="flex flex-col items-center gap-1">
              <span className="h-5">{at(t, 1000) && <span className="royale-tick block rounded-md bg-white px-1.5 py-0.5 text-[9px] font-bold text-[#14183A]">!bet red 500</span>}</span>
              <Avatar l="M" c="#22B8CF" label="Mina" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="h-5">{at(t, 2200) && <span className="royale-tick block rounded-md bg-white px-1.5 py-0.5 text-[9px] font-bold text-[#14183A]">!bet blue 2000</span>}</span>
              <Avatar l="A" c="#F59E0B" label="Arjun" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="h-5">{at(t, 3400) && <span className="royale-tick block rounded-md bg-white px-1.5 py-0.5 text-[9px] font-bold text-[#14183A]">!bet red 1000</span>}</span>
              <Avatar l="Y" c="#7C3AED" label="You" />
            </div>
          </div>
        </>
      );
    },
  },
  {
    ch: 1,
    title: "Red or Blue — 1.9x",
    cap: "Back a side. If it wins you get 1.9x your bet back.",
    desc: "A side bet wins when that colour's hand is stronger. Payouts include your stake: 1,000 on Red returns 1,900 when Red wins. Bets on the other side lose. If both hands are exactly equal it's a tie and Red/Blue bets come back.",
    len: 6500,
    draw: (t) => {
      const win = at(t, 2600);
      return (
        <>
          <div className="flex gap-2">
            <Side red win={win}>
              {at(t, 900) && <span className="royale-tick text-[16px] font-black text-white">🪙 1K</span>}
              {win && <span className="royale-tick mt-0.5 text-[11px] font-black text-amber-300">Red wins</span>}
            </Side>
            <Side red={false} lose={win}>
              {win && <span className="royale-tick text-[10px] font-bold text-[#C9D2F2]">Blue bets lose</span>}
            </Side>
          </div>
          {at(t, 3400) && (
            <div className="relative mt-2 text-center">
              {at(t, 3600) && <Confetti />}
              <p className="royale-tick text-[18px] font-black text-amber-300">🪙 1,900</p>
              <p className="royale-tick text-[10.5px] font-bold text-[#DCE3FF]">1,000 on Red returns 1,900 — stake included</p>
            </div>
          )}
        </>
      );
    },
  },
  {
    ch: 1,
    title: "Bet on the winning hand",
    cap: "Name the winner's hand type. Rarer hands pay more.",
    desc: "Instead of a colour you can bet on what the WINNING hand will be: Jutt (pair) 2.5x, Color (flush) 10x, Run (sequence) 15x, Double Run (pure sequence) 100x or Tirel (three of a kind) 150x. No side needed. High Card can't be bet on.",
    len: 6500,
    draw: (t) => {
      const rows: [string, string, string][] = [
        ["Tirel · three alike", "150x", "0.5%"],
        ["Double Run · pure seq.", "100x", "0.4%"],
        ["Run · sequence", "15x", "6%"],
        ["Color · same suit", "10x", "9%"],
        ["Jutt · pair", "2.5x", "28%"],
      ];
      return (
        <div className="rounded-[12px] bg-gradient-to-b from-[#FFF4D6] to-[#F5E2B0] p-2 text-[#3A2500] shadow-inner">
          <p className="text-center text-[12px] font-black">✋ Hand bets</p>
          <div className="mt-1 space-y-0.5">
            {rows.map(([n, x, p], i) =>
              at(t, 400 + i * 450) ? (
                <div key={n} className="royale-tick flex items-center rounded-md bg-white/70 px-2 py-[3px] text-[10.5px] font-bold">
                  <span className="flex-1">{n}</span>
                  <span className="w-9 text-right text-[9px] text-amber-800/70">{p}</span>
                  <span className="w-11 text-right font-black text-violet-700">{x}</span>
                </div>
              ) : (
                <div key={n} className="h-[22px]" />
              )
            )}
          </div>
          {at(t, 3200) && <p className="royale-tick mt-1 text-center text-[9.5px] font-bold text-amber-900/80">% = how often the winner has it · High Card: no bet</p>}
        </div>
      );
    },
  },
  {
    ch: 1,
    title: "Hand ranking",
    cap: "Tirel › Double Run › Run › Color › Jutt › High Card",
    desc: "From strongest to weakest: Tirel (three of a kind), Double Run (a sequence in one suit), Run (any sequence), Color (same suit), Jutt (a pair) and High Card.",
    len: 7500,
    draw: (t) => {
      const hands: [string[], string][] = [
        [["K♠", "K♥", "K♦"], "1 · Tirel"],
        [["10♥", "J♥", "Q♥"], "2 · Double Run"],
        [["7♣", "8♦", "9♠"], "3 · Run"],
        [["2♦", "8♦", "J♦"], "4 · Color"],
        [["5♠", "5♥", "K♣"], "5 · Jutt"],
        [["3♣", "9♦", "Q♠"], "6 · High Card"],
      ];
      return (
        <>
          <p className="text-center"><Pill tone="gold">Strongest → weakest</Pill></p>
          <div className="mt-1.5 grid grid-cols-3 gap-x-1 gap-y-1.5">
            {hands.map(([c, n], i) => (
              <div key={n} className="flex flex-col items-center">
                <Cards cards={c} xs shown={at(t, 300 + i * 700) ? 3 : 0} />
                <span className={`mt-0.5 text-[9px] font-black ${at(t, 300 + i * 700) ? "text-amber-200" : "text-transparent"}`}>{n}</span>
              </div>
            ))}
          </div>
        </>
      );
    },
  },
  {
    ch: 1,
    title: "Only the winner's hand counts",
    cap: "A hand bet pays only when the WINNING side holds that hand.",
    desc: "Here Blue holds a Color but Red's Run is stronger, so Red wins with Run. Run bets pay 15x; Color bets lose — even though a Color was on the table.",
    len: 6500,
    draw: (t) => {
      const done = at(t, 1800);
      return (
        <>
          <div className="flex gap-2">
            <Side red label="🔴 Red · Run" win={done}>
              <Cards cards={RED_RUN} glow={done} />
            </Side>
            <Side red={false} label="🔵 Blue · Color" lose={done}>
              <Cards cards={BLUE_COLOR} />
            </Side>
          </div>
          {done && <p className="royale-tick mt-1.5 text-center text-[12.5px] font-black text-amber-300">Red wins with Run</p>}
          <div className="mt-1 flex justify-center gap-2">
            {at(t, 2800) && <span className="royale-tick text-[11px] font-black text-green-400">✔ Run bets: paid 15x</span>}
            {at(t, 3500) && <span className="royale-tick text-[11px] font-black text-red-400">✘ Color bets: lose</span>}
          </div>
        </>
      );
    },
  },
  {
    ch: 1,
    title: "Bet from the game box",
    cap: "Tap a tile, pick an amount, tap Bet. Double-tap bets at once.",
    desc: "Every tile shows its multiplier and how much is on it. Tap a tile, choose a chip (or ✎ to type your own amount), then tap Bet — the box sends the same !bet line for you. ⭐ My usual saves your favourite mix.",
    len: 7500,
    draw: (t) => {
      const tiles: [string, string, string][] = [
        ["Red", "1.9x", "red"],
        ["Blue", "1.9x", "blue"],
        ["Jutt", "2.5x", ""],
        ["Color", "10x", ""],
        ["Run", "15x", ""],
        ["D.Run", "100x", ""],
        ["Tirel", "150x", ""],
      ];
      const pickRun = at(t, 1200);
      const pickChip = at(t, 2600);
      const sent = at(t, 4200);
      return (
        <div className="relative">
          <div className="grid grid-cols-4 gap-1">
            {tiles.map(([n, x, c]) => {
              const on = n === "Run" && pickRun;
              return (
                <span
                  key={n}
                  className={`flex flex-col items-center rounded-[9px] border py-1 text-[10px] font-black transition ${
                    on
                      ? "scale-105 border-amber-300 bg-amber-300/20 text-amber-200 shadow-[0_0_10px_rgba(252,211,77,.5)]"
                      : c === "red"
                        ? "border-red-400/50 bg-red-500/15 text-[#FF9C9C]"
                        : c === "blue"
                          ? "border-blue-400/50 bg-blue-500/15 text-[#9DC4FF]"
                          : "border-white/10 bg-white/5 text-[#DCE3FF]"
                  }`}
                >
                  {n}
                  <span className="text-[8.5px] opacity-80">{x}</span>
                  {n === "Run" && sent && <span className="royale-tick text-[8.5px] text-amber-300">🪙 1K</span>}
                </span>
              );
            })}
            <span className="flex items-center justify-center rounded-[9px] border border-amber-300/40 bg-amber-300/10 text-[9.5px] font-black text-amber-200">⭐ Usual</span>
          </div>
          <div className="mt-1.5 flex justify-center gap-1">
            <Chip v="500" />
            <Chip v="1K" on={pickChip} />
            <Chip v="2K" />
            <Chip v="5K" />
            <Chip v="✎" />
          </div>
          <div className="mt-1.5 flex justify-center">
            <span className={`rounded-full px-4 py-1 text-[11px] font-black transition ${pickChip ? "bg-gradient-to-r from-amber-300 to-amber-500 text-[#3A2500]" : "bg-white/10 text-white/40"}`}>
              {sent ? "✓ Bet placed" : pickChip ? "Bet 1,000 on Run" : "Bet"}
            </span>
          </div>
          {t > 600 && t < 1400 && <Finger className="left-[64%] top-[6px]" />}
          {t > 2000 && t < 2800 && <Finger className="left-[37%] top-[60px]" />}
          {t > 3400 && t < 4300 && <Finger className="left-[52%] top-[86px]" />}
        </div>
      );
    },
  },
  {
    ch: 1,
    title: "Bet limits",
    cap: "100 – 200,000 per option a round · biggest win 5,000,000.",
    desc: "Each bet must be at least 100. You can put up to 200,000 on one option in a round (several options are fine), and your balance must cover every bet. The most one player can win in a round is 5,000,000.",
    len: 6500,
    draw: (t) => (
      <>
        <div className="rounded-[12px] bg-gradient-to-b from-[#FFF4D6] to-[#F5E2B0] p-2 text-center text-[#3A2500]">
          <p className="text-[12px] font-black">📏 Limits</p>
          {at(t, 300) && <p className="royale-tick text-[10.5px] font-bold">Each bet: 100 – 200,000 per option</p>}
          {at(t, 900) && <p className="royale-tick text-[10.5px] font-bold">Biggest win: 5,000,000 a round</p>}
          {at(t, 1500) && <p className="royale-tick text-[10.5px] font-bold">Your balance must cover every bet</p>}
        </div>
        <div className="mt-1.5 flex flex-col gap-1">
          {at(t, 2400) && <Bubble who="You" text="!bet tirel 300000" right />}
          {at(t, 3400) && <Bubble who="MIG Royale Bot" bot text="Max 200,000 on one option per round." />}
        </div>
      </>
    ),
  },
  {
    ch: 2,
    title: "The reveal",
    cap: "Betting closes, then the cards open: Red first, then Blue.",
    desc: "When the 45 seconds end the box shows NO MORE BETS and the bot deals both hands face down. Red's three cards open, then Blue's. You can drag Blue's last card up to peek at it yourself. Everyone in the room sees the same result.",
    len: 7500,
    draw: (t) => {
      const r = count(t, [1900, 2400, 2900]);
      const b = count(t, [3500, 4000, 4900]);
      const done = at(t, 5400);
      const red = ["7♠", "8♥", "9♦"];
      const blue = ["K♥", "K♣", "4♦"];
      return (
        <div className="relative">
          {t < 1400 ? (
            <div className="royale-stamp grid h-[120px] place-items-center text-[20px] font-black tracking-[1px] text-amber-300">NO MORE BETS</div>
          ) : (
            <>
              <p className="royale-tick text-center text-[11.5px] font-black text-[#C9D2F2]">{done ? "🏆 Red wins with Run" : b > 0 ? "Revealing Blue…" : "Revealing Red…"}</p>
              <div className="mt-1 flex gap-2">
                <Side red win={done}>
                  <Cards cards={red} shown={r} glow={done} />
                  <span className="mt-1 h-3.5">{r === 3 && <Pill tone="red">Run</Pill>}</span>
                </Side>
                <Side red={false} lose={done}>
                  <span className="relative">
                    <Cards cards={blue} shown={b} />
                    {t > 4300 && t < 4900 && <Finger className="-bottom-5 right-0" />}
                  </span>
                  <span className="mt-1 h-3.5">{b === 3 && <Pill tone="blue">Jutt</Pill>}</span>
                </Side>
              </div>
            </>
          )}
        </div>
      );
    },
  },
  {
    ch: 2,
    title: "Getting paid",
    cap: "Winning bets pay their multiplier, stake included.",
    desc: "Every winning bet pays its multiplier with the stake included the moment the round settles. All your wins arrive as one credit, and the result card shows what you won, the top winner and the total paid out.",
    len: 6500,
    draw: (t) => {
      const rows: [string, string, boolean][] = [
        ["🔴 Red 1,000", "+1,900", true],
        ["✋ Run 200", "+3,000", true],
        ["🔵 Blue 500", "lost", false],
      ];
      return (
        <div className="relative">
          <p className="text-center"><Pill tone="dim">Your bets this round</Pill></p>
          <div className="mx-auto mt-1 w-[88%] space-y-0.5 rounded-[10px] bg-white/95 p-1.5 text-[10.5px] font-bold text-[#14183A]">
            {rows.map(([a, b, w], i) => (
              <div key={a} className="flex">
                <span className="flex-1">{a}</span>
                {at(t, 600 + i * 500) && <span className={`royale-tick font-black ${w ? "text-green-600" : "text-red-500"}`}>{b}</span>}
              </div>
            ))}
          </div>
          {at(t, 2400) && (
            <div className="relative mt-2 text-center">
              <Confetti />
              <span className="royale-tick inline-block rounded-[12px] bg-gradient-to-r from-amber-300 to-amber-500 px-3 py-1 text-[12px] font-black text-[#3A2500] shadow-[0_0_14px_rgba(252,211,77,.5)]">
                🏆 You won 3,200 coins
                <span className="block text-[9.5px] font-bold">4,900 back on 1,700</span>
              </span>
            </div>
          )}
        </div>
      );
    },
  },
  {
    ch: 2,
    title: "Same hand type? Higher cards win",
    cap: "Equal hand types are decided by their cards.",
    desc: "If both hands are the same type, the higher cards decide: the bigger pair, then the third card; the higher run; the highest card, then the next. Only when both hands are exactly equal is it a tie — Red and Blue bets come back, and hand bets on that hand still win.",
    len: 7000,
    draw: (t) => {
      const done = at(t, 3600);
      return (
        <>
          <div className="flex gap-2">
            <Side red label="🔴 Red · Jutt" win={done}>
              <Cards cards={["9♠", "9♥", "K♣"]} glow={done} />
            </Side>
            <Side red={false} label="🔵 Blue · Jutt" lose={done}>
              <Cards cards={["9♦", "9♣", "Q♥"]} />
            </Side>
          </div>
          <div className="mt-1.5 text-center">
            {at(t, 1200) && <p className="royale-tick text-[11px] font-bold text-[#DCE3FF]">Both hold a pair of 9s…</p>}
            {at(t, 2400) && <p className="royale-tick text-[11px] font-bold text-[#DCE3FF]">…so the third card decides: K beats Q</p>}
            {done && <p className="royale-tick text-[13px] font-black text-amber-300">Red wins with Jutt</p>}
          </div>
        </>
      );
    },
  },
  {
    ch: 3,
    title: "The road",
    cap: "Recent winners at a glance — newest on the right.",
    desc: "The road in the game box shows this room's recent results as red and blue beads (grey for a tie). A letter marks a round won by a big hand: J Jutt, C Color, R Run, D Double Run, T Tirel. It's only a record — every round is dealt fresh, so history can't predict the next one.",
    len: 6500,
    draw: (t) => {
      const beads: [string, string][] = [
        ["blue", ""], ["red", "J"], ["red", ""], ["blue", "C"], ["red", ""], ["tie", ""], ["blue", ""], ["red", "R"], ["red", "J"],
      ];
      const n = Math.min(beads.length, 1 + Math.floor(t / 350));
      const reds = beads.slice(0, n).filter((b) => b[0] === "red").length;
      const blues = beads.slice(0, n).filter((b) => b[0] === "blue").length;
      return (
        <>
          <p className="text-center text-[12.5px] font-black text-amber-200">🛣 Last rounds</p>
          <div className="mt-2 flex justify-center gap-1">
            {beads.slice(0, n).map(([c, l], i) => (
              <span
                key={i}
                className={`fx-pop grid h-[18px] w-[18px] place-items-center rounded-full text-[9px] font-black text-white ${i === n - 1 && n === beads.length ? "ring-2 ring-amber-300" : ""}`}
                style={{ background: c === "red" ? "#EF4444" : c === "blue" ? "#3B82F6" : "#9E9E9E" }}
              >
                {l}
              </span>
            ))}
          </div>
          {n === beads.length && (
            <div className="royale-tick mt-1 flex justify-end pr-6">
              <Pill tone="gold">↑ just finished</Pill>
            </div>
          )}
          <p className="mt-1.5 text-center text-[11px] font-black text-[#DCE3FF]">
            <span className="text-[#FF9C9C]">Red {reds}</span> · <span className="text-[#9DC4FF]">Blue {blues}</span>
          </p>
          {at(t, 3800) && <p className="royale-tick mt-1 text-center text-[10px] font-bold text-[#9BA6D6]">History can't predict the next round</p>}
        </>
      );
    },
  },
  {
    ch: 4,
    title: "Sealed before you bet",
    cap: "The deal is fixed — and published as a hash — before the first bet.",
    desc: "At !start the bot locks a secret seed and posts its SHA-256 hash. After betting, a deck shuffled from that seed deals both hands, and the seed is revealed with the result. Tap the green 🔒 on the result (or ⋯ → Verify last round): it checks the hash and rebuilds the exact cards.",
    len: 8000,
    draw: (t) => {
      const steps = ["The seed's hash is posted at !start", "Both hands come from that seed", "The seed is revealed with the result"];
      const tap = t > 3600 && t < 4300;
      const ok = at(t, 4300);
      return (
        <div className="relative rounded-[12px] bg-white/95 p-2 text-[#14183A]">
          <p className="text-center text-[12.5px] font-black">🔒 Provably fair</p>
          <ol className="mt-1 space-y-0.5 text-[10.5px] font-bold">
            {steps.map((x, k) =>
              at(t, 300 + k * 800) ? (
                <li key={x} className="royale-tick">
                  {k + 1}. {x}
                </li>
              ) : (
                <li key={x} className="h-[15px]" />
              )
            )}
          </ol>
          {at(t, 2800) && (
            <div className="royale-tick mt-1.5 flex flex-col items-center">
              <span className={`rounded-full border-2 px-3 py-0.5 text-[10.5px] font-black transition ${tap || ok ? "border-amber-400 bg-amber-100 shadow-[0_0_10px_rgba(245,158,11,.5)]" : "border-[#14183A]/20 bg-white"}`}>
                Verify this deal
              </span>
              {ok && <span className="royale-tick mt-1 text-[13px] font-black text-green-600">Hash ✓ · cards rebuilt ✓</span>}
            </div>
          )}
          {tap && <Finger className="bottom-2 left-[56%]" />}
        </div>
      );
    },
  },
];

const STARTS = SCENES.reduce<number[]>((a, s, i) => (a.push(i ? a[i - 1] + SCENES[i - 1].len : 0), a), []);
const TOTAL = STARTS[STARTS.length - 1] + SCENES[SCENES.length - 1].len;
const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function RoyaleGuide() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [cc, setCc] = useState(true);
  const barRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const ended = t >= TOTAL;

  useEffect(() => {
    if (!playing) return;
    let last = Date.now();
    const id = setInterval(() => {
      const n = Date.now();
      const dt = (n - last) * speed;
      last = n;
      setT((v) => {
        const nv = Math.min(TOTAL, v + dt);
        if (nv >= TOTAL) setPlaying(false);
        return nv;
      });
    }, 80);
    return () => clearInterval(id);
  }, [playing, speed]);

  let i = STARTS.findIndex((s, k) => t >= s && (k === SCENES.length - 1 || t < STARTS[k + 1]));
  if (i < 0) i = SCENES.length - 1;
  const sc = SCENES[i];
  const st = Math.min(sc.len, t - STARTS[i]);

  // keep the active chapter chip in view
  useEffect(() => {
    const el = chipsRef.current?.querySelector<HTMLElement>(`[data-ch="${sc.ch}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [sc.ch]);

  const go = (ms: number) => {
    setT(Math.max(0, Math.min(TOTAL - 1, ms)));
  };
  const seek = (clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r) return;
    go(((clientX - r.left) / r.width) * TOTAL);
  };
  const btn = "grid h-8 w-8 place-items-center rounded-full text-[14px] text-[#DCE3FF] hover:bg-white/10";

  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      {/* 🎬 the stage */}
      <div
        className="relative h-[214px] overflow-hidden rounded-[16px] border border-amber-300/30 p-2.5 shadow-[0_10px_30px_rgba(0,0,0,.45)]"
        style={{ background: "radial-gradient(120% 90% at 50% 0%, #2B1D63 0%, #14103A 55%, #0A0820 100%)" }}
        onClick={() => (ended ? (setT(0), setPlaying(true)) : setPlaying((p) => !p))}
      >
        <span className="pointer-events-none absolute -right-4 -top-6 select-none text-[90px] opacity-[0.05]">👑</span>
        <div key={i} className="relative h-[calc(100%-30px)]">
          {sc.draw(st)}
        </div>
        {cc && (
          <p key={`c${i}`} className="royale-tick absolute inset-x-2 bottom-2 rounded-[8px] bg-black/60 px-2 py-1 text-center text-[10.5px] font-bold leading-snug text-white backdrop-blur">
            {sc.cap}
          </p>
        )}
        {!playing && (
          <span className="absolute inset-0 grid place-items-center bg-black/25">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-amber-300/90 text-[20px] text-[#3A2500] shadow-lg">{ended ? "↺" : "▶"}</span>
          </span>
        )}
      </div>

      {/* ⏯ player bar */}
      <div
        ref={barRef}
        className="relative mt-2 h-2 cursor-pointer rounded-full bg-white/10"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          seek(e.clientX);
        }}
        onPointerMove={(e) => e.buttons && seek(e.clientX)}
      >
        {STARTS.slice(1).map((s) => (
          <span key={s} className="absolute top-0 h-2 w-[2px] bg-[#0D1128]" style={{ left: `${(s / TOTAL) * 100}%` }} />
        ))}
        <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-400 to-amber-200" style={{ width: `${(t / TOTAL) * 100}%` }} />
        <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-300 shadow" style={{ left: `${(t / TOTAL) * 100}%` }} />
      </div>
      <div className="mt-0.5 flex justify-between text-[9.5px] font-bold text-[#9BA6D6]">
        <span>{mmss(t)}</span>
        <span>{mmss(TOTAL)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between">
        <button type="button" className={btn} aria-label="Replay scene" onClick={() => (go(STARTS[i]), setPlaying(true))}><Ico d={REPLAY} /></button>
        <button type="button" className={btn} aria-label="Previous scene" onClick={() => go(STARTS[Math.max(0, st < 1200 ? i - 1 : i)])}><Ico d={PREV} /></button>
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-b from-amber-300 to-amber-500 text-[18px] font-black text-[#3A2500] shadow-[0_4px_14px_rgba(245,200,66,.45)]"
          onClick={() => (ended ? (setT(0), setPlaying(true)) : setPlaying((p) => !p))}
        >
          {ended ? "↺" : playing ? "❚❚" : "▶"}
        </button>
        <button type="button" className={btn} aria-label="Next scene" onClick={() => i < SCENES.length - 1 && go(STARTS[i + 1])}><Ico d={NEXT} /></button>
        <button type="button" className={`${btn} text-[10px] font-black ${cc ? "text-amber-300" : "text-white/40"}`} onClick={() => setCc((v) => !v)}>CC</button>
        <button type="button" className={`${btn} text-[10.5px] font-black ${speed > 1 ? "text-amber-300" : ""}`} onClick={() => setSpeed((v) => (v > 1 ? 1 : 2))}>
          {speed}x
        </button>
      </div>

      {/* 📚 chapters */}
      <div ref={chipsRef} className="no-scrollbar mt-1 flex gap-1.5 overflow-x-auto pb-0.5">
        {CHAPTERS.map((c, k) => {
          const first = SCENES.findIndex((s) => s.ch === k);
          return (
            <button
              key={c}
              type="button"
              data-ch={k}
              onClick={() => (go(STARTS[first]), setPlaying(true))}
              className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-black transition ${
                k === sc.ch ? "bg-gradient-to-r from-amber-300 to-amber-500 text-[#3A2500]" : "bg-white/5 text-[#C9D2F2]"
              }`}
            >
              <span className={`grid h-4 w-4 place-items-center rounded-full text-[9px] ${k === sc.ch ? "bg-[#3A2500] text-amber-200" : "bg-white/10"}`}>{k + 1}</span>
              {c}
            </button>
          );
        })}
      </div>

      {/* 📝 this scene */}
      <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-amber-400/90">Scene {i + 1} of {SCENES.length}</p>
      <p className="text-[13.5px] font-black text-white">{sc.title}</p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#C9D2F2]">{sc.desc}</p>
    </div>
  );
}
