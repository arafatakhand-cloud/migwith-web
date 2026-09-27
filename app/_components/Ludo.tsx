"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";

// 🎲 Ludo — dice rolls, moves, cuts, coins and the winner are all decided by
// the Cloud Functions (startLudo / joinLudo / ludoAction / tickLudo). The web
// only draws the board and sends taps, same as LudoGame.kt.
//
// Token position: -1 yard · 0..50 shared track (from the player's own start)
// · 51..55 home column · 56 home. Track square = (color × 13 + pos) mod 52.
// Colors clockwise from top-left: 0 Red, 1 Green, 2 Yellow, 3 Blue.

export const LUDO_ROOM = "🎲 Ludo Bot Official";
const FEE_OPTIONS = [100, 200, 500, 1000, 2000];
const TOKEN_MODES = [1, 2, 4];
const HOME = 56;

const COLORS = ["#FF4757", "#2ED47A", "#FFC312", "#3B82F6"];
const COLORS_DARK = ["#A3132A", "#0E7A45", "#B77A00", "#1C4DB5"];
const COLOR_NAMES = ["Red", "Green", "Yellow", "Blue"];

const startCall = httpsCallable(functions, "startLudo");
const joinCall = httpsCallable(functions, "joinLudo");
const actionCall = httpsCallable(functions, "ludoAction");
const tickCall = httpsCallable(functions, "tickLudo");

// Shared 52-square track [row, col], clockwise from Red's start square.
const TRACK: [number, number][] = (() => {
  const t: [number, number][] = [];
  for (let c = 1; c <= 5; c++) t.push([6, c]);
  for (let r = 5; r >= 0; r--) t.push([r, 6]);
  t.push([0, 7]);
  for (let r = 0; r <= 5; r++) t.push([r, 8]);
  for (let c = 9; c <= 14; c++) t.push([6, c]);
  t.push([7, 14]);
  for (let c = 14; c >= 9; c--) t.push([8, c]);
  for (let r = 9; r <= 14; r++) t.push([r, 8]);
  t.push([14, 7]);
  for (let r = 14; r >= 9; r--) t.push([r, 6]);
  for (let c = 5; c >= 0; c--) t.push([8, c]);
  t.push([7, 0]);
  t.push([6, 0]);
  return t;
})();

const HOME_COLUMN: [number, number][][] = [
  [1, 2, 3, 4, 5].map((c) => [7, c] as [number, number]),
  [1, 2, 3, 4, 5].map((r) => [r, 7] as [number, number]),
  [13, 12, 11, 10, 9].map((c) => [7, c] as [number, number]),
  [13, 12, 11, 10, 9].map((r) => [r, 7] as [number, number]),
];
const YARD_ORIGIN: [number, number][] = [
  [0, 0],
  [0, 9],
  [9, 9],
  [9, 0],
];
const YARD_SPOTS: [number, number][] = [
  [2, 2],
  [2, 4],
  [4, 2],
  [4, 4],
];
const HOME_SPOT: [number, number][] = [
  [7.5, 6.7],
  [6.7, 7.5],
  [7.5, 8.3],
  [8.3, 7.5],
];
const STAR_SQUARES = new Set([8, 21, 34, 47]);
const START_SQUARES = new Set([0, 13, 26, 39]);

/** Center of a token in cell units [row, col]. */
function tokenCenter(color: number, pos: number, token: number): [number, number] {
  const c = Math.min(3, Math.max(0, color));
  if (pos < 0) {
    const [r0, c0] = YARD_ORIGIN[c];
    const [sr, sc] = YARD_SPOTS[Math.min(3, Math.max(0, token))];
    return [r0 + sr, c0 + sc];
  }
  if (pos <= 50) {
    const [r, col] = TRACK[(c * 13 + pos) % 52];
    return [r + 0.5, col + 0.5];
  }
  if (pos < HOME) {
    const [r, col] = HOME_COLUMN[c][pos - 51];
    return [r + 0.5, col + 0.5];
  }
  const [hr, hc] = HOME_SPOT[c];
  return [hr + (token < 2 ? -0.22 : 0.22), hc + (token % 2 === 0 ? -0.22 : 0.22)];
}

type Player = {
  uid: string;
  username: string;
  color: number;
  tokens: number[];
  out: boolean;
  invested: number;
  auto: boolean;
};

