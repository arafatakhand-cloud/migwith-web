"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { MiniCard } from "./Cards";

// 🃏 LowCard — every step is a server-side, idempotent Cloud Function
// (startLowCardRound / joinLowCardGame / drawOwnLowCardCard /
// advanceLowCardRound / drawLowCardRound / resolveLowCardTieBreak /
// cancelLowCardNotEnoughPlayers). Like every device in the app's room, the web
// moves the game on when a phase's deadline has passed; the server lets only
// one of those calls through. All chat lines come from the server.

export const LOWCARD_ROOM = "🃏 LowCard Official";
export const LOWCARD_ENTRY_OPTIONS = [100, 200, 500, 1000, 2000];

const call = (name: string) => httpsCallable(functions, name);
const startCall = call("startLowCardRound");
const joinCall = call("joinLowCardGame");
const drawOwnCall = call("drawOwnLowCardCard");
const advanceCall = call("advanceLowCardRound");
const drawRoundCall = call("drawLowCardRound");
const tieBreakCall = call("resolveLowCardTieBreak");
const cancelCall = call("cancelLowCardNotEnoughPlayers");

type Player = { uid: string; username: string };

export type LowCardState = {
  running: boolean;
  phase: string;
  round: number;
  gameRound: number;
  entryCost: number;
  pot: number;
  players: Player[];
  cards: Record<string, string>;
  tieBreakActive: boolean;
  tieCandidates: string[];
  tieDrawn: string[];
  secondsLeft: number;
  busy: boolean;
  start: (entry: number) => void;
  join: () => void;
  draw: () => void;
};

