"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { serverNow } from "../../lib/serverTime";
import { RulesButton } from "./GuessRace";

// 🎲 LIAR'S DICE (ধাপ্পাবাজি) — "🎲 Liar's Dice Official", run entirely by the
// server (liarStart / liarJoin / liarBid / liarCall / liarTick + the watchdog),
// same as the app's LiarDiceGame.kt:
//   !start [entry] · !j · !b [how many] [face] · !liar · !help
// My own dice come from room_game/{room}/liar_hands/{my uid} (only I can read it).

export const LIAR_DICE_ROOM = "🎲 Liar's Dice Official";
const BOT = "Liar's Dice Bot";

const startCall = httpsCallable(functions, "liarStart");
const joinCall = httpsCallable(functions, "liarJoin");
const bidCall = httpsCallable(functions, "liarBid");
const liarCall = httpsCallable(functions, "liarCall");
const tickCall = httpsCallable(functions, "liarTick");

const errText = (e: any) => e?.message || "Something went wrong.";
const fmt = (n: number) => Math.floor(n || 0).toLocaleString("en-US");

type Player = { uid: string; name: string; dice: number };
type Bid = { uid: string; name: string; q: number; f: number };
type Reveal = {
  dice: Record<string, number[]>;
  face: number;
  q: number;
  count: number;
  timeout: boolean;
  caller: string;
  bidder: string;
  loser: string;
};

export type LiarDiceState = {
  uid: string;
  running: boolean;
  phase: string; // IDLE · JOINING · BIDDING · REVEAL · OVER · REFUNDING
  gameNo: number;
  roundNo: number;
  entry: number;
  pot: number;
  players: Player[];
  turnUid: string;
  bid: Bid | null;
  bids: { name: string; q: number; f: number }[];
  reveal: Reveal | null;
  winner: { name: string; win: number } | null;
  secondsLeft: number;
  myDice: number[];
  busy: boolean;
  start: (entry?: number) => void;
  join: () => void;
  bidMove: (q: number, f: number) => void;
  callLiar: () => void;
};