export type LudoState = {
  running: boolean;
  phase: string;
  round: number;
  fee: number;
  tokenCount: number;
  pot: number;
  players: Player[];
  turnIndex: number;
  dice: number;
  diceSeat: number;
  rollNo: number;
  awaitingMove: boolean;
  legal: number[];
  lastWinners: string[];
  lastPrize: number;
  secondsLeft: number;
  busy: boolean;
  mySeat: number;
  start: (fee: number, tokens: number) => void;
  join: () => void;
  act: (action: string, token?: number, on?: boolean) => void;
};

function opId(kind: string): string {
  return `ludo_${kind}_` + crypto.randomUUID().replace(/-/g, "");
}

export function useLudo(enabled: boolean, uid: string | undefined, note: (t: string) => void): LudoState | null {
  const [g, setG] = useState({
    running: false,
    phase: "IDLE",
    phaseEndsAt: 0,
    round: 0,
    fee: 200,
    tokenCount: 4,
    pot: 0,
    players: [] as Player[],
    turnIndex: -1,
    dice: 0,
    diceSeat: -1,
    rollNo: 0,
    awaitingMove: false,
    legal: [] as number[],
    lastWinners: [] as string[],
    lastPrize: 0,
  });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const lastTick = useRef(0);
  const noteRef = useRef(note);
  noteRef.current = note;

  useEffect(() => {
    if (!enabled || !uid) return;
    return onSnapshot(doc(db, "room_game", LUDO_ROOM), (d) => {
      if (!d.exists()) {
        setG((prev) => ({ ...prev, running: false, phase: "IDLE" }));
        return;
      }
      const tc = Number(d.get("tokenCount") || 4);
      const n = TOKEN_MODES.includes(tc) ? tc : 4;
      const rawPlayers = d.get("players");
      setG({
        running: d.get("gameRunning") === true,
        phase: String(d.get("phase") || "IDLE"),
        phaseEndsAt: Number(d.get("phaseEndsAt") || 0),
        round: Number(d.get("roundNumber") || 0),
        fee: Number(d.get("fee") || 200),
        tokenCount: n,
        pot: Number(d.get("pot") || 0),
        players: Array.isArray(rawPlayers)
          ? rawPlayers
              .filter((m: any) => m && m.uid)
              .map((m: any) => {
                const toks = Array.isArray(m.tokens) ? m.tokens.map((x: any) => Number(x ?? -1)) : [];
                return {
                  uid: String(m.uid),
                  username: String(m.username || ""),
                  color: Number(m.color ?? -1),
                  tokens: toks.length === n ? toks : Array(n).fill(-1),
                  out: m.out === true,
                  invested: Number(m.invested || 0),
                  auto: m.auto === true,
                };
              })
          : [],
        turnIndex: Number(d.get("turnIndex") ?? -1),
        dice: Number(d.get("dice") || 0),
        diceSeat: Number(d.get("diceSeat") ?? -1),
        rollNo: Number(d.get("rollNo") || 0),
        awaitingMove: d.get("awaitingMove") === true,
        legal: Array.isArray(d.get("legal")) ? d.get("legal").map(Number) : [],
        lastWinners: Array.isArray(d.get("lastWinners")) ? d.get("lastWinners").map(String) : [],
        lastPrize: Number(d.get("lastPrize") || 0),
      });
    });
  }, [enabled, uid]);

  // Countdown, and move the game on when a timer ends (the server does it once).
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (
        g.running &&
        g.phaseEndsAt > 0 &&
        document.visibilityState === "visible" &&
        n >= g.phaseEndsAt + 350 &&
        n - lastTick.current > 1500
      ) {
        lastTick.current = n;
        tickCall({}).catch(() => {});
      }
    }, 300);
    return () => clearInterval(t);
  }, [enabled, g.running, g.phaseEndsAt]);

  if (!enabled) return null;

  const run = (p: Promise<unknown>) => {
    setBusy(true);
    p.catch((err: any) => noteRef.current(`Ludo Bot: ${err?.message || "Something went wrong. Try again."}`)).finally(
      () => setBusy(false)
    );
  };

  const left = g.phaseEndsAt - now;

  return {
    ...g,
    secondsLeft: g.running && left > 0 ? Math.ceil(left / 1000) : 0,
    busy,
    mySeat: g.players.findIndex((p) => p.uid === uid),
    start: (fee: number, tokens: number) => {
      if (!busy) run(startCall({ fee, tokens, operationId: opId("start") }));
    },
    join: () => {
      if (!busy) run(joinCall({ operationId: opId("join") }));
    },
    act: (action: string, token = -1, on?: boolean) => {
      if (busy) return;
      const args: Record<string, unknown> = { action, roundNumber: g.round, token };
      if (on !== undefined) args.on = on;
      run(actionCall(args));
    },
  };
}

