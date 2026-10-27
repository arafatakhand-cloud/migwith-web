"use client";

import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { MiniCard } from "./Cards";
import RoyaleGuide from "./RoyaleGuide";
import { useRememberedAmount } from "../../lib/amountMemory";
import { useGameAutoFold } from "../../lib/gameBoxFold";
import { LiveWatch } from "./LiveWatch";


// 👑 MIG Royale — Red vs Blue. Server-driven (startRoyale / royaleBet /
// tickRoyale): the web only shows the round and sends bets, same as the app's
// RoyaleGame.kt.

export const ROYALE_ROOM = "👑 MIG Royale Official";

type RoyaleOption = { key: string; label: string; mult: string; side: boolean };

export const ROYALE_OPTIONS: RoyaleOption[] = [
  { key: "red", label: "Red", mult: "1.9x", side: true },
  { key: "blue", label: "Blue", mult: "1.9x", side: true },
  { key: "jutt", label: "Jutt", mult: "2.5x", side: false },
  { key: "color", label: "Color", mult: "10x", side: false },
  { key: "run", label: "Run", mult: "15x", side: false },
  { key: "doublerun", label: "Double Run", mult: "100x", side: false },
  { key: "tirel", label: "Tirel", mult: "150x", side: false },
];

const CHIPS = [500, 1000, 2000, 5000, 10000, 15000, 20000];

const startRoyaleCall = httpsCallable(functions, "startRoyale");
const royaleBetCall = httpsCallable(functions, "royaleBet");
const tickRoyaleCall = httpsCallable(functions, "tickRoyale");

type HistoryItem = { round: number; winner: string; hand: string };
export type RoyaleSummary = { round: number; players: number; winningBets: number; paidOut: number; gotBack: number; top: { name: string; profit: number } | null };

export type RoyaleState = {
  running: boolean;
  phase: string;
  round: number;
  secondsLeft: number;
  myBets: Record<string, number>;
  /** Everyone's bets this round, per option: coins in + how many people. */
  pool: Record<string, { coins: number; people: number }>;
  poolTotal: number;
  lastRed: string[];
  lastBlue: string[];
  lastRedHand: string;
  lastBlueHand: string;
  lastWinner: string;
  lastRound: number;
  history: HistoryItem[];
  /** The last finished round, for the result card (server: lastSummary). */
  summary: RoyaleSummary | null;
  /** The winning hand type of the last dealt round ("Jutt", "Run" …). */
  lastWinHand: string;
  /** 🏆 today's biggest winners (server: todayTop). */
  todayTop: { name: string; profit: number }[];
  /** 📣 the newest bet in this round, for the live ticker. */
  ticker: { text: string; at: number } | null;
  /** 📊 Live score: everyone's bets this round, biggest first. */
  bettors: { name: string; options: string[]; total: number }[];
  busy: boolean;
  /** My last bet this session (for ↻ Same). */
  lastBet: { option: string; amount: number } | null;
  start: () => void;
  bet: (option: string, amount: number) => void;
};

function royaleOpId(): string {
  return "royale_" + crypto.randomUUID().replace(/-/g, "");
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function useRoyale(enabled: boolean, uid: string | undefined, note: (t: string) => void): RoyaleState | null {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("IDLE");
  const [phaseEndsAt, setPhaseEndsAt] = useState(0);
  const [round, setRound] = useState(0);
  const [myBets, setMyBets] = useState<Record<string, number>>({});
  const [lastBet, setLastBet] = useState<{ option: string; amount: number } | null>(null);
  const [summary, setSummary] = useState<RoyaleSummary | null>(null);
  const [lastWinHand, setLastWinHand] = useState("");
  const [todayTop, setTodayTop] = useState<{ name: string; profit: number }[]>([]);
  const [ticker, setTicker] = useState<{ text: string; at: number } | null>(null);
  const [bettors, setBettors] = useState<{ name: string; options: string[]; total: number }[]>([]);
  const [pool, setPool] = useState<Record<string, { coins: number; people: number }>>({});
  const [last, setLast] = useState({
    red: [] as string[],
    blue: [] as string[],
    redHand: "",
    blueHand: "",
    winner: "",
    round: 0,
  });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const lastTick = useRef(0);
  const noteRef = useRef(note);
  noteRef.current = note;

  // The game document.
  useEffect(() => {
    if (!enabled || !uid) return;
    return onSnapshot(doc(db, "room_game", ROYALE_ROOM), (snap) => {
      if (!snap.exists()) {
        setRunning(false);
        setPhase("IDLE");
        return;
      }
      setRunning(snap.get("gameRunning") === true);
      setPhase(String(snap.get("phase") || "IDLE"));
      setPhaseEndsAt(Number(snap.get("phaseEndsAt") || 0));
      setRound(Number(snap.get("roundNumber") || 0));
      setLast({
        red: strings(snap.get("lastRed")),
        blue: strings(snap.get("lastBlue")),
        redHand: String(snap.get("lastRedHand") || ""),
        blueHand: String(snap.get("lastBlueHand") || ""),
        winner: String(snap.get("lastWinner") || ""),
        round: Number(snap.get("lastRound") || 0),
      });
      setLastWinHand(String(snap.get("lastWinHand") || ""));
      // 🏆 today's top winners (Bangladesh day) — only today's list counts
      const tt = snap.get("todayTop") as { day?: string; list?: { name?: string; profit?: number }[] } | undefined;
      const today = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
      setTodayTop(
        tt && tt.day === today && Array.isArray(tt.list)
          ? tt.list.filter((x) => x && typeof x.name === "string").map((x) => ({ name: String(x.name), profit: Number(x.profit || 0) }))
          : []
      );
      const sm = snap.get("lastSummary") as Record<string, any> | undefined;
      setSummary(
        sm && typeof sm === "object"
          ? {
              round: Number(sm.round || 0),
              players: Number(sm.players || 0),
              winningBets: Number(sm.winningBets || 0),
              paidOut: Number(sm.paidOut || 0),
              gotBack: Number(sm.gotBack || 0),
              top: sm.top && typeof sm.top.name === "string" ? { name: sm.top.name, profit: Number(sm.top.profit || 0) } : null,
            }
          : null
      );
      const h = snap.get("history");
      setHistory(
        Array.isArray(h)
          ? h.map((m: any) => ({
              round: Number(m?.round || 0),
              winner: String(m?.winner || ""),
              hand: String(m?.hand || ""),
            }))
          : []
      );
    });
  }, [enabled, uid]);

  // My bets this round (royale_bets/{round}_{uid}).
  useEffect(() => {
    if (!enabled || !uid || round <= 0) {
      setMyBets({});
      return;
    }
    return onSnapshot(doc(db, "room_game", ROYALE_ROOM, "royale_bets", `${round}_${uid}`), (snap) => {
      setMyBets(((snap.get("bets") || {}) as Record<string, number>) ?? {});
    });
  }, [enabled, uid, round]);

  const prevBets = useRef<Record<string, Record<string, number>>>({});
  useEffect(() => {
    prevBets.current = {};
    setTicker(null);
  }, [round]);

  // 👥 Everyone's bets this round (royale_bets where roundNumber == round): per-option
  // "coins in · N bettors", so a player can see their bet really landed.
  useEffect(() => {
    if (!enabled || !uid || round <= 0) {
      setPool({});
      setBettors([]);
      return;
    }
    return onSnapshot(
      query(collection(db, "room_game", ROYALE_ROOM, "royale_bets"), where("roundNumber", "==", round)),
      (snap) => {
        // 📣 live ticker: what changed in someone's bets ("kirey bet 20k on Run")
        if (!snap.metadata.hasPendingWrites) {
          for (const ch of snap.docChanges()) {
            if (ch.type === "removed") continue;
            const name = String(ch.doc.get("username") || "Someone");
            const now = (ch.doc.get("bets") || {}) as Record<string, number>;
            const before = prevBets.current[ch.doc.id] || {};
            for (const [k, v] of Object.entries(now)) {
              const delta = (Number(v) || 0) - (Number(before[k]) || 0);
              if (delta > 0) {
                const label = ROYALE_OPTIONS.find((o) => o.key === k)?.label || k;
                setTicker({ text: `${name} bet ${shortK(delta)} on ${label}`, at: Date.now() });
              }
            }
            prevBets.current[ch.doc.id] = { ...now };
          }
        }
        const out: Record<string, { coins: number; people: number }> = {};
        const list: { name: string; options: string[]; total: number }[] = [];
        snap.forEach((d) => {
          const bb = (d.get("bets") || {}) as Record<string, number>;
          const opts = Object.entries(bb).filter(([, v]) => Number(v) > 0);
          if (opts.length)
            list.push({
              name: String(d.get("username") || "Player"),
              options: opts.map(([k]) => ROYALE_OPTIONS.find((o) => o.key === k)?.label || k),
              total: opts.reduce((a, [, v]) => a + Number(v), 0),
            });
        });
        setBettors(list.sort((a, b) => b.total - a.total));
        snap.forEach((d) => {
          const b = (d.get("bets") || {}) as Record<string, number>;
          for (const [k, v] of Object.entries(b)) {
            const n = Number(v) || 0;
            if (n <= 0) continue;
            const cur = out[k] || { coins: 0, people: 0 };
            out[k] = { coins: cur.coins + n, people: cur.people + 1 };
          }
        });
        setPool(out);
      },
      () => {}
    );
  }, [enabled, uid, round]);

  // Countdown, and nudge the server once betting time is over (like the app).
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (
        running &&
        phaseEndsAt > 0 &&
        document.visibilityState === "visible" &&
        n >= phaseEndsAt + 400 &&
        n - lastTick.current > 2000
      ) {
        lastTick.current = n;
        tickRoyaleCall({}).catch(() => {});
      }
    }, 300);
    return () => clearInterval(t);
  }, [enabled, running, phaseEndsAt]);

  if (!enabled) return null;

  const secondsLeft = running && phaseEndsAt ? Math.max(0, Math.ceil((phaseEndsAt - now) / 1000)) : 0;

  return {
    running,
    phase,
    round,
    secondsLeft,
    myBets,
    pool,
    poolTotal: Object.values(pool).reduce((a, p) => a + p.coins, 0),
    lastRed: last.red,
    lastBlue: last.blue,
    lastRedHand: last.redHand,
    lastBlueHand: last.blueHand,
    lastWinner: last.winner,
    lastRound: last.round,
    history,
    summary,
    lastWinHand,
    todayTop,
    ticker,
    bettors,
    busy,
    lastBet,
    start: () => {
      if (busy) return;
      setBusy(true);
      startRoyaleCall({})
        .catch((err: any) => noteRef.current(`MIG Royale Bot: ${err?.message || "Something went wrong. Try again."}`))
        .finally(() => setBusy(false));
    },
    bet: (option: string, amount: number) => {
      if (busy) return;
      setBusy(true);
      royaleBetCall({ option, amount, operationId: royaleOpId() })
        .then(() => setLastBet({ option, amount }))
        .catch((err: any) =>
          noteRef.current(`MIG Royale Bot: Bet rejected. ${err?.message || "Something went wrong. Try again."}`)
        )
        .finally(() => setBusy(false));
    },
  };
}