export function useLowCard(enabled: boolean, uid: string | undefined, note: (t: string) => void): LowCardState | null {
  const [g, setG] = useState({
    running: false,
    phase: "IDLE",
    phaseEndsAt: 0,
    round: 0,
    gameRound: 1,
    entryCost: 200,
    pot: 0,
    players: [] as Player[],
    cards: {} as Record<string, string>,
    tieBreakActive: false,
    tieCandidates: [] as string[],
    tieDrawn: [] as string[],
  });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const lastDrive = useRef(0);
  const noteRef = useRef(note);
  noteRef.current = note;

  // The game document.
  useEffect(() => {
    if (!enabled || !uid) return;
    return onSnapshot(doc(db, "room_game", LOWCARD_ROOM), (d) => {
      if (!d.exists()) {
        setG((prev) => ({ ...prev, running: false, phase: "IDLE" }));
        return;
      }
      const phase = String(d.get("phase") || "IDLE");
      const rawPlayers = d.get("players");
      const seen = new Set<string>();
      const players: Player[] = Array.isArray(rawPlayers)
        ? rawPlayers
            .filter((m: any) => m && m.uid && !seen.has(m.uid) && seen.add(m.uid))
            .map((m: any) => ({ uid: String(m.uid), username: String(m.username || "") }))
        : [];
      const rawCards = (d.get("cards") || {}) as Record<string, any>;
      const tb = (d.get("tieBreak") || {}) as Record<string, any>;
      setG((prev) => ({
        running: d.get("gameRunning") === true,
        phase,
        phaseEndsAt: Number(d.get("phaseEndsAt") || 0),
        round: Number(d.get("roundNumber") || 0),
        gameRound: phase === "JOINING" ? 1 : Number(d.get("gameRound") || prev.gameRound),
        entryCost: Number(d.get("entryCost") || 200),
        pot: Number(d.get("totalPot") || 0),
        players,
        cards: Object.fromEntries(
          Object.entries(rawCards)
            .filter(([, v]) => v && v.rank && v.suit)
            .map(([k, v]) => [k, `${v.rank}${v.suit}`])
        ),
        tieBreakActive: tb.active === true,
        tieCandidates: Array.isArray(tb.candidateUids) ? tb.candidateUids.map(String) : [],
        tieDrawn: Object.keys((tb.cards || {}) as Record<string, unknown>),
      }));
    });
  }, [enabled, uid]);

  // Countdown + move the game on once a deadline has passed (same checks as
  // the app's rescue watcher; the server accepts each step only once).
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (!g.running || g.round <= 0 || document.visibilityState !== "visible") return;
      if (n - lastDrive.current < 1500) return;
      const stuck = g.phaseEndsAt > 0 ? n - g.phaseEndsAt : 0;
      const args = { roomId: LOWCARD_ROOM, roundNumber: g.round };

      if (g.phase === "JOINING" && stuck >= 1000 && stuck <= 150_000 && g.players.length < 2) {
        lastDrive.current = n;
        cancelCall(args).catch(() => {});
      } else if ((g.phase === "JOINING" || g.phase === "COUNTDOWN") && stuck >= 0 && stuck <= 150_000) {
        lastDrive.current = n;
        advanceCall(args).catch(() => {});
      } else if (g.phase === "DRAWING" && stuck >= 3500 && stuck <= 150_000) {
        lastDrive.current = n;
        (g.tieBreakActive ? tieBreakCall : drawRoundCall)({ ...args, gameRound: g.gameRound }).catch(() => {});
      }
    }, 500);
    return () => clearInterval(t);
  }, [enabled, g]);

  if (!enabled) return null;

  const run = (p: Promise<unknown>, fallback: string) => {
    setBusy(true);
    p.catch((err: any) => noteRef.current(`LowCard Bot: ${err?.message || fallback}`)).finally(() => setBusy(false));
  };

  const left = g.phaseEndsAt - now;
  const joined = g.players.some((p) => p.uid === uid);

  return {
    ...g,
    secondsLeft: g.running && left > 0 ? Math.ceil(left / 1000) : 0,
    busy,
    start: (entry: number) => {
      if (busy) return;
      setBusy(true);
      startCall({ entryCost: entry })
        .then(({ data }: any) => {
          if (data?.claimed !== true) noteRef.current("LowCard Bot: A game is already running.");
        })
        .catch((err: any) =>
          noteRef.current(`LowCard Bot: Could not start the game. ${err?.message || "Please try again."}`)
        )
        .finally(() => setBusy(false));
    },
    join: () => {
      if (busy || !g.running || g.phase !== "JOINING" || joined) return;
      run(joinCall({ roomId: LOWCARD_ROOM, operationId: crypto.randomUUID() }), "Could not join. Please try again.");
    },
    draw: () => {
      if (!uid || !g.running || g.phase !== "DRAWING") return;
      if (g.tieBreakActive) {
        if (!g.tieCandidates.includes(uid) || g.tieDrawn.includes(uid)) return;
      } else if (g.cards[uid] || !joined) {
        return;
      }
      drawOwnCall({ roomId: LOWCARD_ROOM, roundNumber: g.round, gameRound: g.gameRound }).catch(() => {});
    },
  };
}

// Chat commands in the LowCard room. True = handled (not posted as chat).
export function lowCardHandleCommand(
  state: LowCardState,
  clean: string,
  note: (t: string) => void,
  defaultEntry: number
): boolean {
  const lower = clean.trim().toLowerCase();
  if (lower === "!start") {
    state.start(defaultEntry);
    return true;
  }
  if (lower.startsWith("!start ")) {
    const amount = Number(lower.slice(7).trim());
    if (LOWCARD_ENTRY_OPTIONS.includes(amount)) state.start(amount);
    else note("LowCard Bot: Custom entry options: 100, 200, 500, 1000, 2000 credits.");
    return true;
  }
  if (lower === "!j" || lower === "!join") {
    state.join();
    return true;
  }
  if (lower === "!d" || lower === "!draw") {
    state.draw();
    return true;
  }
  if (lower === "!help") {
    note("LowCard Bot: !start [100|200|500|1000|2000] · !j join · !d draw your card · lowest card each round is out");
    return true;
  }
  return false;
}