// Chat commands in the Ludo room. True = handled (not posted as chat).
export function ludoHandleCommand(state: LudoState, clean: string, note: (t: string) => void): boolean {
  const lower = clean.trim().toLowerCase();
  if (lower === "!start") {
    state.start(200, 4);
    return true;
  }
  if (lower.startsWith("!start ")) {
    const parts = lower.slice(7).trim().split(/\s+/);
    const amount = Number(parts[0]);
    const tokens = parts[1] !== undefined ? Number(parts[1]) : 4;
    if (!Number.isInteger(amount) || amount < 100 || amount > 50000) {
      note("Ludo Bot: Custom entry must be 100 – 50000. Example: !start 500 2");
    } else if (!TOKEN_MODES.includes(tokens)) {
      note("Ludo Bot: Tokens must be 1, 2 or 4. Example: !start 500 2");
    } else {
      state.start(amount, tokens);
    }
    return true;
  }
  if (lower === "!j" || lower === "!join") {
    state.join();
    return true;
  }
  if (lower === "!roll" || lower === "!r") {
    state.act("roll");
    return true;
  }
  if (lower.startsWith("!m ") || lower.startsWith("!move ")) {
    const n = Number(lower.split(/\s+/)[1]);
    if (!Number.isInteger(n) || n < 1 || n > state.tokenCount) {
      note(`Ludo Bot: Pick a token 1–${state.tokenCount}. Example: !m 1`);
    } else {
      state.act("move", n - 1);
    }
    return true;
  }
  if (lower === "!leave") {
    state.act("leave");
    return true;
  }
  if (lower === "!auto" || lower === "!auto on" || lower === "!auto off") {
    const me = state.players[state.mySeat];
    if (!me) {
      note("Ludo Bot: You're not in this game.");
    } else {
      state.act("auto", -1, lower === "!auto on" ? true : lower === "!auto off" ? false : !me.auto);
    }
    return true;
  }
  if (lower === "!help") {
    note(
      "Ludo Bot: !start [entry] [1|2|4 tokens] · !j sit · !roll (!r) · !m 1-4 move a token · !auto Auto Play on/off · !leave · 6 brings a token out · 6 / cut / home = roll again · ⭐ squares are safe"
    );
    return true;
  }
  return false;
}