// "!start" · "!bet red 500" · "!bet double run 2k" · "!help". Returns true when handled.
export function royaleHandleCommand(state: RoyaleState, text: string, note: (t: string) => void): boolean {
  const parts = text.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  if (cmd === "!start") {
    state.start();
    return true;
  }
  if (cmd === "!bet" || cmd === "!b") {
    if (parts.length < 3) {
      note("MIG Royale Bot: Use !bet [option] [amount] — e.g. !bet red 500");
      return true;
    }
    const raw = parts[parts.length - 1].replace(/,/g, "").toLowerCase();
    const amount = raw.endsWith("k") ? Math.round(Number(raw.slice(0, -1)) * 1000) : Number(raw);
    const option = parts.slice(1, -1).join("").toLowerCase();
    const known = ROYALE_OPTIONS.find(
      (o) => o.key === option || o.label.replace(/ /g, "").toLowerCase() === option
    );
    if (!Number.isInteger(amount) || amount <= 0) {
      note("MIG Royale Bot: Amount must be a number, e.g. !bet red 500");
    } else if (!known) {
      note("MIG Royale Bot: Options: red, blue, jutt, color, run, doublerun, tirel");
    } else {
      state.bet(known.key, amount);
    }
    return true;
  }
  if (cmd === "!help") {
    note(
      "MIG Royale Bot: !start · !bet [red|blue|jutt|color|run|doublerun|tirel] [amount] · Red/Blue 1.9x · Jutt 2.5x · Color 10x · Run 15x · Double Run 100x · Tirel 150x · hand types pay only on the winning side"
    );
    return true;
  }
  return false;
}

