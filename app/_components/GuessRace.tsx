"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { serverNow } from "../../lib/serverTime";

// 🎯 NUMBER GUESS + 🐎 HORSE RACE — two quick game rooms, run entirely by the
// server (numGuessStart / numGuessGuess / numGuessTick, horseStart / horseBet /
// horseTick, guessRaceWatchdog), same as the app's GuessRaceGames.kt:
//   🎯 !start [entry] · !g 45 · !help
//   🐎 !start · !b [horse 1-5] [amount] · !help

export const NUMBER_GUESS_ROOM = "🎯 Number Guess Official";
export const HORSE_RACE_ROOM = "🐎 Horse Race Official";
const NG_BOT = "Number Bot";
const HR_BOT = "Horse Race Bot";
const HR_RACE_MS = 8_000;
const HR_MULT = "4.5x";

const ngStart = httpsCallable(functions, "numGuessStart");
const ngGuess = httpsCallable(functions, "numGuessGuess");
const ngTick = httpsCallable(functions, "numGuessTick");
const hrStart = httpsCallable(functions, "horseStart");
const hrBet = httpsCallable<{ horse: number; amount: number; operationId: string }, { bets?: Record<string, number> }>(functions, "horseBet");
const hrTick = httpsCallable(functions, "horseTick");

