"use client";

import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { MiniCard } from "./Cards";
import { isClassicNow } from "../../lib/uiStyle";
import { useRememberedAmount } from "../../lib/amountMemory";
import { useGameAutoFold } from "../../lib/gameBoxFold";
import { LiveWatch } from "./LiveWatch";

// 📟 Classic app style: the purple accent becomes blue (team red / blue stay).
const royaleBtn = () => (isClassicNow() ? "from-[#5A8FD6] to-[#2F6ABD]" : "from-violet-500 to-purple-700");

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

export function RoyaleTable({ state }: { state: RoyaleState }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useRememberedAmount("royale_bet", 500);
  const [collapsed, setCollapsed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // A new round clears the pick.
  useEffect(() => setSelected(null), [state.round]);
  // folded unless I have a bet in this round (kept open 90 s after, like the app)
  useGameAutoFold(state.running && Object.values(state.myBets).some((v) => v > 0), setCollapsed, 90_000);

  const canBet = state.running && state.phase === "BETTING" && state.secondsLeft > 0;
  const opt = ROYALE_OPTIONS.find((o) => o.key === selected);
  const ready = canBet && !!opt && !state.busy;

  return (
    <div className="border-t border-violet-300/20 bg-gradient-to-b from-violet-500/10 to-transparent px-2 py-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-black text-violet-200">👑 MIG Royale</span>
        {state.running && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              state.secondsLeft <= 5 ? "bg-red-500/80" : "bg-violet-600/80"
            }`}
          >
            {state.phase === "BETTING" && state.secondsLeft > 0 ? `⏱ ${state.secondsLeft}s` : "🃏 Dealing…"}
          </span>
        )}
        {state.running && state.poolTotal > 0 && (
          <span className="text-xs font-bold text-white/60">pool {shortK(state.poolTotal)}</span>
        )}
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          title="Last results"
          className="ml-auto rounded-lg border border-white/10 px-2 text-sm hover:bg-white/10"
        >
          📊
        </button>
        {collapsed && state.running && <LiveWatch onWatch={() => setCollapsed(false)} />}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded-lg border border-white/10 px-2 text-sm text-white/60 hover:bg-white/10"
        >
          {collapsed ? "+" : "−"}
        </button>
      </div>

      {showHistory && <RoyaleHistory history={state.history} />}

      {!collapsed && (
        <>
          {!state.running ? (
            <>
              <RoyaleLastResult state={state} />
              <button
                type="button"
                onClick={state.start}
                disabled={state.busy}
                className={`mt-2 w-full rounded-xl bg-gradient-to-r py-3 text-sm font-black disabled:opacity-50 ${royaleBtn()}`}
              >
                {state.busy ? "Starting…" : "▶ Start MIG Royale"}
              </button>
            </>
          ) : (
            <>
              {/* Red / Blue */}
              <div className="mt-2 grid grid-cols-2 gap-2">
                {ROYALE_OPTIONS.filter((o) => o.side).map((o) => {
                  const sel = selected === o.key;
                  const red = o.key === "red";
                  return (
                    <button
                      key={o.key}
                      type="button"
                      disabled={!canBet}
                      onClick={() => setSelected(o.key)}
                      className={`rounded-xl border-2 py-2.5 text-base font-black transition disabled:opacity-40 ${
                        red
                          ? sel
                            ? "border-red-500 bg-red-500 text-white"
                            : "border-red-500/60 bg-red-500/10 text-red-300"
                          : sel
                            ? "border-blue-500 bg-blue-500 text-white"
                            : "border-blue-500/60 bg-blue-500/10 text-blue-300"
                      }`}
                    >
                      {o.label} <span className="text-xs font-semibold opacity-75">{o.mult}</span>
                      <PoolLine mine={state.myBets[o.key] || 0} pool={state.pool[o.key]} />
                    </button>
                  );
                })}
              </div>

              {/* Hand types */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ROYALE_OPTIONS.filter((o) => !o.side).map((o) => {
                  const sel = selected === o.key;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      disabled={!canBet}
                      onClick={() => setSelected(o.key)}
                      className={`rounded-full border px-3 py-1 text-xs font-bold disabled:opacity-40 ${
                        sel
                          ? "border-violet-400 bg-violet-600 text-white"
                          : "border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/10"
                      }`}
                    >
                      {o.label} <span className="opacity-60">{o.mult}</span>
                      <PoolLine mine={state.myBets[o.key] || 0} pool={state.pool[o.key]} small />
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[10px] text-white/35">
                Hand-type bets pay only when the winning side has that hand. Min 100 · max 200,000 per option.
              </p>

              {/* Amount */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CHIPS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAmount(c)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                      amount === c
                        ? "border-violet-400 bg-violet-600 text-white"
                        : "border-white/10 text-white/60 hover:bg-white/5"
                    }`}
                  >
                    {c >= 1000 ? `${c / 1000}k` : c}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={!ready}
                onClick={() => opt && state.bet(opt.key, amount)}
                className={`mt-2 w-full rounded-xl bg-gradient-to-r py-2.5 text-sm font-black disabled:from-neutral-600 disabled:to-neutral-700 disabled:opacity-60 ${royaleBtn()}`}
              >
                {!canBet
                  ? "🃏 Dealing cards…"
                  : !opt
                    ? "🃏 Tap an option, then bet"
                    : state.busy
                      ? "Placing bet…"
                      : `🃏 Bet ${amount.toLocaleString()} on ${opt.label}`}
              </button>
            </>
          )}
        </>
      )}
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

/** Under an option: a gold "You 100" pill (my bet) and "22.6k in · 2 bettors" (everyone). */
function PoolLine({ mine, pool, small }: { mine: number; pool?: { coins: number; people: number }; small?: boolean }) {
  if (mine <= 0 && !pool) return null;
  return (
    <span
      className={`mt-0.5 flex items-center justify-center gap-[3px] font-semibold ${
        small ? "flex-col text-[9.5px] leading-tight" : "flex-wrap gap-1 text-[10.5px]"
      }`}
    >
      {mine > 0 && <span className="rounded-full bg-amber-300 px-1.5 py-[1px] font-black text-[#3A2500]">You {shortK(mine)}</span>}
      {pool && (
        <span className="whitespace-nowrap opacity-80">
          {/* small hand chips: "22.6k in · 👥3" so they stay narrow */}
          {small ? `${shortK(pool.coins)} in · 👥${pool.people}` : `${shortK(pool.coins)} in · ${pool.people} ${pool.people === 1 ? "bettor" : "bettors"}`}
        </span>
      )}
    </span>
  );
}
