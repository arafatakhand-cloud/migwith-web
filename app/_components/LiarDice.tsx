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

  // seats around the table, me at the bottom
  const order = [...state.players];
  const myIdx = order.findIndex((p) => p.uid === state.uid);
  const seats = myIdx > 0 ? [...order.slice(myIdx), ...order.slice(0, myIdx)] : order;
  const revealing = state.phase === "REVEAL" && state.reveal;
  const turnName = state.players.find((p) => p.uid === state.turnUid)?.name || "";

  return (
    <div
      className="relative mx-2.5 my-1.5 overflow-hidden rounded-[22px] border border-[#FFD678]/25 px-3 py-3 text-white shadow-[0_12px_28px_rgba(40,20,80,.35)]"
      style={{ background: "radial-gradient(120% 80% at 50% 0%,#5A2D82,#24123F 60%,#160B28)" }}
    >
      <div className="flex items-center text-[12.5px] font-black tracking-wide">
        <span className="flex-1">🎲 LIAR&apos;S DICE{state.gameNo ? ` · #${state.gameNo}` : ""}</span>
        <RulesButton title="🎲 Liar's Dice — Rules" rules={LD_RULES} />
        {state.running && <span className="rounded-[10px] bg-white/[0.14] px-2 py-[3px] text-[11.5px]">💰 {fmt(state.pot)}</span>}
      </div>
      <p className="mt-0.5 text-[11px] font-extrabold text-[#CDB8FF]">
        {state.phase === "JOINING"
          ? `Table open · ${state.players.length}/6 seats · starts in ${state.secondsLeft}s`
          : state.phase === "BIDDING"
            ? `Round ${state.roundNo} · ${myTurn ? "your turn" : `${turnName}'s turn`} · ${state.secondsLeft}s`
            : state.phase === "REVEAL"
              ? "🔓 Cups up!"
              : state.phase === "OVER" || (!state.running && state.winner)
                ? "🏁 Game over"
                : "ধাপ্পাবাজি — bluff and catch the liars"}
      </p>

      {/* the table */}
      <div
        className="relative mt-2.5 h-[240px] rounded-[50%/40%] border-[6px] border-[#6B3E1F] shadow-[inset_0_0_30px_rgba(0,0,0,.45),0_6px_0_#3E220F]"
        style={{ background: "radial-gradient(ellipse at center,#1F7A4D,#145C39 70%,#0E4229)" }}
      >
        {seats.map((p, i) => {
          const a = Math.PI / 2 + (i * 2 * Math.PI) / Math.max(seats.length, 2);
          const x = 50 + 40 * Math.cos(a);
          const y = 47 + 33 * Math.sin(a);
          const out = state.running && state.phase !== "JOINING" && p.dice === 0;
          const turn = state.phase === "BIDDING" && p.uid === state.turnUid;
          const shown = revealing ? state.reveal!.dice[p.name] || [] : null;
          const color = SEAT_COLORS[state.players.findIndex((x) => x.uid === p.uid) % SEAT_COLORS.length];
          return (
            <div key={p.uid} className={`absolute w-[104px] -translate-x-1/2 -translate-y-1/2 text-center ${out ? "opacity-35 grayscale" : ""}`} style={{ left: `${x}%`, top: `${y}%` }}>
              <div
                className="mx-auto flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-white/70 text-[14px] font-black"
                style={{ background: color, boxShadow: turn ? "0 0 0 3px #FFD54A,0 0 14px #FFD54A" : undefined }}
              >
                {p.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="truncate text-[11px] font-black [text-shadow:0_1px_2px_#000]">
                {p.uid === state.uid ? "you" : p.name}
                {turn ? " 🎯" : ""}
              </div>
              {state.phase !== "JOINING" && (
                <div className="mt-0.5 flex justify-center gap-[2px]">
                  {shown
                    ? shown.map((n, k) => <Die key={k} n={n} size={18} tone={state.reveal!.timeout ? "plain" : n === state.reveal!.face ? "hit" : "dim"} />)
                    : Array.from({ length: p.dice }, (_, k) => (
                        <span key={k} className="h-[16px] w-[14px] rounded-[4px_4px_6px_6px] shadow-[inset_0_2px_0_rgba(255,255,255,.3)]" style={{ background: "linear-gradient(180deg,#B5651D,#7A3E12)" }} />
                      ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="absolute left-1/2 top-1/2 w-[190px] -translate-x-1/2 -translate-y-1/2 text-center">
          {state.phase === "JOINING" && (
            <>
              <p className="text-[15px] font-black">Waiting for players…</p>
              <p className="mt-1 text-[12px] text-[#DCEFDC]">🎟 {fmt(state.entry)} · 💰 {fmt(state.pot)}</p>
            </>
          )}
          {state.phase === "BIDDING" &&
            (state.bid ? (
              <>
                <p className="mb-1 text-[11px] text-[#DCEFDC]">{state.bid.name} says the table has at least</p>
                <span className="inline-flex items-center gap-1.5 rounded-[14px] border-[1.5px] border-[#FFD54A] bg-black/45 px-3 py-1.5 text-[16px] font-black">
                  {state.bid.q} × <Die n={state.bid.f} size={22} />
                </span>
              </>
            ) : (
              <p className="text-[13px] font-black">{turnName} makes the first bid…</p>
            ))}
          {revealing && !state.reveal!.timeout && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-[14px] border-[1.5px] border-[#FFD54A] bg-black/45 px-3 py-1.5 text-[15px] font-black">
                found {state.reveal!.count} × <Die n={state.reveal!.face} size={20} />
              </span>
              <p className="mt-1.5 text-[13px] font-black">
                {state.reveal!.bidder} said {state.reveal!.q} →{" "}
                {state.reveal!.count >= state.reveal!.q ? <span className="text-[#9FF5B5]">TRUE</span> : <span className="text-[#FF8A80]">LIE!</span>}
              </p>
            </>
          )}
          {revealing && state.reveal!.timeout && <p className="text-[13px] font-black">⏰ {state.reveal!.loser} ran out of time</p>}
          {(state.phase === "OVER" || (!state.running && state.winner)) && state.winner && (
            <>
              <p className="text-[26px] font-black text-[#FFD54A]">🏆 {state.winner.name}</p>
              <p className="font-black">wins {fmt(state.winner.win)} coins</p>
            </>
          )}
          {!state.running && !state.winner && <p className="text-[14px] font-black">🎲 Open a table and bluff!</p>}
        </div>
      </div>

      {/* 📣 the call, big */}
      {revealing && (
        <div className="mt-2 rounded-2xl border-2 border-[#FFD54A] bg-[#0F051E]/90 px-3 py-2 text-center">
          {state.reveal!.timeout ? (
            <p className="text-[14px] font-black">⏰ {state.reveal!.loser} loses a die</p>
          ) : (
            <>
              <p className="text-[22px] font-black tracking-wider text-[#FF5252]">🤥 LIAR!</p>
              <p className="text-[13px] font-black">
                {state.reveal!.caller} called {state.reveal!.bidder} · {state.reveal!.loser} loses a die 🎲➖
              </p>
            </>
          )}
        </div>
      )}

      {/* 🔒 my dice */}
      {seated && state.running && state.phase !== "JOINING" && (
        <div className="mt-2.5 rounded-2xl border border-white/[0.12] bg-white/[0.08] p-2.5">
          <p className="mb-1.5 text-[11px] font-black text-[#CDB8FF]">🔒 YOUR DICE{me && me.dice === 0 ? " · you are out" : " (secret)"}</p>
          <div className="flex gap-1.5">
            {state.myDice.map((n, i) => (
              <Die key={i} n={n} size={32} tone={revealing && !state.reveal!.timeout && n === state.reveal!.face ? "hit" : "plain"} />
            ))}
          </div>
        </div>
      )}

      {/* 🗣 my move */}
      {myTurn && (
        <div className="mt-2 rounded-2xl bg-black/25 p-2.5">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setQ((x) => Math.max(1, x - 1))} className="h-9 w-9 rounded-xl bg-white/15 text-[17px] font-black">
              −
            </button>
            <span className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#fff] text-[19px] font-black text-[#4A2A7A]">
              {q} × <Die n={f} size={22} />
            </span>
            <button type="button" onClick={() => setQ((x) => Math.min(totalDice, x + 1))} className="h-9 w-9 rounded-xl bg-white/15 text-[17px] font-black">
              +
            </button>
          </div>
          <div className="mt-2 flex justify-between gap-1">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} type="button" onClick={() => setF(n)} className={`rounded-[10px] p-[3px] ${f === n ? "bg-[#FFD54A]" : "bg-white/[0.08]"}`}>
                <Die n={n} size={24} />
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={!legal || state.busy}
              onClick={() => state.bidMove(q, f)}
              className="h-11 flex-1 rounded-[13px] text-[14.5px] font-black disabled:opacity-40"
              style={{ background: "linear-gradient(90deg,#7B5CF0,#5AA2FF)" }}
            >
              ⬆ Bid {q} × {f}
            </button>
            {state.bid && (
              <button
                type="button"
                disabled={state.busy}
                onClick={state.callLiar}
                className="h-11 flex-1 rounded-[13px] text-[15px] font-black shadow-[0_4px_14px_rgba(213,0,0,.45)]"
                style={{ background: "linear-gradient(90deg,#FF5252,#D50000)" }}
              >
                🤥 LIAR!
              </button>
            )}
          </div>
          {!legal && <p className="mt-1.5 text-[11px] font-bold text-[#FFB4AB]">Bid higher: more dice, or the same number of a higher face.</p>}
        </div>
      )}

      {/* bid history */}
      {state.phase === "BIDDING" && state.bids.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {state.bids.map((b, i) => (
            <span key={i} className={`rounded-lg px-[7px] py-[2px] text-[10.5px] font-extrabold ${i === state.bids.length - 1 ? "bg-[#7B5CF0]" : "bg-white/10"}`}>
              {b.name}: {b.q}×{b.f}
            </span>
          ))}
        </div>
      )}

      {/* results */}
      {!state.running && state.winner && state.players.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {state.players.map((p) => (
            <span key={p.uid} className={`rounded-lg px-[7px] py-[2px] text-[11px] font-black ${p.name === state.winner!.name ? "bg-[#2ECC71]" : "bg-[#E53935]"}`}>
              {p.name === state.winner!.name ? `🏆 ${p.name} +${fmt(state.winner!.win)}` : `${p.name} −${fmt(state.entry)}`}
            </span>
          ))}
        </div>
      )}

      {/* join / open */}
      {state.phase === "JOINING" && !seated && (
        <button type="button" onClick={state.join} className="mt-2.5 h-11 w-full rounded-[13px] text-[15px] font-black" style={{ background: "linear-gradient(90deg,#7B5CF0,#5AA2FF)" }}>
          {state.busy ? "…" : `🪑 Join (${fmt(state.entry)})`}
        </button>
      )}
      {state.phase === "JOINING" && seated && <p className="mt-2 text-center text-[12px] font-black text-[#CDB8FF]">✅ You are seated — waiting for players…</p>}
      {!state.running && (
        <button type="button" onClick={() => state.start()} className="mt-2.5 h-11 w-full rounded-[13px] text-[15px] font-black" style={{ background: "linear-gradient(90deg,#7B5CF0,#5AA2FF)" }}>
          {state.busy ? "…" : state.winner ? "🔁 Play again (1,000)" : "🎲 Open a table (1,000)"}
        </button>
      )}
    </div>
  );
}