export function useLiarDice(roomId: string | null, uid: string | undefined, note: (t: string) => void): LiarDiceState | null {
  const on = roomId === LIAR_DICE_ROOM;
  const [g, setG] = useState({
    running: false, phase: "IDLE", gameNo: 0, roundNo: 0, entry: 1000, pot: 0, players: [] as Player[],
    turnUid: "", bid: null as Bid | null, bids: [] as LiarDiceState["bids"], reveal: null as Reveal | null,
    winner: null as LiarDiceState["winner"], phaseEndsAt: 0,
  });
  const [hand, setHand] = useState<{ round: number; dice: number[] }>({ round: 0, dice: [] });
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => serverNow());
  const lastTick = useRef(0);
  const noteRef = useRef(note);
  noteRef.current = note;

  useEffect(() => {
    if (!on || !uid) return;
    return onSnapshot(doc(db, "room_game", LIAR_DICE_ROOM), (d) => {
      if (!d.exists()) return;
      const lr = d.get("lastReveal");
      const w = d.get("winner");
      setG({
        running: d.get("running") === true,
        phase: String(d.get("phase") || "IDLE"),
        gameNo: Number(d.get("gameNo") || 0),
        roundNo: Number(d.get("roundNo") || 0),
        entry: Number(d.get("entry") || 1000),
        pot: Number(d.get("pot") || 0),
        players: (Array.isArray(d.get("players")) ? d.get("players") : []).map((p: any) => ({
          uid: String(p.uid), name: String(p.name || "Player"), dice: Number(p.dice) || 0,
        })),
        turnUid: String(d.get("turnUid") || ""),
        bid: d.get("bid") ? { uid: String(d.get("bid").uid), name: String(d.get("bid").name), q: Number(d.get("bid").q), f: Number(d.get("bid").f) } : null,
        bids: (Array.isArray(d.get("bids")) ? d.get("bids") : []).map((b: any) => ({ name: String(b.name), q: Number(b.q), f: Number(b.f) })),
        reveal: lr
          ? {
              dice: Object.fromEntries(Object.entries(lr.dice || {}).map(([k, v]) => [k, Array.isArray(v) ? v.map(Number) : []])),
              face: Number(lr.face) || 0, q: Number(lr.q) || 0, count: Number(lr.count) || 0, timeout: lr.timeout === true,
              caller: String(lr.caller || ""), bidder: String(lr.bidder || ""), loser: String(lr.loser || ""),
            }
          : null,
        winner: w && typeof w.name === "string" ? { name: w.name, win: Number(w.win) || 0 } : null,
        phaseEndsAt: Number(d.get("phaseEndsAt") || 0),
      });
    });
  }, [on, uid]);

  // my own secret dice
  useEffect(() => {
    if (!on || !uid) return;
    return onSnapshot(
      doc(db, "room_game", LIAR_DICE_ROOM, "liar_hands", uid),
      (d) => setHand({ round: Number(d.get("round") || 0), dice: Array.isArray(d.get("dice")) ? d.get("dice").map(Number) : [] }),
      () => {}
    );
  }, [on, uid]);

  // countdown + nudging the server when a timer is up (the watchdog is the backup)
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => {
      const n = serverNow();
      setNow(n);
      const due = g.phaseEndsAt > 0 && n >= g.phaseEndsAt + 400;
      if (g.running && (due || g.phase === "OVER") && Date.now() - lastTick.current > 2000 && document.visibilityState === "visible") {
        lastTick.current = Date.now();
        tickCall({}).catch(() => {});
      }
    }, 300);
    return () => clearInterval(t);
  }, [on, g.running, g.phase, g.phaseEndsAt]);

  if (!on || !uid) return null;
  const run = (p: Promise<unknown>) => {
    setBusy(true);
    p.catch((e) => noteRef.current(`${BOT}: ${errText(e)}`)).finally(() => setBusy(false));
  };
  return {
    uid,
    running: g.running,
    phase: g.phase,
    gameNo: g.gameNo,
    roundNo: g.roundNo,
    entry: g.entry,
    pot: g.pot,
    players: g.players,
    turnUid: g.turnUid,
    bid: g.bid,
    bids: g.bids,
    reveal: g.reveal,
    winner: g.winner,
    secondsLeft: g.running && g.phaseEndsAt > 0 ? Math.max(0, Math.ceil((g.phaseEndsAt - now) / 1000)) : 0,
    myDice: hand.round === g.roundNo ? hand.dice : [],
    busy,
    start: (entry) => !busy && run(startCall(entry ? { entry } : {})),
    join: () => !busy && run(joinCall({})),
    bidMove: (q, f) => !busy && run(bidCall({ q, f })),
    callLiar: () => !busy && run(liarCall({})),
  };
}