const DICE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export function LudoTable({ state }: { state: LudoState }) {
  const [fee, setFee] = useState(200);
  const [tokens, setTokens] = useState(4);
  const [collapsed, setCollapsed] = useState(false);

  const me = state.players[state.mySeat];
  const myTurn = state.phase === "PLAYING" && state.mySeat >= 0 && state.turnIndex === state.mySeat;
  const canRoll = myTurn && !state.awaitingMove && !state.busy;
  const canMove = myTurn && state.awaitingMove && !state.busy;
  const turnPlayer = state.players[state.turnIndex];
  const winners = new Set(state.lastWinners);

  return (
    <div className="border-t border-sky-300/20 bg-gradient-to-b from-sky-900/30 to-transparent px-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-black text-sky-200">
          🎲 Ludo
          {state.running && state.phase === "JOINING" && ` • Sit down (${state.players.length}/4)`}
        </span>
        {state.running && state.secondsLeft > 0 && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              state.secondsLeft <= 3 ? "bg-red-500/80" : "bg-sky-700/80"
            }`}
          >
            ⏱ {state.secondsLeft}s
          </span>
        )}
        {state.running && (
          <span className="text-xs text-amber-300">
            💰 {state.pot.toLocaleString()} · {state.tokenCount} token{state.tokenCount > 1 ? "s" : ""}
          </span>
        )}
        {state.running && me && state.phase === "PLAYING" && (
          <button
            type="button"
            onClick={() => state.act("auto", -1, !me.auto)}
            disabled={state.busy}
            className={`rounded-full px-2 py-0.5 text-xs font-black ${
              me.auto ? "bg-emerald-600" : "border border-white/15 bg-white/5"
            }`}
          >
            🤖 Auto{me.auto ? " ON" : ""}
          </button>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="ml-auto rounded-lg border border-white/10 px-2 text-sm text-white/60 hover:bg-white/10"
        >
          {collapsed ? "+" : "−"}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Players */}
          {state.players.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {state.players.map((p, i) => {
                const isTurn = state.phase === "PLAYING" && state.turnIndex === i;
                const won = !state.running && (winners.has(p.uid) || winners.has(p.username));
                return (
                  <span
                    key={p.uid}
                    className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                      isTurn ? "border-amber-300 bg-amber-300/15" : "border-white/10 bg-white/[0.04]"
                    } ${p.out ? "opacity-40" : ""}`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[p.color] || "#888" }} />
                    <span className="font-bold">
                      {p.auto && !p.username.includes("🤖") && "🤖"}
                      {p.username}
                    </span>
                    <span className="text-white/45">
                      🏠 {p.tokens.filter((t) => t === HOME).length}/{state.tokenCount}
                    </span>
                    {won && "🏆"}
                  </span>
                );
              })}
            </div>
          )}

          {state.running && state.phase !== "JOINING" && (
            <Board state={state} canMove={canMove} />
          )}

          {!state.running && state.lastPrize > 0 && (
            <p className="mt-1 text-center text-xs text-emerald-300">
              ✅ Game over · prize 🪙 {state.lastPrize.toLocaleString()}
            </p>
          )}

          {/* Actions */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {!state.running ? (
              <>
                <span className="text-xs text-white/50">Entry</span>
                {FEE_OPTIONS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFee(f)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                      fee === f ? "border-sky-300 bg-sky-300 text-neutral-900" : "border-white/10 text-white/70"
                    }`}
                  >
                    {f}
                  </button>
                ))}
                <span className="ml-1 text-xs text-white/50">Tokens</span>
                {TOKEN_MODES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTokens(t)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                      tokens === t ? "border-sky-300 bg-sky-300 text-neutral-900" : "border-white/10 text-white/70"
                    }`}
                  >
                    {t}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => state.start(fee, tokens)}
                  disabled={state.busy}
                  className="ml-auto rounded-xl bg-sky-600 px-4 py-2 text-sm font-black disabled:opacity-50"
                >
                  ▶ Start
                </button>
              </>
            ) : state.phase === "JOINING" && !me ? (
              <button
                type="button"
                onClick={state.join}
                disabled={state.busy}
                className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-black disabled:opacity-50"
              >
                🎲 Sit down · 🪙 {state.fee.toLocaleString()}
              </button>
            ) : state.phase === "JOINING" ? (
              <span className="text-xs text-white/70">✅ Seated — waiting for the game to start…</span>
            ) : (
              <>
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-4xl leading-none text-neutral-900"
                  title={state.dice ? `Dice: ${state.dice}` : "Dice"}
                >
                  {state.dice ? DICE_FACES[state.dice] : "🎲"}
                </span>
                <span className="text-xs text-white/70">
                  {myTurn
                    ? canMove
                      ? "Tap a glowing token to move it"
                      : "Your turn — roll!"
                    : turnPlayer
                      ? `${turnPlayer.username}'s turn (${COLOR_NAMES[turnPlayer.color] || ""})`
                      : ""}
                  {/* Who rolled last and what, so a roll with no move is not invisible. */}
                  {state.dice >= 1 && state.dice <= 6 && state.players[state.diceSeat] && (
                    <span className="block text-[10px] text-white/55">
                      {state.diceSeat === state.mySeat ? "You" : state.players[state.diceSeat].username} rolled {state.dice} 🎲
                    </span>
                  )}
                </span>
                {me && !me.out ? (
                  <>
                    <button
                      type="button"
                      onClick={() => state.act("roll")}
                      disabled={!canRoll}
                      className={`ml-auto rounded-xl px-4 py-2 text-sm font-black disabled:opacity-40 ${
                        canRoll ? "animate-pulse bg-amber-400 text-neutral-900" : "bg-white/10"
                      }`}
                    >
                      🎲 Roll
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // Asks first: quitting a running game does NOT refund the entry.
                        if (window.confirm(`Leave the game?\n\nYour ${state.fee.toLocaleString()} coin entry will NOT be refunded.`))
                          state.act("leave");
                      }}
                      disabled={state.busy}
                      className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60"
                    >
                      Quit
                    </button>
                  </>
                ) : (
                  <span className="ml-auto text-xs text-white/50">👀 Watching</span>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Board({ state, canMove }: { state: LudoState; canMove: boolean }) {
  const cell = 20;
  const size = cell * 15;
  const legal = new Set(state.legal);

  // Cells that belong to a track square, with the square's absolute index.
  const trackIndex = new Map<string, number>();
  TRACK.forEach(([r, c], i) => trackIndex.set(`${r},${c}`, i));

  // Group tokens by the spot they are drawn on so stacked tokens fan out.
  const drawn: { key: string; color: number; token: number; x: number; y: number; mine: boolean; tappable: boolean }[] = [];
  const stacks = new Map<string, number>();
  state.players.forEach((p, seat) => {
    if (p.out) return;
    p.tokens.forEach((pos, token) => {
      const [r, c] = tokenCenter(p.color, pos, token);
      const spot = `${r.toFixed(2)},${c.toFixed(2)}`;
      const n = stacks.get(spot) || 0;
      stacks.set(spot, n + 1);
      const mine = seat === state.mySeat;
      drawn.push({
        key: `${p.uid}:${token}`,
        color: p.color,
        token,
        x: c * cell + (n % 2 === 0 ? 0 : 4) * (n > 0 ? 1 : 0),
        y: r * cell - (n > 0 ? 3 * n : 0),
        mine,
        tappable: mine && canMove && legal.has(token),
      });
    });
  });

  return (
    <div className="mt-2 flex justify-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[360px] rounded-xl shadow-lg">
        <rect width={size} height={size} fill="#FBF6EA" />

        {/* Yards */}
        {YARD_ORIGIN.map(([r0, c0], color) => (
          <g key={color}>
            <rect x={c0 * cell} y={r0 * cell} width={cell * 6} height={cell * 6} fill={COLORS[color]} />
            <rect
              x={(c0 + 1) * cell}
              y={(r0 + 1) * cell}
              width={cell * 4}
              height={cell * 4}
              rx={6}
              fill="#FFFFFF"
            />
            {YARD_SPOTS.map(([sr, sc], i) => (
              <circle
                key={i}
                cx={(c0 + sc) * cell}
                cy={(r0 + sr) * cell}
                r={cell * 0.38}
                fill={COLORS[color]}
                opacity={0.25}
              />
            ))}
          </g>
        ))}

        {/* Track squares */}
        {TRACK.map(([r, c], i) => {
          const startOf = START_SQUARES.has(i) ? i / 13 : -1;
          return (
            <g key={`t${i}`}>
              <rect
                x={c * cell}
                y={r * cell}
                width={cell}
                height={cell}
                fill={startOf >= 0 ? COLORS[startOf] : "#FFFFFF"}
                stroke="#CDBFA6"
                strokeWidth={0.8}
              />
              {STAR_SQUARES.has(i) && (
                <text
                  x={c * cell + cell / 2}
                  y={r * cell + cell / 2 + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#D9A93B"
                >
                  ★
                </text>
              )}
            </g>
          );
        })}

        {/* Home columns */}
        {HOME_COLUMN.map((cells, color) =>
          cells.map(([r, c], i) => (
            <rect
              key={`h${color}-${i}`}
              x={c * cell}
              y={r * cell}
              width={cell}
              height={cell}
              fill={COLORS[color]}
              opacity={0.85}
              stroke="#CDBFA6"
              strokeWidth={0.8}
            />
          ))
        )}

        {/* Center home triangles */}
        <polygon points={`${6 * cell},${6 * cell} ${7.5 * cell},${7.5 * cell} ${6 * cell},${9 * cell}`} fill={COLORS[0]} />
        <polygon points={`${6 * cell},${6 * cell} ${9 * cell},${6 * cell} ${7.5 * cell},${7.5 * cell}`} fill={COLORS[1]} />
        <polygon points={`${9 * cell},${6 * cell} ${9 * cell},${9 * cell} ${7.5 * cell},${7.5 * cell}`} fill={COLORS[2]} />
        <polygon points={`${6 * cell},${9 * cell} ${9 * cell},${9 * cell} ${7.5 * cell},${7.5 * cell}`} fill={COLORS[3]} />

        {/* Tokens */}
        {drawn.map((t) => (
          <g
            key={t.key}
            onClick={t.tappable ? () => state.act("move", t.token) : undefined}
            style={{ cursor: t.tappable ? "pointer" : "default", transition: "transform 0.35s" }}
            transform={`translate(${t.x}, ${t.y})`}
          >
            {t.tappable && (
              <circle r={cell * 0.55} fill="none" stroke="#FACC15" strokeWidth={2.5}>
                <animate attributeName="r" values={`${cell * 0.45};${cell * 0.62};${cell * 0.45}`} dur="0.9s" repeatCount="indefinite" />
              </circle>
            )}
            <circle r={cell * 0.36} fill={COLORS_DARK[t.color]} />
            <circle r={cell * 0.28} fill={COLORS[t.color]} stroke="#FFFFFF" strokeWidth={1.5} />
            {t.mine && (
              <text y={3.5} textAnchor="middle" fontSize={9} fontWeight={900} fill="#FFFFFF">
                {t.token + 1}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
