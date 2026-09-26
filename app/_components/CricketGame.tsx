"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";

// 🏏 Cricket Bot — all outcomes and coins are decided by the Cloud Functions
// (startCricketGame / joinCricketGame / batCricket / tickCricketGame). The web
// only shows the game and sends the commands, same as CricketGame.kt.

export const CRICKET_ROOM = "🏏 Cricket Official";
const ROUNDS = 6;
const ENTRY_OPTIONS = [100, 200, 500, 1000, 2000];

const startCall = httpsCallable(functions, "startCricketGame");
const joinCall = httpsCallable(functions, "joinCricketGame");
const batCall = httpsCallable(functions, "batCricket");
const tickCall = httpsCallable(functions, "tickCricketGame");

type Player = { uid: string; username: string; runs: number; out: boolean; outHow: string };

export type CricketState = {
  running: boolean;
  phase: string;
  round: number;
  ball: number;
  entryCost: number;
  pot: number;
  players: Player[];
  batted: Set<string>;
  superOver: boolean;
  superOverUids: string[];
  secondsLeft: number;
  busy: boolean;
  activeBatters: () => Player[];
  start: (entry: number) => void;
  join: () => void;
  bat: () => void;
};

function opId(kind: string): string {
  return `cricket_${kind}_` + crypto.randomUUID().replace(/-/g, "");
}

export function useCricket(enabled: boolean, uid: string | undefined, note: (t: string) => void): CricketState | null {
  const [g, setG] = useState({
    running: false,
    phase: "IDLE",
    phaseEndsAt: 0,
    round: 0,
    ball: 0,
    entryCost: 200,
    pot: 0,
    players: [] as Player[],
    batted: new Set<string>(),
    superOver: false,
    superOverUids: [] as string[],
  });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const lastTick = useRef(0);
  const noteRef = useRef(note);
  noteRef.current = note;

  useEffect(() => {
    if (!enabled || !uid) return;
    return onSnapshot(doc(db, "room_game", CRICKET_ROOM), (snap) => {
      if (!snap.exists()) {
        setG((prev) => ({ ...prev, running: false, phase: "IDLE" }));
        return;
      }
      const rawPlayers = snap.get("players");
      const so = (snap.get("superOver") || {}) as Record<string, any>;
      setG({
        running: snap.get("gameRunning") === true,
        phase: String(snap.get("phase") || "IDLE"),
        phaseEndsAt: Number(snap.get("phaseEndsAt") || 0),
        round: Number(snap.get("roundNumber") || 0),
        ball: Number(snap.get("ball") || 0),
        entryCost: Number(snap.get("entryCost") || 200),
        pot: Number(snap.get("totalPot") || 0),
        players: Array.isArray(rawPlayers)
          ? rawPlayers
              .filter((m: any) => m && m.uid)
              .map((m: any) => ({
                uid: String(m.uid),
                username: String(m.username || ""),
                runs: Number(m.runs || 0),
                out: m.out === true,
                outHow: String(m.outHow || ""),
              }))
          : [],
        batted: new Set(Object.keys((snap.get("bats") || {}) as Record<string, unknown>)),
        superOver: so.active === true,
        superOverUids: Array.isArray(so.candidateUids) ? so.candidateUids.map(String) : [],
      });
    });
  }, [enabled, uid]);

  // Countdown, and nudge the game on when a timer ends (the server does it once).
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

  const run = (p: Promise<unknown>, fallback: string) => {
    setBusy(true);
    p.catch((err: any) => noteRef.current(`Cricket Bot: ${err?.message || fallback}`)).finally(() => setBusy(false));
  };

  const left = g.phaseEndsAt - now;

  return {
    ...g,
    secondsLeft: g.running && left > 0 ? Math.ceil(left / 1000) : 0,
    busy,
    activeBatters: () =>
      g.superOver ? g.players.filter((p) => g.superOverUids.includes(p.uid)) : g.players.filter((p) => !p.out),
    start: (entry: number) => {
      if (!busy) run(startCall({ entryCost: entry, operationId: opId("start") }), "Could not start.");
    },
    join: () => {
      if (!busy) run(joinCall({ operationId: opId("join") }), "Could not join.");
    },
    bat: () => {
      if (!busy) run(batCall({ roundNumber: g.round }), "Could not bat.");
    },
  };
}