/** Chat commands in the Liar's Dice room. True = handled (not posted as chat). */
export function liarDiceHandleCommand(state: LiarDiceState, clean: string, note: (t: string) => void): boolean {
  const parts = clean.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  if (cmd === "!start") {
    const entry = Number(parts[1]);
    if (parts[1] && !(entry > 0)) note(`${BOT}: Use !start or !start 500 (entry in coins)`);
    else state.start(parts[1] ? Math.floor(entry) : undefined);
    return true;
  }
  if (cmd === "!j" || cmd === "!join") {
    state.join();
    return true;
  }
  if (cmd === "!b" || cmd === "!bid") {
    const q = Number(parts[1]);
    const f = Number(parts[2]);
    if (!Number.isInteger(q) || !Number.isInteger(f) || f < 1 || f > 6) note(`${BOT}: Use !b [how many] [face 1-6] — e.g. !b 4 5`);
    else state.bidMove(q, f);
    return true;
  }
  if (cmd === "!liar" || cmd === "!call") {
    state.callLiar();
    return true;
  }
  if (cmd === "!help") {
    note(`${BOT}: !start · !j · !b [how many] [face] · !liar · bid higher or call LIAR — the last one with dice wins 90% of the pot`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- look
const LD_RULES: [string, string][] = [
  ["▶ Start", "Anyone taps Open table (or types !start). For 20 seconds players tap Join (or type !j). 2–6 players; each pays the entry (1,000 coins, or !start 500) into the pot."],
  ["🎲 Your dice", "Everyone gets 3 dice under a cup. Only you can see your own dice."],
  ["🗣 Bidding", "In turn, say how many dice of one face the WHOLE table has at least — e.g. \"4 × ⚄\". Each bid must go higher: more dice, or the same number of a higher face. 20 seconds per turn."],
  ["🤥 LIAR!", "Instead of bidding, call LIAR on the bid before you. All cups go up and the dice are counted."],
  ["⚖️ Who loses a die", "If the table really has at least that many, the caller loses a die. If not, the bidder (the liar) loses a die. Running out of time also costs a die."],
  ["🏆 Winning", "No dice left = you're out. The last player with dice wins 90% of the pot."],
  ["💡 Tip", "Bluff with confidence — and count your own dice before you believe anyone!"],
];

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export function Die({ n, size = 30, tone = "plain" }: { n: number; size?: number; tone?: "plain" | "hit" | "dim" }) {
  const pip = Math.max(3, Math.round(size / 5));
  return (
    <span
      className="inline-grid shrink-0 rounded-[22%] align-middle"
      style={{
        width: size,
        height: size,
        padding: size / 7,
        gridTemplate: "repeat(3,1fr)/repeat(3,1fr)",
        background: tone === "hit" ? "#FFE082" : "#fff",
        boxShadow: tone === "hit" ? "0 0 0 2px #FFC107,0 0 10px #FFC107" : "0 2px 0 #bbb",
        opacity: tone === "dim" ? 0.35 : 1,
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <i
          key={i}
          className="self-center justify-self-center rounded-full bg-[#1B2440]"
          style={{ width: pip, height: pip, visibility: PIPS[n]?.includes(i) ? "visible" : "hidden" }}
        />
      ))}
    </span>
  );
}

const SEAT_COLORS = ["#7B5CF0", "#E53935", "#FB8C00", "#1E88E5", "#43A047", "#D81B60"];

const FOLD_KEY = "migwith.liarDiceFolded";
// seconds each phase lasts on the server (LD_JOIN_MS / LD_TURN_MS / LD_REVEAL_MS)
const LD_PHASE_SECS: Record<string, number> = { JOINING: 20, BIDDING: 20, REVEAL: 5 };

// Chance that the table holds at least q dice showing f: my own dice are known,
// every other die is a 1-in-6 guess.
export function ldOdds(q: number, f: number, myDice: number[], totalDice: number): number {
  const need = q - myDice.filter((x) => x === f).length;
  const n = totalDice - myDice.length;
  if (need <= 0) return 1;
  if (need > n) return 0;
  let p = 0;
  let c = 1; // n choose i
  for (let i = 0; i <= n; i++) {
    if (i > 0) c = (c * (n - i + 1)) / i;
    if (i >= need) p += c * Math.pow(1 / 6, i) * Math.pow(5 / 6, n - i);
  }
  return p;
}

// The safest move: raise on the face that is most likely there; open on the face
// I hold most of, as high as still stays more likely true than not.
export function ldSafeBid(bid: { q: number; f: number } | null, myDice: number[], totalDice: number) {
  if (!myDice.length || totalDice < 1) return null;
  let best: { q: number; f: number; p: number } | null = null;
  for (let f = 1; f <= 6; f++) {
    let q = bid ? (f > bid.f ? bid.q : bid.q + 1) : 1;
    if (!bid) while (q < totalDice && ldOdds(q + 1, f, myDice, totalDice) >= 0.6) q++;
    if (q > totalDice) continue;
    const p = ldOdds(q, f, myDice, totalDice);
    if (!best || p > best.p || (p === best.p && q > best.q)) best = { q, f, p };
  }
  return best;
}

const LD_CSS = `@keyframes ldPulse{0%,100%{box-shadow:0 0 0 1.5px #FFD54A,0 0 0 0 rgba(255,213,74,.6)}50%{box-shadow:0 0 0 1.5px #FFD54A,0 0 0 6px rgba(255,213,74,0)}}
@keyframes ldShake{0%,100%{transform:rotate(0)}25%{transform:rotate(-9deg)}75%{transform:rotate(9deg)}}
.ld-turn{animation:ldPulse 1.4s infinite}.ld-turn .ld-cup{animation:ldShake .5s infinite}`;

// Compact box (miglife: "the room's chat must stay visible"): the players as one
// row of chips instead of a big table, the bid / result on one line, my dice and
// my move in a slim strip — and ▾ folds it all to a single line.
export function LiarDicePanel({ state }: { state: LiarDiceState }) {
  const me = state.players.find((p) => p.uid === state.uid);
  const seated = !!me;
  const myTurn = state.phase === "BIDDING" && state.turnUid === state.uid;
  const totalDice = state.players.reduce((a, p) => a + p.dice, 0);
  // my bid picker: starts at the smallest legal raise
  const minQ = state.bid ? (state.bid.f < 6 ? state.bid.q : state.bid.q + 1) : 1;
  const minF = state.bid ? (state.bid.f < 6 ? state.bid.f + 1 : state.bid.f) : 2;
  const [q, setQ] = useState(minQ);
  const [f, setF] = useState(minF);
  const bidKey = `${state.roundNo}:${state.bid?.q ?? 0}:${state.bid?.f ?? 0}`;
  useEffect(() => {
    setQ(minQ);
    setF(minF);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidKey]);
  const legal = q >= 1 && q <= totalDice && (!state.bid || q > state.bid.q || (q === state.bid.q && f > state.bid.f));
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(FOLD_KEY) === "1";
    } catch {
      return false;
    }
  });
  const fold = (v: boolean) => {
    setFolded(v);
    try {
      localStorage.setItem(FOLD_KEY, v ? "1" : "0");
    } catch {
      // storage blocked
    }
  };
  // my turn always opens the box
  const open = !folded || myTurn;
  const phaseSecs = LD_PHASE_SECS[state.phase] || 0;
  const odds = state.phase === "BIDDING" && state.bid && state.myDice.length ? ldOdds(state.bid.q, state.bid.f, state.myDice, totalDice) : null;
  const safe = myTurn ? ldSafeBid(state.bid, state.myDice, totalDice) : null;
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  const revealing = state.phase === "REVEAL" && state.reveal;
  const turnName = state.players.find((p) => p.uid === state.turnUid)?.name || "";
  const gameOver = state.phase === "OVER" || (!state.running && !!state.winner);
  const status =
    state.phase === "JOINING"
      ? `Table open · ${state.players.length}/6 · ${state.secondsLeft}s`
      : state.phase === "BIDDING"
        ? `R${state.roundNo} · ${myTurn ? "your turn" : `${turnName}'s turn`} · ${state.secondsLeft}s`
        : state.phase === "REVEAL"
          ? "🔓 Cups up!"
          : gameOver
            ? "🏁 Game over"
            : "bluff and catch the liars";

  // the one line in the middle: the bid, what the cups showed, or the winner
  const middle = (() => {
    if (state.phase === "JOINING") return <span>🎟 {fmt(state.entry)} · waiting for players…</span>;
    if (state.phase === "BIDDING")
      return state.bid ? (
        <span className="inline-flex items-center gap-1">
          {state.bid.name}: at least <b className="text-[14px]">{state.bid.q} ×</b> <Die n={state.bid.f} size={18} />
        </span>
      ) : (
        <span>{turnName} makes the first bid…</span>
      );
    if (revealing && !state.reveal!.timeout) {
      const r = state.reveal!;
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          🤥 {r.caller} called {r.bidder}: found <b>{r.count} ×</b> <Die n={r.face} size={16} /> of {r.q} →{" "}
          <b className={r.count >= r.q ? "text-[#9FF5B5]" : "text-[#FF8A80]"}>{r.count >= r.q ? "TRUE" : "LIE!"}</b> · {r.loser} −1 🎲
        </span>
      );
    }
    if (revealing) return <span>⏰ {state.reveal!.loser} ran out of time · −1 🎲</span>;
    if (gameOver && state.winner)
      return (
        <span>
          🏆 <b className="text-[#FFD54A]">{state.winner.name}</b> wins {fmt(state.winner.win)} coins
        </span>
      );
    return <span>🎲 2–6 players · 3 secret dice each · last one standing wins</span>;
  })();

  return (
    <div
      className="relative mx-2.5 my-1 overflow-hidden rounded-[18px] px-2.5 py-2 text-white shadow-[0_8px_20px_rgba(123,92,240,.4)]"
      style={{ background: "linear-gradient(135deg,#FF6A88,#7B5CF0 55%,#3A1C71)" }}
    >
      <style>{LD_CSS}</style>
      <div className="flex items-center gap-1.5 text-[12px] font-black">
        <span className="shrink-0">{state.running ? `🎲 #${state.gameNo}` : "🎲 LIAR'S DICE"}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-extrabold text-white/85">· {status}</span>
        {state.running && <span className="shrink-0 rounded-[9px] bg-white/[0.14] px-1.5 py-[2px] text-[11px]">💰 {fmt(state.pot)}</span>}
        <RulesButton title="🎲 Liar's Dice — Rules" rules={LD_RULES} />
        <button type="button" onClick={() => fold(!folded)} aria-label={folded ? "Open" : "Fold"} className="shrink-0 rounded-lg bg-white/[0.14] px-1.5 text-[13px] leading-[20px]">
          {open ? "▾" : "▴"}
        </button>
      </div>
      {/* ⏳ time left in this phase */}
      {phaseSecs > 0 && (
        <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/[0.15]">
          <b
            className="block h-full rounded-full transition-[width] duration-1000 ease-linear"
            style={{ width: `${Math.max(0, Math.min(100, (state.secondsLeft / phaseSecs) * 100))}%`, background: "linear-gradient(90deg,#fff,#FFD54A)" }}
          />
        </div>
      )}

      {!open ? (
        // folded: one line — the bid / result and my dice
        <div className="mt-1 flex items-center gap-2 text-[11.5px] font-bold">
          <span className="min-w-0 flex-1 truncate">{middle}</span>
          {seated && state.myDice.length > 0 && (
            <span className="flex shrink-0 gap-[3px]">
              🔒{state.myDice.map((n, i) => <Die key={i} n={n} size={16} />)}
            </span>
          )}
        </div>
      ) : (
        <>
          {/* the players, one row of chips (whose turn glows) */}
          {state.players.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {state.players.map((p, i) => {
                const out = state.running && state.phase !== "JOINING" && p.dice === 0;
                const turn = state.phase === "BIDDING" && p.uid === state.turnUid;
                const shown = revealing ? state.reveal!.dice[p.name] || [] : null;
                return (
                  <span
                    key={p.uid}
                    className={`inline-flex items-center gap-1 rounded-full py-[2px] pl-[2px] pr-2 text-[11px] font-black ${out ? "opacity-35 grayscale" : ""} ${turn ? "ld-turn" : ""}`}
                    style={{ background: turn ? "rgba(255,255,255,.38)" : "rgba(255,255,255,.18)" }}
                  >
                    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px]" style={{ background: SEAT_COLORS[i % SEAT_COLORS.length] }}>
                      {p.name.slice(0, 1).toUpperCase()}
                    </span>
                    {p.uid === state.uid ? "you" : p.name}
                    {state.phase !== "JOINING" &&
                      (shown
                        ? shown.map((n, k) => <Die key={k} n={n} size={14} tone={state.reveal!.timeout ? "plain" : n === state.reveal!.face ? "hit" : "dim"} />)
                        : Array.from({ length: p.dice }, (_, k) => (
                            <span key={k} className="ld-cup h-[11px] w-[9px] rounded-[3px_3px_4px_4px]" style={{ background: "linear-gradient(180deg,#B5651D,#7A3E12)" }} />
                          )))}
                  </span>
                );
              })}
            </div>
          )}

          {/* the bid / result line */}
          <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-white/[0.18] px-2.5 py-1.5 text-[12px] font-bold backdrop-blur-sm">
            <span className="min-w-0 flex-1">{middle}</span>
            {odds !== null && (
              <span
                className="shrink-0 rounded-[9px] px-[7px] py-[2px] text-[10.5px] font-black"
                style={odds >= 0.5 ? { background: "rgba(46,204,113,.3)", color: "#B9FFD0" } : odds >= 0.3 ? { background: "rgba(255,213,74,.3)", color: "#FFF3B0" } : { background: "rgba(255,61,0,.35)", color: "#FFD0C2" }}
              >
                📊 সত্যি হওয়ার সম্ভাবনা {pct(odds)}
              </span>
            )}
          </div>
          {/* this round's bids so far */}
          {state.phase === "BIDDING" && state.bids.length > 1 && (
            <div className="mt-1 flex gap-1 overflow-hidden whitespace-nowrap text-[10px] font-extrabold opacity-85">
              {state.bids.slice(-4).map((b, i) => (
                <span key={i} className="inline-flex shrink-0 items-center gap-[3px] rounded-[7px] bg-white/[0.15] px-1.5 py-[1px]">
                  {b.name} {b.q}× <Die n={b.f} size={11} />
                </span>
              ))}
            </div>
          )}

          {/* my dice + my move */}
          {seated && state.running && state.phase !== "JOINING" && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-[10.5px] font-black text-white/85">🔒</span>
              {state.myDice.length ? (
                state.myDice.map((n, i) => <Die key={i} n={n} size={24} tone={(revealing ? !state.reveal!.timeout && n === state.reveal!.face : state.phase === "BIDDING" && n === state.bid?.f) ? "hit" : "plain"} />)
              ) : (
                <span className="text-[11px] font-black text-white/85">{me && me.dice === 0 ? "you are out" : "…"}</span>
              )}
              {myTurn && (
                <>
                  <span className="flex-1" />
                  <button type="button" onClick={() => setQ((x) => Math.max(1, x - 1))} className="h-8 w-8 rounded-lg bg-white/15 text-[15px] font-black">
                    −
                  </button>
                  <span className="flex h-8 items-center gap-1 rounded-lg bg-[#fff] px-2 text-[15px] font-black text-[#4A2A7A]">
                    {q}× <Die n={f} size={18} />
                  </span>
                  <button type="button" onClick={() => setQ((x) => Math.min(totalDice, x + 1))} className="h-8 w-8 rounded-lg bg-white/15 text-[15px] font-black">
                    +
                  </button>
                </>
              )}
            </div>
          )}
          {myTurn && (
            <div className="mt-1.5 flex items-center gap-1">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button" onClick={() => setF(n)} className={`rounded-lg p-[2px] ${f === n ? "bg-[#FFD54A]" : "bg-white/[0.15]"}`}>
                  <Die n={n} size={20} />
                </button>
              ))}
              <button
                type="button"
                disabled={!legal || state.busy}
                onClick={() => state.bidMove(q, f)}
                className="ml-1 h-9 flex-1 rounded-[11px] text-[13px] font-black disabled:opacity-40"
                style={{ background: "linear-gradient(90deg,#00C9A7,#00B4D8)" }}
              >
                ⬆ Bid
              </button>
              {state.bid && (
                <button
                  type="button"
                  disabled={state.busy}
                  onClick={state.callLiar}
                  className="h-9 flex-1 rounded-[11px] text-[13px] font-black"
                  style={{ background: "linear-gradient(90deg,#FF3D00,#C51162)" }}
                >
                  🤥 LIAR!
                </button>
              )}
            </div>
          )}
          {/* 💡 tap to use the safest bid */}
          {safe && state.bid && odds !== null && 1 - odds > safe.p ? (
            <div className="mt-1.5 text-[10.5px] font-extrabold text-white/90">
              💡 {pct(1 - odds)} chance {state.bid.name} is lying — LIAR ডাকাই ভালো
            </div>
          ) : safe && (
            <button
              type="button"
              onClick={() => {
                setQ(safe.q);
                setF(safe.f);
              }}
              className="mt-1.5 flex items-center gap-1 text-left text-[10.5px] font-extrabold text-white/90"
            >
              💡 Safe bid: {safe.q}× <Die n={safe.f} size={12} /> ({pct(safe.p)}) · তোমার হাতে <Die n={safe.f} size={12} />{" "}
              {state.myDice.filter((x) => x === safe.f).length} টা আছে
            </button>
          )}

          {/* results */}
          {!state.running && state.winner && state.players.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {state.players.map((p) => (
                <span key={p.uid} className={`rounded-lg px-[7px] py-[2px] text-[10.5px] font-black ${p.name === state.winner!.name ? "bg-[#2ECC71]" : "bg-[#E53935]"}`}>
                  {p.name === state.winner!.name ? `🏆 ${p.name} +${fmt(state.winner!.win)}` : `${p.name} −${fmt(state.entry)}`}
                </span>
              ))}
            </div>
          )}

          {/* join / open */}
          {state.phase === "JOINING" && !seated && (
            <button type="button" onClick={state.join} className="mt-1.5 h-9 w-full rounded-[11px] text-[13.5px] font-black" style={{ background: "linear-gradient(90deg,#00C9A7,#00B4D8)" }}>
              {state.busy ? "…" : `🪑 Join (${fmt(state.entry)})`}
            </button>
          )}
          {!state.running && (
            <button type="button" onClick={() => state.start()} className="mt-1.5 h-9 w-full rounded-[11px] text-[13.5px] font-black" style={{ background: "linear-gradient(90deg,#00C9A7,#00B4D8)" }}>
              {state.busy ? "…" : state.winner ? "🔁 Play again (1,000)" : "🎲 Open a table (1,000)"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
