"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
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
  winner: { name: string; win: number } | null;
  answer: number;
  busy: boolean;
  start: (entry?: number) => void;
  guess: (n: number) => void;
};

export function useNumGuess(roomId: string | null, uid: string | undefined, note: (t: string) => void): NumGuessState | null {
  const [g, setG] = useState({
    running: false, round: 0, lo: 1, hi: 100, pot: 0, players: 0, entry: 1000, phaseEndsAt: 0,
    lastGuess: null as NumGuessState["lastGuess"], winner: null as NumGuessState["winner"], answer: 0,
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

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-[9px] bg-white/20 px-[7px] py-[2px] text-[11px] font-black text-white">{children}</span>;
}

function WhiteButton({ children, onClick, className = "" }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-xl bg-white px-3.5 py-[7px] text-[13px] font-black text-[#1B2440] ${className}`}>
      {children}
    </button>
  );
}

export function NumGuessPanel({ state }: { state: NumGuessState }) {
  const from = (state.lo - 1) / 100;
  const span = Math.min(1, Math.max(0.02, (state.hi - state.lo + 1) / 100));
  return (
    <div className="mx-2.5 my-1.5 rounded-2xl bg-gradient-to-br from-[#FF7A59] to-[#F0457B] px-3 py-2.5 text-white">
      <div className="flex items-center text-xs font-black">
        <span className="flex-1">🎯 NUMBER GUESS{state.running ? ` · #${state.round}` : ""}</span>
        {state.running && <span>⏱ {state.secondsLeft}s</span>}
      </div>
      {state.running ? (
        <>
          <p className="mt-1 text-sm font-bold">
            The number is between {state.lo} and {state.hi}
          </p>
          <div className="relative mt-1.5 h-[9px] overflow-hidden rounded-[5px] bg-white/25">
            <i className="absolute inset-y-0 rounded-[5px] bg-[#FFD54A]" style={{ left: `${from * 100}%`, width: `${span * 100}%` }} />
          </div>
          <div className="mt-0.5 flex justify-between text-[10px] text-white/85">
            <span>1</span>
            <span>100</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-[5px]">
            <Chip>💰 Pot {fmt(state.pot)}</Chip>
            <Chip>👥 {state.players}</Chip>
            <Chip>🎟 {fmt(state.entry)}</Chip>
          </div>
          {state.lastGuess && (
            <p className="mt-1 truncate text-xs font-bold">
              {state.lastGuess.name}: {state.lastGuess.n} →{" "}
              {state.lastGuess.dir === "up" ? "⬆️ higher" : state.lastGuess.dir === "down" ? "⬇️ lower" : "✅"}
            </p>
          )}
          <p className="text-[11px] text-white/85">Type !g [number] to guess</p>
        </>
      ) : (
        <>
          <p className="mt-1 text-[13px] font-bold">
            {state.winner
              ? `🏆 ${state.winner.name} won ${fmt(state.winner.win)} coins · the number was ${state.answer}`
              : state.answer > 0
                ? `⏰ Last number was ${state.answer} — nobody got it`
                : "Guess the hidden number (1–100) and win the pot!"}
          </p>
          <WhiteButton className="mt-2" onClick={() => state.start()}>
            {state.busy ? "…" : "▶ Start (1,000)"}
          </WhiteButton>
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
  lastOrder: number[];
  myBets: Record<number, number>;
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
  const now = useTicker(g.running, g.phaseEndsAt, () => hrTick({}), g.phase === "RACING");
  if (!on) return null;

  // where each horse is now (0–100): the race frames, played over HR_RACE_MS
  let positions = [0, 0, 0, 0, 0];
  if (g.frames.length) {
    if (g.phase !== "RACING") positions = g.frames[g.frames.length - 1];
    else {
      const t = Math.min(1, Math.max(0, (now - g.raceStartedAt) / HR_RACE_MS)) * g.frames.length;
      const i = Math.min(g.frames.length - 1, Math.floor(t));
      const prev = i === 0 ? [0, 0, 0, 0, 0] : g.frames[i - 1];
      const next = g.frames[i];
      const k = Math.min(1, Math.max(0, t - i));
      positions = [0, 1, 2, 3, 4].map((h) => (prev[h] || 0) + ((next[h] || 0) - (prev[h] || 0)) * k);
    }
  }
  return {
    running: g.running,
    phase: g.phase,
    round: g.round,
    secondsLeft: g.running && g.phase === "BETTING" ? Math.max(0, Math.ceil((g.phaseEndsAt - now) / 1000)) : 0,
    positions,
    lastOrder: g.lastOrder,
    myBets: mine.round === g.round ? mine.bets : {},
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

export function HorseRacePanel({ state }: { state: HorseRaceState }) {
  const betting = state.running && state.phase === "BETTING";
  const showLast = !state.running && state.lastOrder.length > 0;
  return (
    <div className="mx-2.5 my-1.5 rounded-2xl bg-gradient-to-br from-[#3B5BDB] to-[#7B5CF0] px-3 py-2.5 text-white">
      <div className="flex items-center text-xs font-black">
        <span className="flex-1">🐎 HORSE RACE{state.round ? ` · #${state.round}` : ""}</span>
        <span>
          {betting ? `⏱ ${state.secondsLeft}s` : state.phase === "RACING" ? "🏁 racing…" : state.phase === "SETTLING" ? "🏆 result…" : ""}
        </span>
      </div>
      {[1, 2, 3, 4, 5].map((h) => {
        const picked = betting && state.pickHorse === h;
        const place = showLast ? state.lastOrder.indexOf(h) : -1;
        return (
          <button
            key={h}
            type="button"
            disabled={!betting}
            onClick={() => state.setPickHorse(h)}
            className={`mt-[5px] flex w-full items-center rounded-xl text-left ${picked ? "ring-[1.5px] ring-white" : ""}`}
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
              style={{ background: HORSE_COLORS[h - 1], color: h === 3 ? "#333" : "#fff" }}
            >
              {h}
            </span>
            <span className="relative mx-1.5 h-[22px] flex-1 rounded-[11px] bg-white/[0.18]">
              <span className="absolute right-[3px] top-[2px] text-[12px]">🏁</span>
              {/* 🐎 faces left — flipped so it runs to the flag */}
              <span
                className="absolute top-0 text-[16px] leading-[22px]"
                style={{ left: `calc((100% - 36px) * ${state.positions[h - 1] / 100})`, transform: "scaleX(-1)" }}
              >
                🐎
              </span>
            </span>
            <span className={`w-11 shrink-0 text-right font-black ${!state.myBets[h] && place >= 0 && place < 3 ? "text-[16px]" : "text-[11px]"}`}>
              {state.myBets[h] ? fmt(state.myBets[h]) : place >= 0 && place < 3 ? ["🥇", "🥈", "🥉"][place] : HR_MULT}
            </span>
          </button>
        );
      })}
      {betting ? (
        <div className="mt-2 flex items-center gap-[5px]">
          {[100, 500, 1000, 5000].map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => state.setPickAmount(a)}
              className={`rounded-[10px] px-2.5 py-[5px] text-xs font-black ${state.pickAmount === a ? "bg-white text-[#3B5BDB]" : "bg-white/20 text-white"}`}
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
    </div>
  );
}