// Chat commands in the Cricket room. True = handled (not posted as chat).
export function cricketHandleCommand(
  state: CricketState,
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
    if (!Number.isInteger(amount) || amount < 100 || amount > 100000) {
      note("Cricket Bot: Custom entry must be a number from 100 to 100000. Example: !start 500");
    } else {
      state.start(amount);
    }
    return true;
  }
  if (lower === "!j" || lower === "!join") {
    state.join();
    return true;
  }
  if (lower === "!d" || lower === "!bat") {
    state.bat();
    return true;
  }
  if (lower === "!players") {
    note(
      state.players.length === 0
        ? "Cricket Bot: No players have joined."
        : `Cricket Bot: Players (${state.players.length}): ` +
            state.players.map((p) => `${p.username}${p.out ? " (OUT)" : ` (${p.runs})`}`).join(", ")
    );
    return true;
  }
  if (lower === "!help") {
    note("Cricket Bot: !start [entry] starts a game · !j joins · !d bats · !players lists the players");
    return true;
  }
  return false;
}

export function CricketBox({ state, uid }: { state: CricketState; uid: string }) {
  const [entry, setEntry] = useState(200);
  const [collapsed, setCollapsed] = useState(false);

  const me = state.players.find((p) => p.uid === uid);
  const batters = state.activeBatters();
  const iAmBatter = !!me && batters.some((p) => p.uid === uid);
  const iBatted = state.batted.has(uid);
  const canBat = state.phase === "BATTING" && iAmBatter && !iBatted;

  const title = !state.running
    ? "🏏 Cricket"
    : state.phase === "JOINING"
      ? "🏏 Cricket • Joining"
      : state.superOver
        ? "🏏 Cricket • Super Over"
        : `🏏 Cricket • Round ${Math.max(1, state.ball)}/${ROUNDS}`;

  const ranked = [...state.players].sort((a, b) => b.runs - a.runs);

  return (
    <div className="border-t border-emerald-300/20 bg-gradient-to-b from-emerald-900/40 to-transparent px-2 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-black text-emerald-200">{title}</span>
        {state.running && state.secondsLeft > 0 && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              state.secondsLeft <= 3 ? "bg-red-500/80" : "bg-emerald-700/80"
            }`}
          >
            ⏱ {state.secondsLeft}s
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

      {state.running && (
        <p className="mt-0.5 text-xs text-amber-300">
          💰 Pot {state.pot.toLocaleString()} • {state.players.length} player
          {state.players.length === 1 ? "" : "s"}
          {state.phase === "BATTING" ? ` • ${state.batted.size}/${batters.length} batted` : ""}
        </p>
      )}

      {!collapsed && (
        <>
          {/* Scoreboard */}
          {state.running && ranked.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {ranked.map((p) => (
                <div
                  key={p.uid}
                  className={`flex items-center gap-1 rounded-xl border px-2 py-1.5 text-xs ${
                    p.out ? "border-white/5 bg-white/[0.02] opacity-50" : "border-emerald-400/30 bg-emerald-500/10"
                  }`}
                >
                  <span className="truncate font-bold">
                    {p.username}
                    {p.uid === uid && " (you)"}
                  </span>
                  <span className="ml-auto font-black text-amber-300">{p.runs}</span>
                  {p.out && <span className="text-[10px] text-red-300">OUT{p.outHow ? ` · ${p.outHow}` : ""}</span>}
                  {state.phase === "BATTING" && state.batted.has(p.uid) && !p.out && <span>✅</span>}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {!state.running ? (
              <>
                <span className="text-xs text-white/50">Entry</span>
                {ENTRY_OPTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEntry(e)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                      entry === e
                        ? "border-amber-300 bg-amber-300 text-neutral-900"
                        : "border-white/10 text-white/70 hover:bg-white/5"
                    }`}
                  >
                    {e}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => state.start(entry)}
                  disabled={state.busy}
                  className="ml-auto rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black disabled:opacity-50"
                >
                  ▶ Start
                </button>
              </>
            ) : state.phase === "JOINING" && !me ? (
              <button
                type="button"
                onClick={state.join}
                disabled={state.busy}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-black disabled:opacity-50"
              >
                🏏 Join · 🪙 {state.entryCost.toLocaleString()}
              </button>
            ) : state.phase === "JOINING" ? (
              <span className="text-xs text-white/70">✅ You joined — waiting for the game to start…</span>
            ) : !me ? (
              <span className="text-xs text-white/60">👀 Watching this game</span>
            ) : canBat ? (
              <button
                type="button"
                onClick={state.bat}
                disabled={state.busy}
                className="w-full animate-pulse rounded-xl bg-amber-400 py-3 text-sm font-black text-neutral-900 disabled:opacity-50"
              >
                🏏 BAT! (!d)
              </button>
            ) : (
              <span className="text-xs text-white/60">
                {me.out
                  ? "🚫 You are out · watching"
                  : iBatted
                    ? "✅ You batted — waiting for the others…"
                    : state.phase === "COUNTDOWN"
                      ? "⏳ Get ready…"
                      : state.superOver && !iAmBatter
                        ? "👀 Super Over — watching"
                        : "⏳ Waiting…"}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