const errText = (e: any) => e?.message || "Something went wrong.";
const fmt = (n: number) => Math.floor(n || 0).toLocaleString("en-US");
/** 1200 → 1.2k, 215000 → 215k, 1500000 → 1.5M */
const short = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(n >= 1e5 ? 0 : 1)}k` : String(Math.floor(n));
const opId = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
/** "500", "1,000", "2k", "1.5k" → coins */
function amountOf(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.replace(/,/g, "").toLowerCase();
  const n = s.endsWith("k") ? Number(s.slice(0, -1)) * 1000 : Number(s);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

// Asks the server to move the game on once its timer is up (the watchdog is the backup).
function useTicker(running: boolean, endsAt: number, tick: () => Promise<unknown>, fast: boolean) {
  const [now, setNow] = useState(() => serverNow());
  const last = useRef(0);
  useEffect(() => {
    const t = setInterval(() => {
      const n = serverNow();
      setNow(n);
      if (running && endsAt > 0 && n >= endsAt + 400 && Date.now() - last.current > 2000 && document.visibilityState === "visible") {
        last.current = Date.now();
        tick().catch(() => {});
      }
    }, fast ? 60 : 300);
    return () => clearInterval(t);
  }, [running, endsAt, tick, fast]);
  return now;
}

// ---------------------------------------------------------------- 🎯 Number Guess
export type NumGuessState = {
  running: boolean;
  round: number;
  lo: number;
  hi: number;
  pot: number;
  players: number;
  entry: number;
  secondsLeft: number;
  lastGuess: { name: string; n: number; dir: string } | null;
  /** this round's guesses (last 12), for the markers on the bar */
  guesses: { name: string; n: number; dir: string }[];
  winner: { name: string; win: number } | null;
  answer: number;
  busy: boolean;
  start: (entry?: number) => void;
  guess: (n: number) => void;
};

export function useNumGuess(roomId: string | null, uid: string | undefined, note: (t: string) => void): NumGuessState | null {
  const [g, setG] = useState({
    running: false, round: 0, lo: 1, hi: 100, pot: 0, players: 0, entry: 1000, phaseEndsAt: 0,
    lastGuess: null as NumGuessState["lastGuess"], guesses: [] as NumGuessState["guesses"],
    winner: null as NumGuessState["winner"], answer: 0,
  });
  const [busy, setBusy] = useState(false);
  const noteRef = useRef(note);
  noteRef.current = note;
  const on = roomId === NUMBER_GUESS_ROOM;
  useEffect(() => {
    if (!on || !uid) return;
    return onSnapshot(doc(db, "room_game", NUMBER_GUESS_ROOM), (d) => {
      if (!d.exists()) return;
      const lg = d.get("lastGuess");
      const w = d.get("winner");
      setG({
        running: d.get("running") === true,
        round: Number(d.get("roundNumber") || 0),
        lo: Number(d.get("lo") || 1),
        hi: Number(d.get("hi") || 100),
        pot: Number(d.get("pot") || 0),
        players: Number(d.get("players") || 0),
        entry: Number(d.get("entry") || 1000),
        phaseEndsAt: Number(d.get("phaseEndsAt") || 0),
        lastGuess: lg && typeof lg.name === "string" ? { name: lg.name, n: Number(lg.n) || 0, dir: String(lg.dir || "") } : null,
        guesses: (Array.isArray(d.get("guesses")) ? d.get("guesses") : [])
          .filter((x: any) => x && typeof x.name === "string")
          .map((x: any) => ({ name: String(x.name), n: Number(x.n) || 0, dir: String(x.dir || "") })),
        winner: w && typeof w.name === "string" ? { name: w.name, win: Number(w.win) || 0 } : null,
        answer: Number(d.get("answer") || 0),
      });
    });
  }, [on, uid]);
  const now = useTicker(g.running, g.phaseEndsAt, () => ngTick({}), false);
  if (!on) return null;
  return {
    ...g,
    secondsLeft: g.running ? Math.max(0, Math.ceil((g.phaseEndsAt - now) / 1000)) : 0,
    busy,
    start: (entry) => {
      if (busy) return;
      setBusy(true);
      ngStart(entry ? { entry } : {})
        .catch((e) => noteRef.current(`${NG_BOT}: ${errText(e)}`))
        .finally(() => setBusy(false));
    },
    guess: (n) => {
      ngGuess({ n, operationId: opId("ng") }).catch((e) => noteRef.current(`${NG_BOT}: ${errText(e)}`));
    },
  };
}

/** Chat commands in the Number Guess room. True = handled (not posted as chat). */
export function numGuessHandleCommand(state: NumGuessState, clean: string, note: (t: string) => void): boolean {
  const parts = clean.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  if (cmd === "!start") {
    const entry = amountOf(parts[1]);
    if (parts[1] && !entry) note(`${NG_BOT}: Use !start or !start 500 (entry in coins)`);
    else state.start(entry ?? undefined);
    return true;
  }
  if (cmd === "!g" || cmd === "!guess") {
    const n = Number(parts[1]);
    if (!Number.isInteger(n) || n < 1 || n > 100) note(`${NG_BOT}: Use !g [1-100] — e.g. !g 50`);
    else state.guess(n);
    return true;
  }
  if (cmd === "!help") {
    note(`${NG_BOT}: !start (or !start 500) · !g [1-100] · your first guess takes the entry · right number wins the pot (−10%) · nobody right → entries refunded`);
    return true;
  }
  return false;
}

// 📖 The rules of each game (the "📖 Rules" button in its box) — same text as the app.
const NG_RULES: [string, string][] = [
  ["▶ Start", "Anyone taps Start (or types !start). A secret number from 1 to 100 is picked by the server — nobody can see it. One round lasts 60 seconds. The entry is 1,000 coins (or set your own: !start 500, from 100 to 50,000)."],
  ["🎯 Guess", "Drag the slider or use −10 / −1 / +1 / +10, then tap 🎯 Guess (or type !g 45). Your first guess of the round takes the entry; every guess after it is free. One guess every 3 seconds."],
  ["⬆️⬇️ Clues", "After each guess the bot says ⬆️ higher or ⬇️ lower, and the range shrinks for everyone — other players' guesses help you too."],
  ["🏆 Winning", "The first player to guess the exact number wins 90% of the pot (all entries together, yours included). The round ends at once."],
  ["⏰ Time up", "If nobody gets it in 60 seconds, every entry is refunded in full."],
  ["💡 Tip", "More players = a bigger pot. Playing alone, a win gives back 90% of your own entry."],
];
const HR_RULES: [string, string][] = [
  ["▶ Start", "Anyone taps Start race (or types !start). Then there are 45 seconds to bet."],
  ["💰 Betting", "Tap a lane, pick 100 / 500 / 1k / 5k and tap Bet (or type !b 3 500). You can bet on more than one horse. Minimum 100, maximum 200,000 per horse."],
  ["🏇 The race", "When betting closes, the 8-second race starts. The result is decided by the server at random — nobody can change it."],
  ["🏆 Winning", "Only bets on the 1st-place horse 🥇 win: they pay 4.5× the bet (1,000 → 4,500). Bets on the 2nd–5th horses lose."],
  ["📊 Max win", "The most one player can win in a race is 200,000 × 4.5 = 900,000 coins."],
  ["💳 Payouts", "Winnings are added to your balance automatically a few seconds after the race. Everything shows in your Activity."],
];

function RulesButton({ title, rules }: { title: string; rules: [string, string][] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mr-2 rounded-[10px] bg-white/[0.16] px-2 py-[3px] text-[11px] font-black tracking-normal text-white"
      >
        📖 Rules
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
            <div
              className="max-h-[80vh] w-full max-w-[360px] overflow-y-auto rounded-[20px] bg-[#fff] p-4 text-[#1B2440] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[17px] font-black">{title}</p>
              <ul className="mt-2 space-y-2.5">
                {rules.map(([h, t]) => (
                  <li key={h}>
                    <p className="text-[13.5px] font-black">{h}</p>
                    <p className="text-[13px] leading-snug text-[#4A5672]">{t}</p>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-4 w-full rounded-xl bg-[#2F80ED] py-2.5 text-[14px] font-black text-white"
              >
                Got it
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-[9px] bg-white/20 px-[7px] py-[2px] text-[11px] font-black text-white">{children}</span>;
}

function WhiteButton({ children, onClick, className = "" }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    // bg-[#fff], not bg-white: the Glass theme turns every .bg-white into clear glass
    <button type="button" onClick={onClick} className={`rounded-xl bg-[#fff] px-3.5 py-[7px] text-[13px] font-black text-[#1B2440] shadow-sm ${className}`}>
      {children}
    </button>
  );
}

