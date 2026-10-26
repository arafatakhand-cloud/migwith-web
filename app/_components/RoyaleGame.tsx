"use client";

import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { MiniCard } from "./Cards";
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

  // 👥 Everyone's bets this round (royale_bets where roundNumber == round): per-option
  // "coins in · N bettors", so a player can see their bet really landed.
  useEffect(() => {
    if (!enabled || !uid || round <= 0) {
      setPool({});
      return;
    }
    return onSnapshot(
      query(collection(db, "room_game", ROYALE_ROOM, "royale_bets"), where("roundNumber", "==", round)),
      (snap) => {
        const out: Record<string, { coins: number; people: number }> = {};
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
  const [flash, setFlash] = useState(false);
  const prevMine = useRef(0);

  // A new round clears the pick.
  useEffect(() => setSelected(null), [state.round]);
  // folded unless I have a bet in this round (kept open 90 s after, like the app)
  useGameAutoFold(state.running && Object.values(state.myBets).some((v) => v > 0), setCollapsed, 90_000);
  // ✓ "Bet placed" for a moment whenever my total on the table grows
  const myTotal = Object.values(state.myBets).reduce((a, v) => a + Number(v || 0), 0);
  useEffect(() => {
    if (myTotal > prevMine.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1500);
      prevMine.current = myTotal;
      return () => clearTimeout(t);
    }
    prevMine.current = myTotal;
  }, [myTotal]);

  const canBet = state.running && state.phase === "BETTING" && state.secondsLeft > 0;
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
      className="m-1.5 rounded-[18px] px-2.5 pb-2.5 pt-2 text-[#EAF0FF] shadow-[0_10px_30px_rgba(8,12,30,.35)]"
      style={{ background: "radial-gradient(130% 80% at 50% 0%, #26306A 0%, #141A3A 55%, #0D1128 100%)" }}
    >
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
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          title="Last results"
          className={`${state.running && state.poolTotal > 0 ? "" : "ml-auto"} rounded-lg border border-white/15 px-1.5 text-sm hover:bg-white/10`}
        >
          📊
        </button>
        {collapsed && state.running && <LiveWatch onWatch={() => setCollapsed(false)} />}
        <button type="button" onClick={() => setCollapsed((v) => !v)} className="rounded-lg border border-white/15 px-2 text-sm text-white/70 hover:bg-white/10">
          {collapsed ? "+" : "−"}
        </button>
      </div>

      {showHistory && <RoyaleHistory history={state.history} />}

      {!collapsed &&
        (!state.running ? (
          <>
            <RoyaleLastResult state={state} />
            <button
              type="button"
              onClick={state.start}
              disabled={state.busy}
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-violet-500 to-purple-700 py-2.5 text-sm font-black shadow-[0_6px_18px_rgba(124,58,237,.45)] disabled:opacity-50"
            >
              {state.busy ? "Starting…" : "▶ Start MIG Royale"}
            </button>
          </>
        ) : (
          <>
            {/* Red VS Blue */}
            <div className="relative mt-2 grid grid-cols-2 gap-1.5">
              {ROYALE_OPTIONS.filter((o) => o.side).map((o) => {
                const red = o.key === "red";
                const sel = selected === o.key;
                const pool = state.pool[o.key];
                const mine = state.myBets[o.key] || 0;
                return (
                  <button
                    key={o.key}
                    type="button"
                    disabled={!canBet}
                    onClick={() => tap(o.key)}
                    onDoubleClick={() => quick(o.key)}
                    className="rounded-[14px] border-2 px-1 pb-1.5 pt-1.5 text-center transition disabled:opacity-60"
                    style={{
                      background: red ? "linear-gradient(160deg, rgba(239,68,68,.32), rgba(239,68,68,.08))" : "linear-gradient(200deg, rgba(59,130,246,.34), rgba(59,130,246,.08))",
                      borderColor: sel ? (red ? "#FF7A7A" : "#7DB2FF") : red ? "rgba(239,68,68,.45)" : "rgba(59,130,246,.45)",
                      boxShadow: sel ? (red ? "0 0 0 3px rgba(239,68,68,.25), 0 0 18px rgba(239,68,68,.35)" : "0 0 0 3px rgba(59,130,246,.25), 0 0 18px rgba(59,130,246,.35)") : undefined,
                    }}
                  >
                    <span className="flex justify-center gap-[2px]" aria-hidden>
                      {[0, 1, 2].map((i) => (
                        <i
                          key={i}
                          className="h-[20px] w-[14px] rounded-[3px] border border-white/55"
                          style={{ background: "repeating-linear-gradient(45deg, #5B3FC9 0 3px, #6E54DA 3px 6px)" }}
                        />
                      ))}
                    </span>
                    <span className={`mt-0.5 block text-[16px] font-black leading-tight ${red ? "text-[#FF8C8C]" : "text-[#8DBBFF]"}`}>
                      {o.label}
                      <span className="ml-1 rounded-full bg-white/[0.12] px-1.5 align-[2px] text-[10px] font-black text-white">{o.mult}</span>
                    </span>
                    <span className="block text-[10px] font-bold tabular-nums text-[#C9D2F2]">
                      {pool ? `${shortK(pool.coins)} in · 👥${pool.people}` : "no bets yet"}
                    </span>
                    {mine > 0 && <span className="mt-0.5 inline-block rounded-full bg-amber-300 px-1.5 text-[9.5px] font-black text-[#3A2500]">You {shortK(mine)}</span>}
                  </button>
                );
              })}
              <span
                className="pointer-events-none absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[10.5px] font-black text-[#1A1200]"
                style={{ background: "radial-gradient(circle at 35% 30%, #FFF0B8, #F5C842 55%, #C8952A)", boxShadow: "0 0 0 3px #141A3A, 0 4px 12px rgba(0,0,0,.5)" }}
              >
                VS
              </span>
            </div>
            {/* tug bar: which side has more coins */}
            <div className="mt-1.5 flex h-[6px] overflow-hidden rounded-full bg-[#20284F]">
              <i className="block h-full bg-gradient-to-r from-red-700 to-red-500 transition-[width] duration-500" style={{ width: `${redPct}%` }} />
              <i className="block h-full bg-gradient-to-r from-blue-500 to-blue-700 transition-[width] duration-500" style={{ width: `${100 - redPct}%` }} />
            </div>
            <div className="mt-0.5 flex justify-between text-[9.5px] font-extrabold tabular-nums text-[#9BA6D6]">
              <span>Red {redPct}%</span>
              <span>Blue {100 - redPct}%</span>
            </div>

            {/* Hands */}
            <div className="mt-1.5 grid grid-cols-5 gap-1">
              {hands.map((o) => {
                const sel = selected === o.key;
                const pool = state.pool[o.key];
                const mine = state.myBets[o.key] || 0;
                return (
                  <button
                    key={o.key}
                    type="button"
                    disabled={!canBet}
                    onClick={() => tap(o.key)}
                    onDoubleClick={() => quick(o.key)}
                    className={`relative rounded-[10px] border-[1.5px] px-0.5 pb-1 pt-1 text-center disabled:opacity-60 ${
                      sel ? "border-violet-400 bg-violet-600/30 shadow-[0_0_14px_rgba(124,58,237,.4)]" : "border-white/10 bg-white/[0.06]"
                    }`}
                  >
                    {hot === o.key && <span className="absolute -right-0.5 -top-2 text-[11px]">🔥</span>}
                    <b className="block truncate text-[10.5px] font-black">{o.key === "doublerun" ? "D.Run" : o.label}</b>
                    <em className="block text-[14px] font-black not-italic leading-tight text-amber-300">{o.mult}</em>
                    <small className="block truncate text-[8.5px] font-bold tabular-nums text-[#9BA6D6]">{pool ? `${shortK(pool.coins)} · 👥${pool.people}` : "—"}</small>
                    {mine > 0 && <span className="mt-0.5 inline-block rounded-full bg-amber-300 px-1 text-[8.5px] font-black text-[#3A2500]">You {shortK(mine)}</span>}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-center text-[9px] text-[#8D97C4]">Hand bets pay only when the winning side has that hand · double-tap to bet</p>

            {/* Amount chips */}
            <div className="mt-1.5 flex gap-1">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAmount(c)}
                  className={`flex-1 rounded-full border py-1 text-[11px] font-black ${
                    amount === c ? "border-amber-300 bg-amber-300 text-[#3A2500]" : "border-white/[0.12] bg-white/[0.07] text-[#DCE3FF]"
                  }`}
                >
                  {c >= 1000 ? `${c / 1000}k` : c}
                </button>
              ))}
            </div>

            {/* ↻ Same + Bet */}
            <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-1.5">
              <button
                type="button"
                disabled={!canBet || !state.lastBet || state.busy}
                onClick={() => state.lastBet && state.bet(state.lastBet.option, state.lastBet.amount)}
                title="Repeat my last bet"
                className="rounded-xl border border-white/[0.14] bg-white/[0.08] px-2.5 text-[11px] font-black text-[#DCE3FF] disabled:opacity-40"
              >
                ↻ Same
              </button>
              <button
                type="button"
                disabled={!ready}
                onClick={() => opt && state.bet(opt.key, amount)}
                className={`rounded-xl py-2 text-[13px] font-black text-white disabled:opacity-60 ${
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

            <RoyaleStreak history={state.history} />
          </>
        ))}
    </div>
  );
}

/** The last results as dots, with Red / Blue counts and the current streak. */
function RoyaleStreak({ history }: { history: HistoryItem[] }) {
  if (history.length === 0) return null;
  const list = history.slice(0, 14);
  const red = history.filter((h) => h.winner === "red").length;
  const blue = history.filter((h) => h.winner === "blue").length;
  let streak = 0;
  for (const h of history) {
    if (h.winner === history[0].winner) streak++;
    else break;
  }
  const w = history[0].winner;
  return (
    <div className="mt-1.5 flex items-center gap-[3px] rounded-[10px] bg-black/25 px-2 py-1">
      {list
        .slice()
        .reverse()
        .map((h, i) => (
          <i
            key={i}
            title={`#${h.round} ${h.winner} — ${h.hand}`}
            className={`h-[11px] w-[11px] shrink-0 rounded-full ${h.winner === "red" ? "bg-red-500" : h.winner === "blue" ? "bg-blue-500" : "bg-neutral-400"}`}
          />
        ))}
      <span className="ml-auto whitespace-nowrap rounded-full bg-blue-500/20 px-1.5 text-[9.5px] font-black text-[#8DBBFF]">
        {w === "red" || w === "blue" ? `${w === "red" ? "Red" : "Blue"} ×${streak} · ` : ""}🔴{red} 🔵{blue}
      </span>
    </div>
  );
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
