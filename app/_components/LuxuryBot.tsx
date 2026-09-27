"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";

// 👻 Luxury Bot — the web side only shows the round and sends bets. Money,
// results and the round itself are handled by the Cloud Functions
// (startLuxuryRound / placeLuxuryBotBet / settleLuxuryRound), same as the app.

function betTotalLabel(total: number): string {
  if (total <= 0) return "0";
  if (total < 1000) return String(total);
  if (total % 1000 === 0) return `${total / 1000}k`;
  return `${(total / 1000).toFixed(1)}k`;
}

export const LUXURY_ROOM = "👻 Luxury Bot Official";

export const LUXURY_CHARACTERS = [
  "🕵️ Chor",
  "🥷 Dakat",
  "👮 Police",
  "👨 Babu",
  "🧑‍🌾 Krishok",
  "💰 Mohajon",
];

const CHIPS = [500, 1000, 2000, 5000, 10000, 12000];

const startRound = httpsCallable<{ roomId: string }, { claimed?: boolean; bettingEndsAt?: number }>(
  functions,
  "startLuxuryRound"
);
const placeBet = httpsCallable(functions, "placeLuxuryBotBet");
const settleRound = httpsCallable(functions, "settleLuxuryRound");

function opId(): string {
  return "lux_" + crypto.randomUUID().replace(/-/g, "");
}

export type LuxuryState = {
  running: boolean;
  phase: string;
  round: number;
  endsAt: number;
  controllerUid: string;
  secondsLeft: number;
  myBets: Record<string, number>;
  starting: boolean;
  start: () => Promise<void>;
};

export function useLuxuryBot(enabled: boolean, uid: string | undefined, note: (t: string) => void): LuxuryState | null {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("IDLE");
  const [round, setRound] = useState(0);
  const [endsAt, setEndsAt] = useState(0);
  const [controllerUid, setControllerUid] = useState("");
  const [settled, setSettled] = useState(false);
  const [myBets, setMyBets] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const [starting, setStarting] = useState(false);
  const rescuedRound = useRef(0);
  const noteRef = useRef(note);
  noteRef.current = note;

  // The round document.
  useEffect(() => {
    if (!enabled || !uid) return;
    return onSnapshot(doc(db, "room_game", LUXURY_ROOM), (snap) => {
      setRunning(snap.get("botRunning") === true);
      setPhase(String(snap.get("phase") || "IDLE"));
      setRound(Number(snap.get("roundNumber") || 0));
      setEndsAt(Number(snap.get("serverEndsAt") || snap.get("bettingEndsAt") || 0));
      setControllerUid(String(snap.get("controllerUid") || ""));
      setSettled(Boolean(snap.get("settledAt") || snap.get("settlementStartedAt")));
    });
  }, [enabled, uid]);

  // My bets this round.
  useEffect(() => {
    if (!enabled || !uid) return;
    return onSnapshot(doc(db, "room_game", LUXURY_ROOM, "user_bets", uid), (snap) => {
      const bets = (snap.get("bets") || {}) as Record<string, number>;
      setMyBets(Number(snap.get("roundNumber") || -1) === round ? bets : {});
    });
  }, [enabled, uid, round]);

  // Countdown tick.
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [enabled]);

  // Rescue: if a round is well past its deadline and nobody finished it, ask
  // the server to finish it (the app's other devices do the same). Only for
  // rounds this browser does not control — the server finishes those itself.
  useEffect(() => {
    if (!enabled || !running || phase !== "BETTING" || settled || !endsAt) return;
    if (controllerUid === uid) return;
    if (now < endsAt + 6000 || rescuedRound.current === round) return;
    rescuedRound.current = round;
    settleRound({ roomId: LUXURY_ROOM, roundNumber: round }).catch(() => {});
  }, [enabled, running, phase, settled, endsAt, controllerUid, uid, now, round]);

  if (!enabled) return null;

  const secondsLeft =
    running && phase === "BETTING" && endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;

  return {
    running,
    phase,
    round,
    endsAt,
    controllerUid,
    secondsLeft,
    myBets,
    starting,
    start: async () => {
      if (starting) return;
      setStarting(true);
      try {
        const { data } = await startRound({ roomId: LUXURY_ROOM });
        if (!data?.claimed) noteRef.current("👻 Luxury Bot: A round is already running.");
      } catch (err: any) {
        noteRef.current(`👻 Luxury Bot: Could not start the bot. ${err?.message || "Please try again."}`);
      } finally {
        setStarting(false);
      }
    },
  };
}

export function LuxuryBetBox({ state, note }: { state: LuxuryState; note: (t: string) => void }) {
  const [amount, setAmount] = useState(500);
  const [inFlight, setInFlight] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const canBet = state.running && state.phase === "BETTING" && state.secondsLeft > 0;

  const bet = async (character: string) => {
    if (!canBet) return;
    setInFlight((n) => n + 1);
    try {
      await placeBet({
        roomGamePath: `room_game/${LUXURY_ROOM}`,
        character,
        amount,
        expectedRound: state.round,
        operationId: opId(),
      });
    } catch (err: any) {
      note(`👻 Luxury Bot: Bet rejected. ${err?.message || "Please try again."}`);
    } finally {
      setInFlight((n) => n - 1);
    }
  };

  const myTotal = Object.values(state.myBets).reduce((a, b) => a + (Number(b) || 0), 0);

  return (
    <div className="border-t border-amber-300/20 bg-gradient-to-b from-fuchsia-500/10 to-transparent px-2 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-black text-pink-300">👻 Luxury Bot</span>
        {state.running && state.phase === "BETTING" ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              state.secondsLeft <= 10 ? "bg-red-500/80" : "bg-blue-500/60"
            }`}
          >
            {state.secondsLeft > 0 ? `⏱ ${state.secondsLeft}s` : "🎲 Rolling…"}
          </span>
        ) : state.running ? (
          <span className="rounded-full bg-amber-500/60 px-2 py-0.5 text-xs font-bold">🎲 Result…</span>
        ) : null}
        {inFlight > 0 && <span className="text-xs text-white/50">⏳ Sending bet…</span>}
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
          {!state.running ? (
            <button
              type="button"
              onClick={state.start}
              disabled={state.starting}
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-600 py-3 text-sm font-black disabled:opacity-50"
            >
              {state.starting ? "Starting…" : "▶ Start Luxury Bot"}
            </button>
          ) : (
            <>
              <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {LUXURY_CHARACTERS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => bet(c)}
                    disabled={!canBet}
                    className="rounded-xl border border-amber-300/40 bg-white/[0.05] px-1 py-2 text-center text-xs font-bold transition hover:bg-amber-300/10 active:scale-95 disabled:opacity-40"
                  >
                    <div>{c}</div>
                    {/* My total on it, the app's label: 500 → "500", 2000 → "2k", 2500 → "2.5k" */}
                    <div className={`mt-0.5 text-xs font-extrabold ${(state.myBets[c] || 0) > 0 ? "text-amber-300" : "text-white/40"}`}>
                      {betTotalLabel(Number(state.myBets[c] || 0))}
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {CHIPS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAmount(c)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                      amount === c
                        ? "border-pink-400 bg-pink-500/30 text-white"
                        : "border-white/10 text-white/60 hover:bg-white/5"
                    }`}
                  >
                    {c >= 1000 ? `${c / 1000}k` : c}
                  </button>
                ))}
                {myTotal > 0 && (
                  <span className="ml-auto text-xs text-white/50">
                    Your bets: 🪙 {myTotal.toLocaleString()}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[10px] text-white/35">
                Tap a character to bet {amount.toLocaleString()} coins on it · 100–12,000 per bet
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