// ⚔ ARENA bet box (miglife picked design 1, compact): Red VS Blue face-off with a
// tug bar of the coins on each side, five hand tiles (🔥 = most coins), amount
// chips, ↻ Same + Bet, and the last results with the current streak.
export function RoyaleTable({ state }: { state: RoyaleState }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useRememberedAmount("royale_bet", 500);
  const [collapsed, setCollapsed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // ⋯ menu (bottom sheet) · 📊 live score panel · ❓ how to play
  const [menu, setMenu] = useState(false);
  const [liveScore, setLiveScore] = useState(false);
  const [help, setHelp] = useState(false);
  const prefs = useRoyalePrefs();
  const [flash, setFlash] = useState(false);
  const prevMine = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);
  // ⭐ My usual: a saved mix of bets, placed with one tap (this device)
  const [usual, setUsual] = useState<[string, number][] | null>(() => readUsual());
  const placingUsual = useRef(false);
  // 🛑 "NO MORE BETS" stamp for a moment when betting closes
  const [stamp, setStamp] = useState(false);
  // 👆 squeeze: when (ms into the reveal) I peeked the last card myself
  const [peekAt, setPeekAt] = useState<number | null>(null);
  // 🎉 my win of the last round (float + sparks)
  const [won, setWon] = useState<{ round: number; coins: number } | null>(null);

  // A new round clears the pick.
  useEffect(() => setSelected(null), [state.round]);
  // folded unless I have a bet in this round (kept open 90 s after, like the app)
  // open for the whole round (everyone sees the box while betting), folded 90 s after
  useGameAutoFold(state.running, setCollapsed, 90_000);
  // ✓ "Bet placed" for a moment whenever my total on the table grows
  const myTotal = Object.values(state.myBets).reduce((a, v) => a + Number(v || 0), 0);
  useEffect(() => {
    if (myTotal > prevMine.current) {
      setFlash(true);
      royaleSound("chip");
      if (state.lastBet) flyChip(boxRef.current, state.lastBet.amount, state.lastBet.option);
      const t = setTimeout(() => setFlash(false), 1500);
      prevMine.current = myTotal;
      return () => clearTimeout(t);
    }
    prevMine.current = myTotal;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTotal]);

  // 🃏 Card reveal: starts when the round turns SETTLING and runs its ~5 s
  // even if the server already finished paying (the result card follows).
  const [reveal, setReveal] = useState<{ round: number; start: number } | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state.running && state.phase === "SETTLING" && state.lastRed.length === 3 && reveal?.round !== state.round) {
      setReveal({ round: state.round, start: Date.now() });
      setPeekAt(null);
    }
  }, [state.running, state.phase, state.round, state.lastRed.length, reveal?.round]);
  const lastOpen = peekAt ?? BLUE_FLIPS[2];
  const revealing = !!reveal && Date.now() - reveal.start < lastOpen + 1300;
  useEffect(() => {
    if (!revealing) return;
    const t = setInterval(() => setTick((n) => n + 1), 120);
    return () => clearInterval(t);
  }, [revealing]);

  const canBet = state.running && state.phase === "BETTING" && state.secondsLeft > 0;
  // 🛑 betting just closed → stamp
  const wasBetting = useRef(false);
  useEffect(() => {
    if (wasBetting.current && !canBet && state.running) setStamp(true);
    wasBetting.current = canBet;
  }, [canBet, state.running]);
  // the stamp always goes away on its own (even if the round ends meanwhile)
  useEffect(() => {
    if (!stamp) return;
    const t = setTimeout(() => setStamp(false), 1300);
    return () => clearTimeout(t);
  }, [stamp]);
  // 🎉 the reveal finished → did I win? (my bets of that round × the result)
  useEffect(() => {
    if (revealing || !reveal || won?.round === reveal.round || reveal.round !== state.round) return;
    const coins = myWinOf(state.myBets, state.lastWinner, state.lastWinHand);
    setWon({ round: reveal.round, coins });
    if (coins > 0) royaleSound("win");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealing, reveal?.round]);
  const opt = ROYALE_OPTIONS.find((o) => o.key === selected);
  const ready = canBet && !!opt && !state.busy;
  const tap = (key: string) => setSelected(key);
  const quick = (key: string) => canBet && !state.busy && state.bet(key, amount);

  const redIn = state.pool.red?.coins || 0;
  const blueIn = state.pool.blue?.coins || 0;
  const redPct = redIn + blueIn > 0 ? Math.round((redIn / (redIn + blueIn)) * 100) : 50;
  const hands = ROYALE_OPTIONS.filter((o) => !o.side);
  const hot = hands.reduce<string | null>((best, o) => ((state.pool[o.key]?.coins || 0) > (best ? state.pool[best]?.coins || 0 : 0) ? o.key : best), null);
  const RING = 2 * Math.PI * 14;
  const total = 45; // betting lasts 45 s

  return (
    <div
      ref={boxRef}
      className={`relative m-1.5 overflow-hidden rounded-[18px] px-2.5 pb-2.5 pt-2 text-[#EAF0FF] shadow-[0_10px_30px_rgba(8,12,30,.35)] ${
        canBet && state.secondsLeft <= 5 ? "royale-hurry" : ""
      }`}
      style={{ background: "radial-gradient(130% 80% at 50% 0%, #26306A 0%, #141A3A 55%, #0D1128 100%)" }}
    >
      {stamp && (
        <div className="royale-stamp pointer-events-none absolute inset-0 z-20 grid place-items-center bg-[#080A19]/55 text-[22px] font-black tracking-[1px] text-amber-300">
          NO MORE BETS
        </div>
      )}
      {won && won.coins > 0 && won.round === state.lastRound && !state.running && (
        <span key={won.round} className="royale-float pointer-events-none absolute right-3 top-9 z-20 text-[15px] font-black text-green-400">
          +{won.coins.toLocaleString("en-US")} 🎉
        </span>
      )}
      {/* Header: ⏱ ring · title / round · pool · 📊 · − */}
      <div className="flex items-center gap-2">
        <div className="relative h-8 w-8 shrink-0">
          <svg viewBox="0 0 32 32" className="h-full w-full -rotate-90" aria-hidden>
            <circle cx="16" cy="16" r="14" fill="none" stroke="#2A3366" strokeWidth="3.5" />
            {state.running && (
              <circle
                cx="16" cy="16" r="14" fill="none" stroke={state.secondsLeft <= 5 ? "#EF4444" : "#A78BFA"} strokeWidth="3.5" strokeLinecap="round"
                strokeDasharray={RING} strokeDashoffset={RING * (1 - Math.min(1, state.secondsLeft / total))}
              />
            )}
          </svg>
          <b className="absolute inset-0 grid place-items-center text-[12px] font-black tabular-nums">
            {state.running ? (canBet ? state.secondsLeft : "🃏") : "👑"}
          </b>
        </div>
        <div className="min-w-0 leading-tight">
          <p className="text-[15px] font-black">MIG Royale</p>
          <p className="truncate text-[10px] font-bold text-[#9BA6D6]">
            {state.running ? `Round #${state.round} · ${canBet ? "bets open" : "dealing…"}` : "Red vs Blue"}
          </p>
        </div>
        {state.running && state.poolTotal > 0 && (
          <div className="ml-auto text-right leading-none">
            <b className="block text-[15px] font-black tabular-nums text-amber-300">{shortK(state.poolTotal)}</b>
            <span className="text-[8.5px] font-extrabold tracking-[1px] text-[#9BA6D6]">POOL</span>
          </div>
        )}
        {collapsed && state.running && <LiveWatch onWatch={() => setCollapsed(false)} />}
        {/* ⋯ = score, help and settings · ⌄ = fold */}
        <button
          type="button"
          onClick={() => setMenu(true)}
          title="Score, help and settings"
          className={`${state.running && state.poolTotal > 0 ? "" : "ml-auto"} grid h-7 w-8 place-items-center rounded-lg bg-white/10 text-[15px] font-black leading-none hover:bg-white/15`}
        >
          ⋯
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Open" : "Fold"}
          className="grid h-7 w-7 place-items-center rounded-lg border border-white/15 text-[12px] text-white/80 hover:bg-white/10"
        >
          {collapsed ? "⌃" : "⌄"}
        </button>
      </div>

      {/* 📊 Live score: who bet what this round */}
      {liveScore && !collapsed && (
        <div className="mt-1.5 rounded-[12px] bg-black/30 p-2">
          <div className="flex items-center text-[11px] font-black">
            <span>📊 Live score</span>
            <span className="ml-2 text-[10px] font-bold text-[#9BA6D6]">
              Pool {shortK(state.poolTotal)} · {state.bettors.length} {state.bettors.length === 1 ? "bettor" : "bettors"}
            </span>
            <button type="button" onClick={() => setLiveScore(false)} className="ml-auto rounded-full bg-white/10 px-2 text-[10px]">
              ✕ Close
            </button>
          </div>
          {state.bettors.length === 0 ? (
            <p className="py-2 text-center text-[11px] text-[#9BA6D6]">No bets yet this round.</p>
          ) : (
            <div className="mt-1 max-h-32 overflow-y-auto">
              <div className="flex text-[9.5px] font-extrabold uppercase tracking-wide text-[#9BA6D6]">
                <span className="flex-1">Bettor</span>
                <span>Stake</span>
              </div>
              {state.bettors.map((b) => (
                <div key={b.name} className="flex items-center gap-2 border-t border-white/5 py-1 text-[11px]">
                  <span className="min-w-0 flex-1 truncate">
                    <b>{b.name}</b> <span className="text-[#9BA6D6]">on {b.options.join(", ")}</span>
                  </span>
                  <b className="tabular-nums">{b.total.toLocaleString("en-US")}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ⋯ menu: a sheet from the bottom of the box */}
      {menu && (
        <div className="fixed inset-0 z-[90] flex flex-col items-center justify-end bg-black/50" onClick={() => setMenu(false)}>
          <div className="w-full max-w-md rounded-t-[20px] bg-[#F5F7FC] p-2.5 pb-[calc(env(safe-area-inset-bottom)+12px)] text-[#1B2440]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-100 text-[15px]">👑</span>
              <span className="leading-tight">
                <b className="block text-[14px]">MIG Royale</b>
                <span className="text-[11px] text-[#6B7591]">Score, help and settings</span>
              </span>
              <button type="button" onClick={() => setMenu(false)} className="ml-auto px-2 text-[16px] text-[#6B7591]">
                ✕
              </button>
            </div>
            {(
              [
                ["📊", "Live score", liveScore ? "✓" : "", () => (setLiveScore((v) => !v), setMenu(false))],
                ["🎲", "Last results", "", () => (setShowHistory((v) => !v), setMenu(false))],
                ["❓", "How to play", "", () => (setHelp(true), setMenu(false))],
                ["👁", "Show everyone's bets in chat", prefs.betLines ? "✓" : "", () => setRoyalePref("betLines", !prefs.betLines)],
                ["💬", "Hide game messages in chat", prefs.hideGame ? "✓" : "", () => setRoyalePref("hideGame", !prefs.hideGame)],
                [prefs.sound === "on" ? "🔊" : prefs.sound === "vibrate" ? "📳" : "🔇", `Sound: ${prefs.sound === "vibrate" ? "vibrate only" : prefs.sound}`, "", () =>
                  setRoyalePref("sound", prefs.sound === "on" ? "vibrate" : prefs.sound === "vibrate" ? "off" : "on")],
              ] as [string, string, string, () => void][]
            ).map(([icon, label, check, run]) => (
              <button
                key={label}
                type="button"
                onClick={run}
                className="mb-1 flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left text-[13px] font-bold shadow-[0_1px_2px_rgba(0,0,0,.05)]"
              >
                <span className="w-5 text-center">{icon}</span>
                <span className="flex-1">{label}</span>
                <span className="font-black text-green-600">{check}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ❓ How to play */}
      {help && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4" onClick={() => setHelp(false)}>
         <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-[18px] bg-[#0D1128] p-4 text-[12px] leading-relaxed text-[#EAF0FF]">
          <p className="text-[14px] font-black text-amber-300">👑 How to play MIG Royale</p>
          <RoyaleGuide />
          <p className="mt-3 text-[12.5px] font-black text-amber-300">📜 Rules</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[#DCE3FF]">
            <li>Type !start or tap Start. Betting is open for 45 seconds.</li>
            <li>Bet on a side — 🔴 Red or 🔵 Blue pays 1.9x (your stake included).</li>
            <li>Or bet on the winning hand: Jutt 2.5x · Color 10x · Run 15x · Double Run 100x · Tirel 150x.</li>
            <li>A hand bet pays only when the WINNING side has that hand.</li>
            <li>Hands from best to worst: Tirel (three alike) › Double Run (pure sequence) › Run (sequence) › Color (same suit) › Jutt (pair) › High Card.</li>
            <li>Tie: Red and Blue bets come back; a hand bet on that hand still wins.</li>
            <li>The % under each hand is how often the winning side has it (Jutt 28% · Color 9% · Run 6% · D.Run 0.4% · Tirel 0.5%).</li>
            <li>Min 100 · max 200,000 per option a round · biggest win 5,000,000 a round. Double-tap a tile to bet at once.</li>
            <li>Chat: !bet red 500 · !bet double run 2k · !help</li>
          </ol>
          <p className="mt-2 text-center text-[11px] text-[#9BA6D6]">Tap anywhere to close</p>
         </div>
        </div>
      )}

      {showHistory && <RoyaleHistory history={state.history} />}

      {/* 📣 live bet ticker (the bet lines no longer fill the chat) */}
      {!collapsed && state.running && state.phase === "BETTING" && (
        <div className="mt-1 flex h-[20px] items-center gap-1.5 overflow-hidden rounded-full bg-black/30 px-2.5 text-[11px] font-bold text-[#C9D2F2]">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-green-500" />
          <span key={state.ticker?.at || 0} className="royale-tick truncate">
            {state.ticker ? state.ticker.text : "Waiting for bets…"}
          </span>
        </div>
      )}

      {!collapsed &&
        (revealing && reveal ? (
          <RoyaleReveal
            state={state}
            elapsed={Date.now() - reveal.start}
            lastOpen={lastOpen}
            onPeek={() => reveal && setPeekAt((p) => p ?? Math.max(BLUE_FLIPS[1] + 200, Date.now() - reveal.start))}
          />
        ) : state.running && state.phase === "SETTLING" ? (
          <p className="py-6 text-center text-sm font-bold text-[#9BA6D6]">🃏 Dealing cards…</p>
        ) : !state.running ? (
          <>
            {state.lastRed.length === 3 ? <RoyaleResultCard state={state} /> : <RoyaleLastResult state={state} />}
            <button
              type="button"
              onClick={state.start}
              disabled={state.busy}
              className={`mt-2 w-full rounded-xl py-2.5 text-sm font-black shadow-[0_6px_18px_rgba(0,0,0,.3)] disabled:opacity-50 ${
                state.lastRed.length === 3 ? "bg-gradient-to-r from-green-500 to-green-700" : "bg-gradient-to-r from-violet-500 to-purple-700"
              }`}
            >
              {state.busy ? "Starting…" : state.lastRed.length === 3 ? "▶ Next round" : "▶ Start MIG Royale"}
            </button>
          </>
        ) : (
          <>
            {/* Red VS Blue */}
            <div className="relative mt-1.5 grid grid-cols-2 gap-1.5">
              {ROYALE_OPTIONS.filter((o) => o.side).map((o) => {
                const red = o.key === "red";
                const sel = selected === o.key;
                const pool = state.pool[o.key];
                const mine = state.myBets[o.key] || 0;
                return (
                  <button
                    key={o.key}
                    data-opt={o.key}
                    type="button"
                    disabled={!canBet}
                    onClick={() => tap(o.key)}
                    onDoubleClick={() => quick(o.key)}
                    className="rounded-[12px] border-2 px-1 py-1 text-center transition disabled:opacity-60"
                    style={{
                      background: red ? "linear-gradient(160deg, rgba(239,68,68,.32), rgba(239,68,68,.08))" : "linear-gradient(200deg, rgba(59,130,246,.34), rgba(59,130,246,.08))",
                      borderColor: sel ? (red ? "#FF7A7A" : "#7DB2FF") : red ? "rgba(239,68,68,.45)" : "rgba(59,130,246,.45)",
                      boxShadow: sel ? (red ? "0 0 0 3px rgba(239,68,68,.25), 0 0 18px rgba(239,68,68,.35)" : "0 0 0 3px rgba(59,130,246,.25), 0 0 18px rgba(59,130,246,.35)") : undefined,
                    }}
                  >
                    <span className={`block text-[15px] font-black leading-tight ${red ? "text-[#FF8C8C]" : "text-[#8DBBFF]"}`}>
                      {o.label}
                      <span className="ml-1 rounded-full bg-white/[0.12] px-1.5 align-[2px] text-[10px] font-black text-white">{o.mult}</span>
                    </span>
                    {/* one line: coins in · people · my pill */}
                    <span className="flex items-center justify-center gap-1 text-[10px] font-bold tabular-nums text-[#C9D2F2]">
                      {pool ? `${shortK(pool.coins)} · 👥${pool.people}` : "no bets"}
                      {mine > 0 && <span className="rounded-full bg-amber-300 px-1.5 text-[9.5px] font-black text-[#3A2500]">You {shortK(mine)}</span>}
                    </span>
                  </button>
                );
              })}
              <span
                className="pointer-events-none absolute left-1/2 top-1/2 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[9.5px] font-black text-[#1A1200]"
                style={{ background: "radial-gradient(circle at 35% 30%, #FFF0B8, #F5C842 55%, #C8952A)", boxShadow: "0 0 0 3px #141A3A, 0 4px 12px rgba(0,0,0,.5)" }}
              >
                VS
              </span>
            </div>
            {/* tug bar: which side has more coins */}
            <div className="mt-1 flex items-center gap-1.5 text-[9px] font-extrabold tabular-nums text-[#9BA6D6]">
            <span>{redPct}%</span>
            <div className="flex h-[5px] flex-1 overflow-hidden rounded-full bg-[#20284F]">
              <i className="block h-full bg-gradient-to-r from-red-700 to-red-500 transition-[width] duration-500" style={{ width: `${redPct}%` }} />
              <i className="block h-full bg-gradient-to-r from-blue-500 to-blue-700 transition-[width] duration-500" style={{ width: `${100 - redPct}%` }} />
            </div>
            <span>{100 - redPct}%</span>
            </div>

            {/* Hands */}
            <div className="mt-1 grid grid-cols-5 gap-1">
              {hands.map((o) => {
                const sel = selected === o.key;
                const pool = state.pool[o.key];
                const mine = state.myBets[o.key] || 0;
                return (
                  <button
                    key={o.key}
                    data-opt={o.key}
                    type="button"
                    disabled={!canBet}
                    onClick={() => tap(o.key)}
                    onDoubleClick={() => quick(o.key)}
                    className={`relative rounded-[10px] border-[1.5px] px-0.5 py-0.5 text-center disabled:opacity-60 ${
                      sel ? "border-violet-400 bg-violet-600/30 shadow-[0_0_14px_rgba(124,58,237,.4)]" : "border-white/10 bg-white/[0.06]"
                    }`}
                  >
                    {hot === o.key && <span className="absolute -right-0.5 -top-2 text-[11px]">🔥</span>}
                    <b className="block truncate text-[10.5px] font-black">{o.key === "doublerun" ? "D.Run" : o.label}</b>
                    <em className="block text-[13px] font-black not-italic leading-tight text-amber-300">{o.mult}</em>
                    {/* chance until someone bets, then coins · people; my bet as a pill */}
                    {mine > 0 ? (
                      <span className="inline-block rounded-full bg-amber-300 px-1 text-[8.5px] font-black text-[#3A2500]">You {shortK(mine)}</span>
                    ) : (
                      <small className={`block truncate text-[8.5px] font-bold tabular-nums ${pool ? "text-[#9BA6D6]" : "text-[#C4B5FD]"}`}>
                        {pool ? `${shortK(pool.coins)} · 👥${pool.people}` : HAND_ODDS[o.key]}
                      </small>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Amount chips */}
            <div className="mt-1.5 flex gap-1">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  data-chip={c}
                  type="button"
                  onClick={() => setAmount(c)}
                  className={`flex-1 rounded-full border py-[3px] text-[11px] font-black ${
                    amount === c ? "border-amber-300 bg-amber-300 text-[#3A2500]" : "border-white/[0.12] bg-white/[0.07] text-[#DCE3FF]"
                  }`}
                >
                  {c >= 1000 ? `${c / 1000}k` : c}
                </button>
              ))}
              {/* ✎ any amount: type it here */}
              <input
                id="royale-custom-amount"
                type="text"
                inputMode="numeric"
                placeholder="✎"
                value={CHIPS.includes(amount) ? "" : String(amount)}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, "").slice(0, 6));
                  if (n > 0) setAmount(n);
                  else setAmount(CHIPS[0]);
                }}
                className={`w-[52px] rounded-full border px-1 py-[3px] text-center text-[11px] font-black outline-none placeholder:text-[#DCE3FF] ${
                  CHIPS.includes(amount) ? "border-white/[0.12] bg-white/[0.07] text-[#DCE3FF]" : "border-amber-300 bg-amber-300 text-[#3A2500]"
                }`}
                aria-label="Custom amount"
              />
            </div>
            {!CHIPS.includes(amount) && (amount < 100 || amount > 200000) && (
              <p className="mt-0.5 text-center text-[10px] font-bold text-red-400">Bets are 100 – 200,000</p>
            )}

            {/* ↻ Same + Bet */}
            <div className="mt-1.5 grid grid-cols-[auto_auto_1fr] gap-1.5">
              <button
                type="button"
                disabled={!canBet || !state.lastBet || state.busy}
                onClick={() => state.lastBet && state.bet(state.lastBet.option, state.lastBet.amount)}
                title="Repeat my last bet"
                className="rounded-xl border border-white/[0.14] bg-white/[0.08] px-2.5 text-[11px] font-black text-[#DCE3FF] disabled:opacity-40"
              >
                ↻ Same
              </button>
              {/* ⭐ My usual: save this round's mix once, then one tap places it every round */}
              <span className="flex">
                <button
                  type="button"
                  disabled={!canBet || state.busy || (!usual && Object.keys(state.myBets).length === 0)}
                  onClick={() => {
                    if (!usual) {
                      const mix = Object.entries(state.myBets).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)] as [string, number]);
                      if (mix.length) {
                        saveUsual(mix);
                        setUsual(mix);
                      }
                      return;
                    }
                    if (placingUsual.current) return;
                    placingUsual.current = true;
                    usual.forEach(([o, a], i) => setTimeout(() => state.bet(o, a), i * 1300));
                    setTimeout(() => (placingUsual.current = false), usual.length * 1300);
                  }}
                  title={usual ? usual.map(([o, a]) => `${shortK(a)} ${o}`).join(" + ") : "Bet first, then tap to save this mix"}
                  className="rounded-l-xl border border-amber-300/40 bg-amber-300/10 px-2 text-[11px] font-black text-amber-200 disabled:opacity-40"
                >
                  {usual ? `⭐ ${usual.map(([o, a]) => `${shortK(a)} ${ROYALE_OPTIONS.find((x) => x.key === o)?.label || o}`).join(" + ").slice(0, 22)}` : "⭐ Save usual"}
                </button>
                {usual && (
                  <button
                    type="button"
                    onClick={() => {
                      saveUsual(null);
                      setUsual(null);
                    }}
                    title="Forget my usual"
                    className="rounded-r-xl border border-l-0 border-amber-300/40 bg-amber-300/10 px-1.5 text-[11px] font-black text-amber-200"
                  >
                    ✕
                  </button>
                )}
              </span>
              <button
                type="button"
                disabled={!ready}
                onClick={() => opt && state.bet(opt.key, amount)}
                className={`rounded-xl py-1.5 text-[13px] font-black text-white disabled:opacity-60 ${
                  flash ? "bg-gradient-to-r from-green-600 to-green-700" : "bg-gradient-to-r from-violet-500 to-violet-700 shadow-[0_6px_16px_rgba(124,58,237,.4)]"
                }`}
              >
                {flash
                  ? "✓ Bet placed"
                  : !canBet
                    ? "🃏 Dealing cards…"
                    : !opt
                      ? "Tap a side or a hand"
                      : state.busy
                        ? "Placing bet…"
                        : `🎯 Bet ${shortK(amount)} on ${opt.label}`}
              </button>
            </div>

            <RoyaleRoad history={state.history} compact />
            <RoyaleTodayTop list={state.todayTop} />
          </>
        ))}
    </div>
  );
}

const REVEAL_MS = 5200;
// when each card turns over (ms from the start): Red 1-2-3, then Blue 1-2, then the last card slowly
const RED_FLIPS = [450, 950, 1450];
const BLUE_FLIPS = [2350, 2850, 3900];

function CardBack({ size = "md", small }: { size?: "md" | "lg"; small?: boolean }) {
  return (
    <span
      className={`inline-block rounded-md border-2 border-white/60 ${small ? "h-9 w-7" : size === "lg" ? "h-[62px] w-11" : "h-12 w-9"}`}
      style={{ background: "repeating-linear-gradient(45deg, #5B3FC9 0 4px, #6E54DA 4px 8px)" }}
    />
  );
}

/** 🃏 The reveal: "Revealing Red…" → three red cards turn, then "Blue hand…" →
 *  two blue cards, then "the last card…" slowly → who won. */
function RoyaleReveal({ state, elapsed, lastOpen, onPeek }: { state: RoyaleState; elapsed: number; lastOpen: number; onPeek: () => void }) {
  const flips = [BLUE_FLIPS[0], BLUE_FLIPS[1], lastOpen];
  const redShown = RED_FLIPS.filter((t) => elapsed >= t).length;
  const blueShown = flips.filter((t) => elapsed >= t).length;
  const done = elapsed >= lastOpen + 500;
  // 🔊 a soft "flip" each time a card turns
  const shownNow = redShown + blueShown;
  const lastShown = useRef(0);
  useEffect(() => {
    if (shownNow > lastShown.current) royaleSound("flip");
    lastShown.current = shownNow;
  }, [shownNow]);
  // 👆 squeeze: drag the last Blue card up to peek at it
  const [lift, setLift] = useState(0);
  const dragY = useRef<number | null>(null);
  const canSqueeze = blueShown === 2 && elapsed >= BLUE_FLIPS[1];
  const title = done
    ? state.lastWinner === "tie"
      ? "🤝 It's a tie!"
      : `🏆 ${state.lastWinner === "red" ? "Red" : "Blue"} wins!`
    : elapsed < 2000
      ? "Revealing Red…"
      : canSqueeze
        ? "Blue's last card — drag it up to peek 👆"
        : "Revealing Blue…";
  const side = (key: "red" | "blue", cards: string[], shown: number, hand: string) => {
    const red = key === "red";
    const won = done && state.lastWinner === key;
    return (
      <div
        className={`flex flex-col items-center rounded-[14px] border-2 px-1 py-2 transition ${won ? "scale-[1.03]" : ""}`}
        style={{
          background: red ? "rgba(239,68,68,.14)" : "rgba(59,130,246,.16)",
          borderColor: won ? "#FCD34D" : red ? "rgba(239,68,68,.45)" : "rgba(59,130,246,.45)",
          boxShadow: won ? "0 0 18px rgba(252,211,77,.45)" : undefined,
        }}
      >
        <span className={`text-[11px] font-black ${red ? "text-[#FF8C8C]" : "text-[#8DBBFF]"}`}>{red ? "🔴 Red hand" : "🔵 Blue hand"}</span>
        <span className="mt-1 flex gap-1">
          {cards.map((c, i) =>
            i < shown ? (
              <span key={`f${i}`} className="fx-pop inline-block">
                <MiniCard card={c} size="md" />
              </span>
            ) : !red && i === 2 && canSqueeze ? (
              <span
                key="sq"
                className="relative inline-block cursor-grab touch-none overflow-hidden rounded-md"
                onPointerDown={(e) => {
                  dragY.current = e.clientY;
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (dragY.current === null) return;
                  const d = Math.max(0, dragY.current - e.clientY);
                  setLift(Math.min(100, d * 2.5));
                  if (d > 34) onPeek();
                }}
                onPointerUp={() => {
                  dragY.current = null;
                  setLift(0);
                }}
              >
                <MiniCard card={c} size="md" />
                <span className="absolute inset-0" style={{ transform: `translateY(${-lift}%)` }}>
                  <CardBack />
                </span>
              </span>
            ) : (
              <CardBack key={`b${i}`} />
            )
          )}
        </span>
        <span className="mt-1 h-4 text-[10.5px] font-bold text-[#DCE3FF]">{shown === 3 ? hand : ""}</span>
      </div>
    );
  };
  return (
    <div className="mt-2">
      <p className={`text-center text-[13px] font-black ${done ? "text-amber-300" : "text-[#C9D2F2]"}`}>{title}</p>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {side("red", state.lastRed, redShown, state.lastRedHand)}
        {side("blue", state.lastBlue, blueShown, state.lastBlueHand)}
      </div>
    </div>
  );
}

/** 🏆 After the round: who won, both hands, and what was paid. */
function RoyaleResultCard({ state }: { state: RoyaleState }) {
  const sm = state.summary && (state.summary.round === state.lastRound || state.lastRound === 0) ? state.summary : null;
  const tie = state.lastWinner === "tie";
  const winHand = state.lastWinner === "red" ? state.lastRedHand : state.lastBlueHand;
  return (
    <div className="mt-2">
      <p className="text-center text-[13px] font-black text-amber-300">
        {tie ? "🤝 Tie — Red & Blue bets refunded" : `🏆 ${state.lastWinner === "red" ? "Red" : "Blue"} wins with ${winHand}`}
      </p>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {(["red", "blue"] as const).map((key) => {
          const red = key === "red";
          const won = state.lastWinner === key;
          const cards = red ? state.lastRed : state.lastBlue;
          return (
            <div
              key={key}
              className="flex flex-col items-center rounded-[14px] border-2 px-1 py-1.5"
              style={{
                background: red ? "rgba(239,68,68,.12)" : "rgba(59,130,246,.14)",
                borderColor: won ? "#FCD34D" : "rgba(255,255,255,.12)",
                opacity: won || tie ? 1 : 0.75,
              }}
            >
              <span className={`text-[10.5px] font-black ${red ? "text-[#FF8C8C]" : "text-[#8DBBFF]"}`}>{red ? "🔴 Red hand" : "🔵 Blue hand"}</span>
              <span className="mt-1 flex gap-1">
                {cards.map((c, i) => (
                  <MiniCard key={i} card={c} size="sm" />
                ))}
              </span>
              <span
                className={`mt-1 rounded-full px-2 text-[10px] font-black ${won ? "bg-amber-300 text-[#3A2500]" : "text-[#C9D2F2]"}`}
              >
                {red ? state.lastRedHand : state.lastBlueHand}
              </span>
            </div>
          );
        })}
      </div>
      {(() => {
        // 👤 my own result of that round
        const staked = Object.values(state.myBets).reduce((a, v) => a + (Number(v) || 0), 0);
        if (staked <= 0) return null;
        const back = myWinOf(state.myBets, state.lastWinner, state.lastWinHand);
        const profit = back - staked;
        return (
          <div className="relative mt-1.5 text-center">
            {profit > 0 && <RoyaleConfetti />}
            <p className={`text-[12px] font-black ${profit > 0 ? "text-green-400" : back > 0 ? "text-amber-200" : "text-red-300"}`}>
              {profit > 0
                ? `You won ${profit.toLocaleString("en-US")} coins (${back.toLocaleString("en-US")} back on ${staked.toLocaleString("en-US")})`
                : back > 0
                  ? `You got ${back.toLocaleString("en-US")} back on ${staked.toLocaleString("en-US")}`
                  : `You lost ${staked.toLocaleString("en-US")} coins`}
            </p>
          </div>
        );
      })()}
      {sm && sm.players > 0 && (
        <div className="mt-1.5 flex flex-col items-center gap-1 text-[11px] font-bold text-[#C9D2F2]">
          <span>
            {sm.winningBets} winning {sm.winningBets === 1 ? "bet" : "bets"} · {shortK(sm.paidOut)} paid out
          </span>
          {(() => {
            // winners: the top one, and me (if I made a profit)
            const staked = Object.values(state.myBets).reduce((a, v) => a + (Number(v) || 0), 0);
            const mine = staked > 0 ? myWinOf(state.myBets, state.lastWinner, state.lastWinHand) - staked : 0;
            if (!sm.top && mine <= 0) return null;
            return (
              <span className="flex flex-wrap justify-center gap-1">
                {sm.top && (
                  <span className="rounded-full bg-amber-300/15 px-2 py-0.5 font-black text-amber-300">
                    🥇 {sm.top.name} +{shortK(sm.top.profit)}
                  </span>
                )}
                {mine > 0 && <span className="rounded-full bg-green-400/15 px-2 py-0.5 font-black text-green-400">🙋 You +{shortK(mine)}</span>}
              </span>
            );
          })()}
          {sm.gotBack > 0 && (
            <span className="text-[10px] text-[#9BA6D6]">
              ↩ {sm.gotBack} {sm.gotBack === 1 ? "player" : "players"} got some back
            </span>
          )}
        </div>
      )}
      <RoyaleRoad history={state.history} />
      <RoyaleTodayTop list={state.todayTop} />
    </div>
  );
}

/** 🔵🔴 Bead road: the last 32 results in a 4-row grid (oldest left), with counts and the streak. */
function RoyaleRoad({ history, compact }: { history: HistoryItem[]; compact?: boolean }) {
  if (history.length === 0) return null;
  if (compact) {
    // while betting: one thin row of the last 16 results
    let st = 0;
    for (const h of history) {
      if (h.winner === history[0].winner) st++;
      else break;
    }
    return (
      <div className="mt-1 flex items-center gap-[3px] rounded-[9px] bg-black/25 px-2 py-1">
        {history
          .slice(0, 16)
          .reverse()
          .map((h, i) => (
            <i
              key={i}
              className={`grid h-[10px] w-[10px] shrink-0 place-items-center rounded-full text-[6.5px] font-black not-italic leading-none text-white ${h.winner === "red" ? "bg-red-500" : h.winner === "blue" ? "bg-blue-500" : "bg-neutral-400"}`}
            >
              {HAND_LETTER[h.hand] || ""}
            </i>
          ))}
        <span className="ml-auto whitespace-nowrap text-[9px] font-black text-[#8DBBFF]">
          {history[0].winner === "red" || history[0].winner === "blue" ? `${history[0].winner === "red" ? "Red" : "Blue"} ×${st} · ` : ""}🔴{history.filter((h) => h.winner === "red").length} 🔵{history.filter((h) => h.winner === "blue").length}
        </span>
      </div>
    );
  }
  const list = history.slice(0, 32).reverse();
  const red = history.filter((h) => h.winner === "red").length;
  const blue = history.filter((h) => h.winner === "blue").length;
  let streak = 0;
  for (const h of history) {
    if (h.winner === history[0].winner) streak++;
    else break;
  }
  const w = history[0].winner;
  return (
    <div className="mt-1.5 rounded-[10px] bg-black/25 px-2 py-1.5">
      <div className="grid grid-flow-col grid-rows-4 justify-start gap-[3px]" style={{ gridAutoColumns: "11px" }}>
        {list.map((h, i) => (
          <i
            key={i}
            title={`#${h.round} ${h.winner} — ${h.hand}`}
            className={`grid h-[11px] w-[11px] place-items-center rounded-full text-[7px] font-black not-italic leading-none text-white ${h.winner === "red" ? "bg-red-500" : h.winner === "blue" ? "bg-blue-500" : "bg-neutral-400"}`}
          >
            {HAND_LETTER[h.hand] || ""}
          </i>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] font-black tabular-nums text-[#9BA6D6]">
        <span>
          🔴 {red} · 🔵 {blue}
        </span>
        {(w === "red" || w === "blue") && <span className="text-[#8DBBFF]">{`${w === "red" ? "Red" : "Blue"} ×${streak}`}</span>}
      </div>
    </div>
  );
}

/** 🏆 Today's three biggest winners (server: todayTop, Bangladesh day). */
function RoyaleTodayTop({ list }: { list: { name: string; profit: number }[] }) {
  if (list.length === 0) return null;
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1 text-[10px] font-black">
      <span className="text-[#9BA6D6]">🏆 Today</span>
      {list.slice(0, 3).map((x, i) => (
        <span key={x.name} className="rounded-full bg-amber-300/15 px-1.5 text-amber-300">
          {medals[i]} {x.name} +{shortK(x.profit)}
        </span>
      ))}
    </div>
  );
}

// Real chance that the WINNING side has this hand (what a hand bet needs) —
// the better of two 3-card hands, so higher than one hand's chance.
const HAND_ODDS: Record<string, string> = { jutt: "28%", color: "9%", run: "6%", doublerun: "0.4%", tirel: "0.5%" };

/** My winnings of a round from my bets and the result (same rules as the server). */
function myWinOf(bets: Record<string, number>, winner: string, winHand: string): number {
  let win = 0;
  for (const [k, v] of Object.entries(bets)) {
    const amt = Number(v) || 0;
    const o = ROYALE_OPTIONS.find((x) => x.key === k);
    if (!o || amt <= 0) continue;
    const mult = parseFloat(o.mult) || 0;
    if (o.side) win += winner === "tie" ? amt : k === winner ? Math.floor(amt * mult) : 0;
    else if (o.label === winHand) win += Math.floor(amt * mult);
  }
  return win;
}

const USUAL_KEY = "migwith.royaleUsual";
function readUsual(): [string, number][] | null {
  try {
    const v = JSON.parse(localStorage.getItem(USUAL_KEY) || "null");
    return Array.isArray(v) && v.length ? (v as [string, number][]) : null;
  } catch {
    return null;
  }
}
function saveUsual(v: [string, number][] | null) {
  try {
    if (v) localStorage.setItem(USUAL_KEY, JSON.stringify(v));
    else localStorage.removeItem(USUAL_KEY);
  } catch {}
}

/** 🪙 A chip flies from the chip row onto the tile I bet on. */
function flyChip(box: HTMLElement | null, amount: number, option: string) {
  if (!box || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const from = box.querySelector(`[data-chip="${amount}"]`) || box.querySelector("[data-chip]");
  const to = box.querySelector(`[data-opt="${option}"]`);
  if (!from || !to) return;
  const b = box.getBoundingClientRect();
  const f = from.getBoundingClientRect();
  const t = to.getBoundingClientRect();
  const chip = document.createElement("span");
  chip.className = "royale-chip";
  chip.style.left = `${f.left - b.left + f.width / 2 - 11}px`;
  chip.style.top = `${f.top - b.top + f.height / 2 - 11}px`;
  box.appendChild(chip);
  chip.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${t.left - f.left + (t.width - f.width) / 2}px, ${t.top - f.top + (t.height - f.height) / 2}px) scale(.8)`, opacity: 0.9 },
    ],
    { duration: 450, easing: "cubic-bezier(.3,.7,.3,1)" }
  ).onfinish = () => chip.remove();
}

/** 🔊 Short game sounds made on the phone (no files): chip click, card flip, win jingle. Off with 🔇. */
let audioCtx: AudioContext | null = null;
function royaleSound(kind: "chip" | "flip" | "win") {
  if (typeof window === "undefined") return;
  const mode = readRoyalePrefs().sound;
  if (mode !== "on") {
    if (mode === "vibrate" && kind !== "flip") {
      try {
        navigator.vibrate?.(kind === "win" ? 120 : 20);
      } catch {}
    }
    return;
  }
  try {
    audioCtx = audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx!;
    const tone = (freq: number, at: number, dur: number, type: OscillatorType, vol: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + dur + 0.02);
    };
    if (kind === "chip") {
      tone(2100, 0, 0.05, "square", 0.05);
      tone(1500, 0.04, 0.06, "square", 0.04);
    } else if (kind === "flip") {
      tone(420, 0, 0.07, "triangle", 0.08);
    } else {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, "triangle", 0.12));
    }
  } catch {}
}

function RoyaleLastResult({ state }: { state: RoyaleState }) {
  if (state.lastRed.length !== 3 || state.lastBlue.length !== 3) {
    return (
      <p className="mt-2 text-center text-xs text-white/45">
        Red vs Blue — bet on a side or a hand type. Type !start or tap Start.
      </p>
    );
  }
  const sides: [string, string[], string][] = [
    ["red", state.lastRed, state.lastRedHand],
    ["blue", state.lastBlue, state.lastBlueHand],
  ];
  return (
    <div className="mt-2">
      <div className="grid grid-cols-2 gap-2">
        {sides.map(([side, cards, hand]) => {
          const won = state.lastWinner === side;
          const red = side === "red";
          return (
            <div
              key={side}
              className={`flex flex-col items-center rounded-xl border p-2 ${
                red ? "border-red-500/50 bg-red-500/10" : "border-blue-500/50 bg-blue-500/10"
              } ${won ? "ring-2 ring-amber-300/70" : "opacity-80"}`}
            >
              <div className={`text-xs font-black ${red ? "text-red-300" : "text-blue-300"}`}>
                {red ? "🔴 Red" : "🔵 Blue"} {won && "🏆"}
              </div>
              <div className="mt-1 flex gap-1">
                {cards.map((c, i) => (
                  <MiniCard key={i} card={c} />
                ))}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-white/70">{hand}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-1 text-center text-[10px] text-white/35">
        Round #{state.lastRound}
        {state.lastWinner === "tie" ? " · 🤝 Tie — side bets were refunded" : ""}
      </p>
    </div>
  );
}

function RoyaleHistory({ history }: { history: HistoryItem[] }) {
  if (history.length === 0) {
    return <p className="mt-2 text-center text-xs text-white/40">No results yet.</p>;
  }
  const red = history.filter((h) => h.winner === "red").length;
  const blue = history.filter((h) => h.winner === "blue").length;
  const tie = history.length - red - blue;
  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-black/30 p-2">
      <p className="text-xs font-bold">
        Last {history.length}: 🔴 {red} · 🔵 {blue}
        {tie > 0 ? ` · 🤝 ${tie}` : ""}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {history.map((h, i) => (
          <span
            key={i}
            title={`#${h.round} ${h.winner} — ${h.hand}`}
            className={`h-3.5 w-3.5 rounded-full ${
              h.winner === "red" ? "bg-red-500" : h.winner === "blue" ? "bg-blue-500" : "bg-neutral-400"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

const shortK = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);


// ⚙ MIG Royale settings on this device (⋯ menu): bet lines in chat, hide game messages, sound.
type RoyalePrefs = { betLines: boolean; hideGame: boolean; sound: "on" | "vibrate" | "off" };
const ROYALE_PREFS_KEY = "migwith.royalePrefs";
const prefsListeners = new Set<() => void>();
let prefsCache: RoyalePrefs | null = null;
export function readRoyalePrefs(): RoyalePrefs {
  if (prefsCache) return prefsCache;
  let v: Partial<RoyalePrefs> = {};
  try {
    v = JSON.parse(localStorage.getItem(ROYALE_PREFS_KEY) || "{}");
  } catch {}
  prefsCache = { betLines: v.betLines === true, hideGame: v.hideGame === true, sound: v.sound === "vibrate" || v.sound === "off" ? v.sound : "on" };
  return prefsCache;
}
export function setRoyalePref<K extends keyof RoyalePrefs>(k: K, val: RoyalePrefs[K]) {
  prefsCache = { ...readRoyalePrefs(), [k]: val };
  try {
    localStorage.setItem(ROYALE_PREFS_KEY, JSON.stringify(prefsCache));
  } catch {}
  prefsListeners.forEach((f) => f());
}
/** Live settings (re-renders when changed from the ⋯ menu). */
export function useRoyalePrefs(): RoyalePrefs {
  const [p, setP] = useState<RoyalePrefs>(() => (typeof window === "undefined" ? { betLines: false, hideGame: false, sound: "on" } : readRoyalePrefs()));
  useEffect(() => {
    const f = () => setP(readRoyalePrefs());
    prefsListeners.add(f);
    f();
    return () => {
      prefsListeners.delete(f);
    };
  }, []);
  return p;
}

// a letter on a result bead when the round was won by a big hand (High Card = no letter)
const HAND_LETTER: Record<string, string> = { Jutt: "J", Color: "C", Run: "R", "Double Run": "D", Tirel: "T" };

/** 🎊 a little confetti burst over my win. */
function RoyaleConfetti() {
  const colors = ["#FCD34D", "#F472B6", "#60A5FA", "#34D399", "#F87171", "#A78BFA"];
  return (
    <span className="pointer-events-none absolute inset-x-0 -top-6 h-0" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => (
        <i
          key={i}
          className="royale-confetti absolute block h-[6px] w-[4px] rounded-[1px]"
          style={{
            left: `${5 + ((i * 53) % 90)}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 6) * 0.07}s`,
            ["--dx" as string]: `${((i * 37) % 40) - 20}px`,
          }}
        />
      ))}
    </span>
  );
}