export function LowCardBox({ state, uid }: { state: LowCardState; uid: string }) {
  const [entry, setEntry] = useState(200);
  const [collapsed, setCollapsed] = useState(false);

  const joined = state.players.some((p) => p.uid === uid);
  const inTie = state.tieBreakActive && state.tieCandidates.includes(uid);
  const canDraw =
    state.running &&
    state.phase === "DRAWING" &&
    (state.tieBreakActive ? inTie && !state.tieDrawn.includes(uid) : joined && !state.cards[uid]);

  const title = !state.running
    ? "🃏 LowCard"
    : state.phase === "JOINING"
      ? `🃏 LowCard • Joining (${state.players.length})`
      : state.tieBreakActive
        ? `🃏 LowCard • Tie-break`
        : `🃏 LowCard • Round #${state.gameRound}`;

  return (
    <div className="border-t border-cyan-300/20 bg-gradient-to-b from-cyan-900/30 to-transparent px-2 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-black text-cyan-200">{title}</span>
        {state.running && state.secondsLeft > 0 && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              state.secondsLeft <= 3 ? "bg-red-500/80" : "bg-cyan-700/80"
            }`}
          >
            ⏱ {state.secondsLeft}s
          </span>
        )}
        {state.running && (
          <span className="text-xs text-amber-300">
            💰 {state.pot.toLocaleString()} · entry {state.entryCost.toLocaleString()}
          </span>
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
          {/* Players and their cards this round */}
          {state.running && state.players.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {state.players.map((p) => {
                const card = state.cards[p.uid];
                const tied = state.tieBreakActive && state.tieCandidates.includes(p.uid);
                return (
                  <div
                    key={p.uid}
                    className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-xs ${
                      tied ? "border-amber-300 bg-amber-300/10" : "border-white/10 bg-white/[0.04]"
                    }`}
                  >
                    <span className="truncate font-bold">
                      {p.username}
                      {p.uid === uid && " (you)"}
                    </span>
                    <span className="ml-auto">
                      {card ? (
                        <MiniCard card={card} />
                      ) : state.phase === "DRAWING" ? (
                        <span className="text-white/35">…</span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {!state.running ? (
              <>
                <span className="text-xs text-white/50">Entry</span>
                {LOWCARD_ENTRY_OPTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEntry(e)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                      entry === e ? "border-cyan-300 bg-cyan-300 text-neutral-900" : "border-white/10 text-white/70"
                    }`}
                  >
                    {e}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => state.start(entry)}
                  disabled={state.busy}
                  className="ml-auto rounded-xl bg-cyan-600 px-4 py-2 text-sm font-black disabled:opacity-50"
                >
                  ▶ Start
                </button>
              </>
            ) : state.phase === "JOINING" && !joined ? (
              <button
                type="button"
                onClick={state.join}
                disabled={state.busy}
                className="w-full rounded-xl bg-cyan-600 py-2.5 text-sm font-black disabled:opacity-50"
              >
                🃏 Join · 🪙 {state.entryCost.toLocaleString()}
              </button>
            ) : state.phase === "JOINING" ? (
              <span className="text-xs text-white/70">✅ Joined — waiting for the game to start…</span>
            ) : canDraw ? (
              <button
                type="button"
                onClick={state.draw}
                className="w-full animate-pulse rounded-xl bg-amber-400 py-3 text-sm font-black text-neutral-900"
              >
                🃏 DRAW! (!d)
              </button>
            ) : (
              <span className="text-xs text-white/60">
                {!joined
                  ? "👀 Watching this game"
                  : state.phase === "COUNTDOWN"
                    ? "⏳ Next round starting…"
                    : state.phase === "DRAWING"
                      ? "✅ Card drawn — waiting for the others…"
                      : "⏳ Waiting…"}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