// How "hot" the round is: the smaller the open range, the more bars light up
// (public information — it never hints at the hidden number itself).
function ngHeat(lo: number, hi: number): number {
  const w = hi - lo + 1;
  return w >= 80 ? 1 : w >= 50 ? 2 : w >= 25 ? 3 : w >= 12 ? 4 : w >= 5 ? 5 : 6;
}
const NG_HEAT = ["#5AA2FF", "#7FD4FF", "#FFE082", "#FFB74D", "#FF7043", "#E53935"];

// 🎯 design A + C (miglife's pick): the neon card (C) with the guess markers,
// the ❄️→🔥 meter and the −10/−1/+1/+10 buttons (A); the bar is also a slider
// that only moves inside the open range. One tap → 🎯 Guess.
export function NumGuessPanel({ state }: { state: NumGuessState }) {
  const [pick, setPick] = useState(50);
  const barRef = useRef<HTMLDivElement>(null);
  const lo = state.lo;
  const hi = Math.max(state.lo, state.hi);
  // keep my number inside the open range (start in its middle)
  useEffect(() => {
    setPick((p) => (p < lo || p > hi ? Math.round((lo + hi) / 2) : p));
  }, [lo, hi]);
  const clamp = (n: number) => Math.min(hi, Math.max(lo, n));
  const fromPointer = (clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r) return;
    setPick(clamp(Math.round(1 + ((clientX - r.left) / r.width) * 99)));
  };
  const pct = (n: number) => `${((n - 1) / 99) * 100}%`;
  const heat = ngHeat(lo, hi);
  const ringDeg = Math.max(0, Math.min(360, (state.secondsLeft / 60) * 360));
  return (
    <div
      className="relative mx-2.5 my-1.5 overflow-hidden rounded-[22px] border border-[#A078FF]/35 px-3.5 py-3 text-white shadow-[0_10px_26px_rgba(40,20,90,.35)]"
      style={{ background: "radial-gradient(130% 100% at 10% 0%,#3B1D7A,#140A33)" }}
    >
      <div className="flex items-center text-[12.5px] font-black tracking-wide">
        <span className="flex-1">🎯 NUMBER GUESS{state.round ? ` · #${state.round}` : ""}</span>
        <RulesButton title="🎯 Number Guess — Rules" rules={NG_RULES} />
        {state.running && (
          <span
            className="relative flex h-[46px] w-[46px] items-center justify-center rounded-full"
            style={{ background: `conic-gradient(#FF7AB6 0 ${ringDeg}deg, rgba(255,255,255,.12) ${ringDeg}deg)` }}
          >
            <span className="absolute inset-[4px] flex items-center justify-center rounded-full bg-[#1d0f45] text-[16px] text-[#FFD54A]">
              {state.secondsLeft}
            </span>
          </span>
        )}
      </div>
      {state.running ? (
        <>
          <p className="-mt-1 text-[11.5px] font-extrabold text-[#C9B8FF]">The hidden number is between</p>
          <p
            className="bg-clip-text text-[32px] font-black leading-tight text-transparent"
            style={{ backgroundImage: "linear-gradient(90deg,#FF7AB6,#FFD54A,#5AE3FF)" }}
          >
            {lo} – {hi}
          </p>
          {/* the 1–100 bar: open range lit, everyone's guesses marked above it, my pick as a slider */}
          <div className="relative mx-1 mb-1 mt-7">
            {state.guesses.map((g, i) => (
              <span
                key={i}
                className="absolute -top-[22px] -translate-x-1/2 whitespace-nowrap rounded-md bg-white/90 px-1 text-[10px] font-black text-[#3B1D7A]"
                style={{ left: pct(g.n) }}
                title={g.name}
              >
                {g.n}
                {g.dir === "up" ? "⬆" : g.dir === "down" ? "⬇" : "✅"}
              </span>
            ))}
            <div
              ref={barRef}
              className="relative h-[12px] cursor-pointer touch-none rounded-[7px] bg-white/[0.12]"
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                fromPointer(e.clientX);
              }}
              onPointerMove={(e) => e.buttons && fromPointer(e.clientX)}
            >
              <span
                className="absolute inset-y-0 rounded-[7px] shadow-[0_0_14px_rgba(255,122,182,.7)]"
                style={{ left: pct(lo), width: `${((hi - lo + 1) / 100) * 100}%`, background: "linear-gradient(90deg,#FF7AB6,#7B5CF0)" }}
              />
              <span
                className="absolute top-1/2 h-[24px] w-[24px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fff] shadow-[0_0_0_5px_rgba(255,122,182,.35)]"
                style={{ left: pct(pick) }}
              />
            </div>
          </div>
          <div className="flex justify-between text-[10px] font-extrabold text-[#9F8FD6]">
            <span>1</span>
            <span>100</span>
          </div>
          {/* ❄️ → 🔥: how small the open range has got */}
          <div className="mt-2 flex gap-[3px]">
            {NG_HEAT.map((c, i) => (
              <i
                key={c}
                className="h-[6px] flex-1 rounded-[3px]"
                style={{ background: i < heat ? c : "rgba(255,255,255,.12)", boxShadow: i === heat - 1 && heat === 6 ? "0 0 8px #ff8a80" : undefined }}
              />
            ))}
          </div>
          <div className="mt-[3px] flex justify-between text-[10.5px] font-extrabold text-[#C9B8FF]">
            <span>❄️ wide open</span>
            <span>🔥 very close!</span>
          </div>
          {/* −10 / −1 · my number · +1 / +10 */}
          <div className="mt-2.5 flex items-center gap-1.5">
            {[-10, -1].map((d) => (
              <button key={d} type="button" onClick={() => setPick((p) => clamp(p + d))} className="h-10 w-10 rounded-xl bg-white/[0.12] text-[13px] font-black">
                {d}
              </button>
            ))}
            <span className="flex h-11 flex-1 items-center justify-center rounded-[14px] bg-[#fff] text-[24px] font-black text-[#7B5CF0]">{pick}</span>
            {[1, 10].map((d) => (
              <button key={d} type="button" onClick={() => setPick((p) => clamp(p + d))} className="h-10 w-10 rounded-xl bg-white/[0.12] text-[13px] font-black">
                +{d}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => state.guess(pick)}
            className="mt-2.5 flex h-11 w-full items-center justify-center rounded-[14px] text-[15px] font-black shadow-[0_6px_16px_rgba(123,92,240,.5)]"
            style={{ background: "linear-gradient(90deg,#FF7AB6,#7B5CF0)" }}
          >
            🎯 Guess {pick}
          </button>
          <div className="mt-2 flex flex-wrap gap-[5px]">
            <Chip>💰 Pot {fmt(state.pot)}</Chip>
            <Chip>👥 {state.players}</Chip>
            <Chip>🎟 {fmt(state.entry)}</Chip>
            {state.lastGuess && (
              <Chip>
                {state.lastGuess.name}: {state.lastGuess.n}{" "}
                {state.lastGuess.dir === "up" ? "⬆️ higher" : state.lastGuess.dir === "down" ? "⬇️ lower" : "✅"}
              </Chip>
            )}
          </div>
        </>
      ) : (
        <>
          <p
            className="mb-1 mt-1 bg-clip-text text-center text-[44px] font-black tracking-[.12em] text-transparent"
            style={{ backgroundImage: "linear-gradient(90deg,#FF7AB6,#FFD54A,#5AE3FF)" }}
          >
            {state.answer > 0 ? state.answer : "? ?"}
          </p>
          <p className="text-center text-[13px] font-extrabold text-[#E9E1FF]">
            {state.winner
              ? `🏆 ${state.winner.name} won ${fmt(state.winner.win)} coins · the number was ${state.answer}`
              : state.answer > 0
                ? `⏰ Nobody got ${state.answer} — entries refunded`
                : "Guess the hidden number (1–100) and win the pot!"}
          </p>
          <button
            type="button"
            onClick={() => state.start()}
            className="mt-3 flex h-11 w-full items-center justify-center rounded-[14px] text-[15px] font-black shadow-[0_6px_16px_rgba(123,92,240,.5)]"
            style={{ background: "linear-gradient(90deg,#FF7AB6,#7B5CF0)" }}
          >
            {state.busy ? "…" : "▶ Start a round · 🎟 1,000"}
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 🐎 Horse Race
export type HorseRaceState = {
  running: boolean;
  phase: string;
  round: number;
  secondsLeft: number;
  positions: number[];
  /** 0–1 through the race while RACING */
  raceT: number;
  /** ms since the race ended (the photo-finish flash), -1 = not just finished */
  finishedAgo: number;
  /** for the gallop */
  now: number;
  lastOrder: number[];
  myBets: Record<number, number>;
  /** everyone's bets this race (room_game/…/hr_bets) — shown to everyone */
  bettors: { uid: string; name: string; bets: Record<number, number>; total: number }[];
  busy: boolean;
  pickHorse: number;
  setPickHorse: (h: number) => void;
  pickAmount: number;
  setPickAmount: (a: number) => void;
  start: () => void;
  bet: (horse: number, amount: number) => void;
};

export function useHorseRace(roomId: string | null, uid: string | undefined, note: (t: string) => void): HorseRaceState | null {
  const [g, setG] = useState({
    running: false, phase: "IDLE", round: 0, phaseEndsAt: 0, raceStartedAt: 0,
    frames: [] as number[][], lastOrder: [] as number[],
  });
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<{ round: number; bets: Record<number, number> }>({ round: 0, bets: {} });
  const [bettors, setBettors] = useState<{ round: number; list: HorseRaceState["bettors"] }>({ round: 0, list: [] });
  const [pickHorse, setPickHorse] = useState(1);
  const [pickAmount, setPickAmount] = useState(500);
  const noteRef = useRef(note);
  noteRef.current = note;
  const on = roomId === HORSE_RACE_ROOM;
  useEffect(() => {
    if (!on || !uid) return;
    return onSnapshot(doc(db, "room_game", HORSE_RACE_ROOM), (d) => {
      if (!d.exists()) return;
      const frames = Array.isArray(d.get("frames")) ? d.get("frames") : [];
      const hist = Array.isArray(d.get("history")) ? d.get("history") : [];
      setG({
        running: d.get("running") === true,
        phase: String(d.get("phase") || "IDLE"),
        round: Number(d.get("roundNumber") || 0),
        phaseEndsAt: Number(d.get("phaseEndsAt") || 0),
        raceStartedAt: Number(d.get("raceStartedAt") || 0),
        frames: frames.map((f: any) => (Array.isArray(f?.p) ? f.p.map(Number) : [0, 0, 0, 0, 0])),
        lastOrder: Array.isArray(hist[0]?.order) ? hist[0].order.map(Number) : [],
      });
    });
  }, [on, uid]);
  // 👥 everyone's bets for this race (also after it — for the results list)
  useEffect(() => {
    if (!on || !uid || !g.round) return;
    const round = g.round;
    return onSnapshot(
      query(collection(db, "room_game", HORSE_RACE_ROOM, "hr_bets"), where("roundNumber", "==", round)),
      (snap) => {
        const list = snap.docs.map((d) => {
          const raw = (d.get("bets") || {}) as Record<string, unknown>;
          const bets: Record<number, number> = {};
          Object.entries(raw).forEach(([k, v]) => (bets[Number(k)] = Number(v) || 0));
          return { uid: String(d.get("uid") || d.id), name: String(d.get("username") || "Player"), bets, total: Number(d.get("total") || 0) };
        });
        setBettors({ round, list });
      },
      () => {}
    );
  }, [on, uid, g.round]);
  const now = useTicker(g.running, g.phaseEndsAt, () => hrTick({}), g.phase === "RACING");
  if (!on) return null;

  // where each horse is now (0–100): the race frames, played over HR_RACE_MS,
  // eased between frames so the horses speed up and slow down smoothly
  let positions = [0, 0, 0, 0, 0];
  const raceT = g.phase === "RACING" ? Math.min(1, Math.max(0, (now - g.raceStartedAt) / HR_RACE_MS)) : 0;
  if (g.frames.length) {
    if (g.phase !== "RACING") positions = g.frames[g.frames.length - 1];
    else {
      const t = raceT * g.frames.length;
      const i = Math.min(g.frames.length - 1, Math.floor(t));
      const prev = i === 0 ? [0, 0, 0, 0, 0] : g.frames[i - 1];
      const next = g.frames[i];
      const k = Math.min(1, Math.max(0, t - i));
      const e = (1 - Math.cos(Math.PI * k)) / 2;
      positions = [0, 1, 2, 3, 4].map((h) => (prev[h] || 0) + ((next[h] || 0) - (prev[h] || 0)) * e);
    }
  }
  const ended = g.raceStartedAt > 0 ? now - (g.raceStartedAt + HR_RACE_MS) : -1;
  return {
    running: g.running,
    phase: g.phase,
    round: g.round,
    secondsLeft: g.running && g.phase === "BETTING" ? Math.max(0, Math.ceil((g.phaseEndsAt - now) / 1000)) : 0,
    positions,
    raceT,
    finishedAgo: g.phase !== "BETTING" && ended >= 0 && ended < 2500 ? ended : -1,
    now,
    lastOrder: g.lastOrder,
    myBets:
      mine.round === g.round
        ? mine.bets
        : bettors.round === g.round
          ? bettors.list.find((b) => b.uid === uid)?.bets || {}
          : {},
    bettors: bettors.round === g.round ? bettors.list : [],
    busy,
    pickHorse,
    setPickHorse,
    pickAmount,
    setPickAmount,
    start: () => {
      if (busy) return;
      setBusy(true);
      hrStart({})
        .catch((e) => noteRef.current(`${HR_BOT}: ${errText(e)}`))
        .finally(() => setBusy(false));
    },
    bet: (horse, amount) => {
      if (busy) return;
      setBusy(true);
      const round = g.round;
      hrBet({ horse, amount, operationId: opId("hr") })
        .then((r) => {
          const bets: Record<number, number> = {};
          Object.entries(r.data?.bets || {}).forEach(([k, v]) => (bets[Number(k)] = Number(v) || 0));
          setMine({ round, bets });
        })
        .catch((e) => noteRef.current(`${HR_BOT}: Bet rejected. ${errText(e)}`))
        .finally(() => setBusy(false));
    },
  };
}

/** Chat commands in the Horse Race room. True = handled (not posted as chat). */
export function horseHandleCommand(state: HorseRaceState, clean: string, note: (t: string) => void): boolean {
  const parts = clean.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  if (cmd === "!start") {
    state.start();
    return true;
  }
  if (cmd === "!b" || cmd === "!bet") {
    const horse = Number((parts[1] || "").replace(/^#/, ""));
    const amount = amountOf(parts[2]);
    if (!Number.isInteger(horse) || horse < 1 || horse > 5 || !amount) note(`${HR_BOT}: Use !b [horse 1-5] [amount] — e.g. !b 3 500`);
    else state.bet(horse, amount);
    return true;
  }
  if (cmd === "!help") {
    note(`${HR_BOT}: !start · !b [horse 1-5] [amount] · 45 s betting, then the race · the winning horse pays ${HR_MULT}`);
    return true;
  }
  return false;
}

const HORSE_COLORS = ["#E53935", "#FB8C00", "#FDD835", "#43A047", "#1E88E5"];
const MEDALS = ["🥇", "🥈", "🥉"];

// 🔊 Race sounds (public/sounds): a starting bell, galloping hooves during the
// race (a seamless loop, louder near the finish), a crowd cheer at the finish
// and a fanfare when I won. On / off is remembered on this device.
const HR_SOUND_KEY = "migwith.horseSound";
const hrSound = {
  ctx: null as AudioContext | null,
  bufs: {} as Record<string, AudioBuffer>,
  loop: null as { src: AudioBufferSourceNode; gain: GainNode } | null,
  enabled() {
    try {
      return localStorage.getItem(HR_SOUND_KEY) !== "0";
    } catch {
      return true;
    }
  },
  setEnabled(on: boolean) {
    try {
      localStorage.setItem(HR_SOUND_KEY, on ? "1" : "0");
    } catch {
      // storage blocked
    }
    if (!on) this.stopLoop();
  },
  // Browsers only allow sound after a tap: called from the box's taps too.
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      for (const f of ["hr_bell.mp3", "hr_cheer.mp3", "hr_win.mp3", "hr_gallop.wav"]) {
        fetch(`/sounds/${f}`)
          .then((r) => r.arrayBuffer())
          .then((b) => this.ctx!.decodeAudioData(b))
          .then((buf) => (this.bufs[f.split(".")[0]] = buf))
          .catch(() => {});
      }
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  },
  play(name: string, volume = 1) {
    if (!this.enabled() || document.visibilityState !== "visible") return;
    this.unlock();
    const buf = this.bufs[name];
    if (!this.ctx || !buf) return;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.buffer = buf;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  },
  startLoop() {
    if (this.loop || !this.enabled() || document.visibilityState !== "visible") return;
    this.unlock();
    const buf = this.bufs.hr_gallop;
    if (!this.ctx || !buf) return;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = 0.45;
    src.buffer = buf;
    src.loop = true;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
    this.loop = { src, gain };
  },
  loopVolume(v: number) {
    if (this.loop) this.loop.gain.gain.value = v;
  },
  stopLoop() {
    try {
      this.loop?.src.stop();
    } catch {
      // already stopped
    }
    this.loop = null;
  },
};

// Plays the race sounds as the race goes along (only for what happens while
// the room is open — reopening a finished race stays quiet).
function useRaceSounds(state: HorseRaceState, myWin: number) {
  const seen = useRef<{ phase: string; round: number; cheered: number; won: number } | null>(null);
  useEffect(() => {
    const prev = seen.current;
    seen.current = { phase: state.phase, round: state.round, cheered: prev?.cheered ?? 0, won: prev?.won ?? 0 };
    if (!prev) {
      // opened mid-race: just the hooves
      if (state.phase === "RACING") hrSound.startLoop();
      return;
    }
    if (state.phase === "RACING" && prev.phase !== "RACING") {
      hrSound.play("hr_bell", 0.7);
      hrSound.startLoop();
    }
    if (state.phase !== "RACING" && prev.phase === "RACING") {
      hrSound.stopLoop();
      if (seen.current.cheered !== state.round) {
        seen.current.cheered = state.round;
        hrSound.play("hr_cheer", 0.9);
      }
    }
  }, [state.phase, state.round]);
  // louder as they reach the finish
  useEffect(() => {
    if (state.phase === "RACING") hrSound.loopVolume(0.45 + 0.55 * state.raceT);
  }, [state.phase, state.raceT]);
  // 🎉 my win, once per race
  useEffect(() => {
    if (!myWin || !seen.current || seen.current.won === state.round || seen.current.cheered !== state.round) return;
    seen.current.won = state.round;
    const t = setTimeout(() => hrSound.play("hr_win", 0.9), 900);
    return () => clearTimeout(t);
  }, [myWin, state.round]);
  // load the sounds as soon as the box shows (they play after the first tap)
  useEffect(() => {
    hrSound.unlock();
    return () => hrSound.stopLoop();
  }, []);
}

// The live commentary line under the track.
function raceTicker(state: HorseRaceState, betting: boolean): string {
  if (betting) return `⏱ Place your bets — ${state.secondsLeft}s · the winner pays ${HR_MULT}`;
  if (state.phase === "RACING") {
    const ranks = [0, 1, 2, 3, 4].sort((a, b) => state.positions[b] - state.positions[a]);
    if (state.raceT < 0.12) return "🔔 And they're off!";
    if (state.raceT > 0.82) return `🔥 Final stretch — #${ranks[0] + 1} in front!`;
    return `🏇 #${ranks[0] + 1} leads · #${ranks[1] + 1} close behind`;
  }
  if (state.lastOrder.length) return `🏁 ${state.lastOrder.slice(0, 3).map((h, i) => `${MEDALS[i]} #${h}`).join("  ")}`;
  return "🐎 5 horses · the winning horse pays 4.5x";
}

// 🏇 design A (miglife's pick): a turf track — grass lanes, white rail, a
// checkered finish line — galloping horses kicking up dust, live commentary,
// a photo-finish flash, then the result with what I won or lost.
export function HorseRacePanel({ state }: { state: HorseRaceState }) {
  const betting = state.running && state.phase === "BETTING";
  const racing = state.phase === "RACING";
  const showLast = !state.running && state.lastOrder.length > 0;
  const myHorses = Object.keys(state.myBets).map(Number).filter((h) => state.myBets[h] > 0);
  const winner = state.lastOrder[0];
  const myStake = myHorses.reduce((a, h) => a + state.myBets[h], 0);
  const myWin = showLast && winner && state.myBets[winner] ? Math.floor(state.myBets[winner] * 4.5) : 0;
  const lostHorses = myHorses.filter((h) => h !== winner);
  // everyone's bets: per horse (👥 players · coins) and per player (after the race: won / lost)
  const pool: Record<number, { n: number; amt: number }> = {};
  state.bettors.forEach((b) =>
    Object.entries(b.bets).forEach(([k, v]) => {
      if (!(v > 0)) return;
      const h = Number(k);
      pool[h] = { n: (pool[h]?.n || 0) + 1, amt: (pool[h]?.amt || 0) + v };
    })
  );
  const players = state.bettors
    .map((b) => {
      const win = showLast && winner ? Math.floor((b.bets[winner] || 0) * 4.5) : 0;
      return { ...b, win, net: showLast ? win - b.total : null };
    })
    .sort((a, b) => (a.net !== null && b.net !== null ? b.net - a.net : b.total - a.total));
  const myLost = lostHorses.reduce((a, h) => a + state.myBets[h], 0);
  const [soundOn, setSoundOn] = useState(() => hrSound.enabled());
  useRaceSounds(state, myWin);
  return (
    <div
      onPointerDown={() => hrSound.unlock()}
      className="relative mx-2.5 my-1.5 overflow-hidden rounded-2xl bg-gradient-to-br from-[#2E7D32] to-[#1B5E20] px-3 py-2.5 text-white shadow-[0_8px_20px_rgba(20,60,20,.25)]"
    >
      <div className="flex items-center text-xs font-black">
        <span className="flex-1">🐎 HORSE RACE{state.round ? ` · #${state.round}` : ""}</span>
        <RulesButton title="🐎 Horse Race — Rules" rules={HR_RULES} />
        <button
          type="button"
          aria-label={soundOn ? "Sound off" : "Sound on"}
          onClick={() => {
            hrSound.setEnabled(!soundOn);
            setSoundOn(!soundOn);
            if (!soundOn && state.phase === "RACING") hrSound.startLoop();
          }}
          className="mr-2 text-[14px] leading-none"
        >
          {soundOn ? "🔊" : "🔇"}
        </button>
        <span>{betting ? `⏱ ${state.secondsLeft}s` : racing ? "🏁 racing…" : state.phase === "SETTLING" ? "🏆 result…" : ""}</span>
      </div>
      {[1, 2, 3, 4, 5].map((h) => {
        const picked = betting && state.pickHorse === h;
        const place = showLast ? state.lastOrder.indexOf(h) : -1;
        const mine = state.myBets[h] || 0;
        // the gallop: a quick up-and-down with a little rock, only while racing
        const ph = state.now / 90 + h * 1.7;
        const bob = racing ? -Math.abs(Math.sin(ph)) * 3 : 0;
        const tilt = racing ? Math.sin(ph) * 4 : 0;
        let right: string = HR_MULT;
        if (showLast && mine) right = h === winner ? `✅ +${fmt(Math.floor(mine * 4.5))}` : "❌";
        else if (mine) right = fmt(mine);
        else if (place >= 0 && place < 3) right = MEDALS[place];
        return (
          <button
            key={h}
            type="button"
            disabled={!betting}
            onClick={() => state.setPickHorse(h)}
            className={`mt-[5px] flex w-full items-center rounded-xl text-left ${picked ? "ring-2 ring-[#FFD54A]" : ""}`}
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black shadow"
              style={{ background: HORSE_COLORS[h - 1], color: h === 3 ? "#333" : "#fff" }}
            >
              {h}
            </span>
            <span
              className="relative mx-1.5 h-[26px] flex-1 overflow-hidden rounded-[8px] shadow-[inset_0_-2px_0_rgba(0,0,0,.18)]"
              style={{ background: "repeating-linear-gradient(90deg,#4CAF50 0 26px,#43A047 26px 52px)" }}
            >
              {/* white rail */}
              <span
                className="absolute inset-x-0 top-0 h-[2px] opacity-80"
                style={{ background: "repeating-linear-gradient(90deg,#fff 0 10px,transparent 10px 18px)" }}
              />
              {/* checkered finish line */}
              <span
                className="absolute inset-y-0 right-[10px] w-[5px]"
                style={{ background: "repeating-linear-gradient(0deg,#fff 0 4px,#111 4px 8px)" }}
              />
              {/* 👥 everyone's bets on this horse */}
              {betting && pool[h] && (
                <span className="absolute right-[20px] top-1/2 -translate-y-1/2 rounded-md bg-black/35 px-1.5 text-[10px] font-black leading-[16px]">
                  👥{pool[h].n} · {short(pool[h].amt)}
                </span>
              )}
              {(() => {
                const left = `calc((100% - 40px) * ${state.positions[h - 1] / 100})`;
                return (
                  <>
                    {racing &&
                      [0, 0.2, 0.4].map((d) => (
                        <span
                          key={d}
                          className="hr-dust absolute top-[16px] h-[6px] w-[6px] rounded-full bg-[#DEC496]"
                          style={{ left, animationDelay: `${d}s` }}
                        />
                      ))}
                    {/* 🐎 faces left — flipped so it runs to the finish */}
                    <span
                      className="absolute top-[1px] text-[19px] leading-[24px]"
                      style={{ left, transform: `translateY(${bob}px) rotate(${tilt}deg) scaleX(-1)` }}
                    >
                      🐎
                    </span>
                  </>
                );
              })()}
            </span>
            <span className={`w-[74px] shrink-0 whitespace-nowrap text-right font-black ${!mine && place >= 0 && place < 3 ? "text-[16px]" : "text-[11px]"}`}>{right}</span>
          </button>
        );
      })}
      <p className="mt-2 truncate rounded-[10px] bg-black/25 px-2.5 py-1.5 text-[12.5px] font-extrabold">{raceTicker(state, betting)}</p>
      {/* 👥 everyone's bets — and after the race, everyone's result */}
      {players.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-[5px]">
          {players.slice(0, 10).map((p) => (
            <span
              key={p.uid}
              className={`rounded-[9px] px-[7px] py-[2px] text-[11px] font-black ${
                p.net === null ? "bg-white/[0.16]" : p.win > 0 ? "bg-[#2ECC71]/90" : "bg-[#E53935]/80"
              }`}
            >
              {p.net === null
                ? `${p.name} ${short(p.total)}`
                : p.win > 0
                  ? `🏆 ${p.name} +${fmt(p.win)}`
                  : `${p.name} −${fmt(p.total)}`}
            </span>
          ))}
          {players.length > 10 && <span className="px-1 text-[11px] font-black text-white/80">+{players.length - 10} more</span>}
        </div>
      )}
      {showLast && myHorses.length > 0 && (
        <p className={`mt-1.5 rounded-[10px] px-2.5 py-1.5 text-[13px] font-extrabold leading-snug ${myWin ? "bg-[#2ECC71]/90" : "bg-[#E53935]/85"}`}>
          {myWin
            ? `🎉 You won +${fmt(myWin)} coins (${fmt(state.myBets[winner])} on #${winner})` +
              (myLost ? ` · lost ${fmt(myLost)} on ${lostHorses.map((h) => `#${h}`).join(", ")}` : "")
            : `😢 You lost ${fmt(myStake)} on ${myHorses.map((h) => `#${h}`).join(", ")}`}
        </p>
      )}
      {betting ? (
        <div className="mt-2 flex items-center gap-[5px]">
          {[100, 500, 1000, 5000].map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => state.setPickAmount(a)}
              className={`rounded-[10px] px-2.5 py-[5px] text-xs font-black ${state.pickAmount === a ? "bg-[#fff] text-[#1B5E20]" : "bg-white/20 text-white"}`}
            >
              {a >= 1000 ? `${a / 1000}k` : a}
            </button>
          ))}
          <span className="flex-1" />
          <WhiteButton onClick={() => state.bet(state.pickHorse, state.pickAmount)}>{state.busy ? "…" : `Bet #${state.pickHorse}`}</WhiteButton>
        </div>
      ) : (
        !state.running && (
          <WhiteButton className="mt-2" onClick={state.start}>
            {state.busy ? "…" : "▶ Start race"}
          </WhiteButton>
        )
      )}
      {/* 📸 photo finish, just as the race ends */}
      {state.finishedAgo >= 0 && state.finishedAgo < 1400 && (
        <span className="pointer-events-none absolute left-1/2 top-[42%] -translate-x-1/2 whitespace-nowrap rounded-xl bg-black/75 px-3.5 py-1.5 text-[20px] font-black tracking-wider">
          📸 PHOTO FINISH
        </span>
      )}
    </div>
  );
}
