"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { CardBack, MiniCard } from "./Cards";

// 🃏 29 (Twenty-Nine) — server-driven (tnStart / tnJoin / tnAction / tnTick).
// 4 seats, teams A (seats 1+3) vs B (seats 2+4); empty seats get bots. Your own
// cards come from room_game/{room}/tn_hands/{uid}, which only you can read.
// Same flow as TwentyNineGame.kt.

export const TN_ROOM = "🃏 29 Official";

const ENTRY_OPTIONS = [100, 200, 500, 1000, 2000, 5000];
const RANKS = ["7", "8", "Q", "K", "10", "A", "9", "J"];
const SUITS = ["♠", "♥", "♣", "♦"];

const startCall = httpsCallable(functions, "tnStart");
const joinCall = httpsCallable(functions, "tnJoin");
const actionCall = httpsCallable(functions, "tnAction");
const tickCall = httpsCallable(functions, "tnTick");

type Seat = { uid: string; username: string; bot: boolean; auto: boolean } | null;
type TrickCard = { seat: number; card: string };

export type TnState = {
  running: boolean;
  phase: string;
  round: number;
  entry: number;
  pot: number;
  seats: Seat[];
  dealer: number;
  turn: number;
  bid: number;
  bidder: number;
  target: number;
  doubleLevel: number;
  singleSeat: number;
  trumpRevealed: boolean;
  trumpSuit: string | null;
  trick: TrickCard[];
  ledSuit: string | null;
  points: [number, number];
  tricksPlayed: number;
  mustTrumpSeat: number;
  resultWinTeam: number;
  resultShare: number;
  match: [number, number];
  dealNo: number;
  lastDeal: { winTeam: number; gp: number; bidderTeam: number };
  myCards: string[];
  myTrump: string | null;
  secondsLeft: number;
  busy: boolean;
  mySeat: number;
  start: (entry: number) => void;
  join: (seat?: number) => void;
  act: (type: string, extra?: Record<string, unknown>) => void;
};

function opId(): string {
  return "tn_" + crypto.randomUUID().replace(/-/g, "");
}

function pair(v: unknown): [number, number] {
  return Array.isArray(v) && v.length === 2 ? [Number(v[0]) || 0, Number(v[1]) || 0] : [0, 0];
}

export function useTwentyNine(enabled: boolean, uid: string | undefined, note: (t: string) => void): TnState | null {
  const [g, setG] = useState({
    running: false,
    phase: "IDLE",
    phaseEndsAt: 0,
    round: 0,
    entry: 500,
    pot: 0,
    seats: [null, null, null, null] as Seat[],
    dealer: 0,
    turn: -1,
    bid: 0,
    bidder: -1,
    target: 0,
    doubleLevel: 1,
    singleSeat: -1,
    trumpRevealed: false,
    trumpSuit: null as string | null,
    trick: [] as TrickCard[],
    ledSuit: null as string | null,
    points: [0, 0] as [number, number],
    tricksPlayed: 0,
    mustTrumpSeat: -1,
    resultWinTeam: -1,
    resultShare: 0,
    match: [0, 0] as [number, number],
    dealNo: 0,
    lastDeal: { winTeam: -1, gp: 0, bidderTeam: -1 },
  });
  const [hand, setHand] = useState({ round: 0, cards: [] as string[], trump: null as string | null });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const lastTick = useRef(0);
  const noteRef = useRef(note);
  noteRef.current = note;

  // The table.
  useEffect(() => {
    if (!enabled || !uid) return;
    return onSnapshot(doc(db, "room_game", TN_ROOM), (d) => {
      if (!d.exists()) {
        setG((prev) => ({ ...prev, running: false, phase: "IDLE" }));
        return;
      }
      const rawSeats = d.get("seats");
      const res = (d.get("result") || {}) as Record<string, any>;
      const ld = (d.get("lastDeal") || {}) as Record<string, any>;
      const rawTrick = d.get("trick");
      setG({
        running: d.get("running") === true,
        phase: String(d.get("phase") || "IDLE"),
        phaseEndsAt: Number(d.get("phaseEndsAt") || 0),
        round: Number(d.get("roundNumber") || 0),
        entry: Number(d.get("entry") || 500),
        pot: Number(d.get("pot") || 0),
        seats: [0, 1, 2, 3].map((i) => {
          const m = Array.isArray(rawSeats) ? rawSeats[i] : null;
          return m && typeof m === "object"
            ? {
                uid: String(m.uid || ""),
                username: String(m.username || ""),
                bot: m.bot === true,
                auto: m.auto === true,
              }
            : null;
        }),
        dealer: Number(d.get("dealer") || 0),
        turn: Number(d.get("turn") ?? -1),
        bid: Number(d.get("bid") || 0),
        bidder: Number(d.get("bidder") ?? -1),
        target: Number(d.get("target") || 0),
        doubleLevel: Number(d.get("doubleLevel") || 1),
        singleSeat: Number(d.get("singleSeat") ?? -1),
        trumpRevealed: d.get("trumpRevealed") === true,
        trumpSuit: d.get("trumpSuit") ? String(d.get("trumpSuit")) : null,
        trick: Array.isArray(rawTrick)
          ? rawTrick.map((t: any) => ({ seat: Number(t?.seat || 0), card: String(t?.card || "") }))
          : [],
        ledSuit: d.get("ledSuit") ? String(d.get("ledSuit")) : null,
        points: pair(d.get("points")),
        tricksPlayed: Number(d.get("tricksPlayed") || 0),
        mustTrumpSeat: Number(d.get("mustTrumpSeat") ?? -1),
        resultWinTeam: Number(res.winTeam ?? -1),
        resultShare: Number(res.share || 0),
        match: pair(d.get("match")),
        dealNo: Number(d.get("dealNo") || 0),
        lastDeal: {
          winTeam: Number(ld.winTeam ?? -1),
          gp: Number(ld.gp || 0),
          bidderTeam: Number(ld.bidderTeam ?? -1),
        },
      });
    });
  }, [enabled, uid]);

  // My own cards (only I can read them).
  useEffect(() => {
    if (!enabled || !uid) return;
    return onSnapshot(doc(db, "room_game", TN_ROOM, "tn_hands", uid), (d) => {
      setHand({
        round: Number(d.get("round") || 0),
        cards: Array.isArray(d.get("cards")) ? d.get("cards").map(String) : [],
        trump: d.get("trump") ? String(d.get("trump")) : null,
      });
    });
  }, [enabled, uid]);

  // Countdown, and move the game on when a timer ends.
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (
        g.running &&
        g.phaseEndsAt > 0 &&
        document.visibilityState === "visible" &&
        n >= g.phaseEndsAt + 300 &&
        n - lastTick.current > 1200
      ) {
        lastTick.current = n;
        tickCall({}).catch(() => {});
      }
    }, 250);
    return () => clearInterval(t);
  }, [enabled, g.running, g.phaseEndsAt]);

  if (!enabled) return null;

  const run = (p: Promise<unknown>) => {
    setBusy(true);
    p.catch((err: any) => noteRef.current(`29 Bot: ${err?.message || "Something went wrong. Try again."}`)).finally(
      () => setBusy(false)
    );
  };

  const left = g.phaseEndsAt - now;
  const myCards = hand.round === g.round || g.round === 0 ? hand.cards : [];

  return {
    ...g,
    myCards,
    myTrump: hand.trump,
    secondsLeft: g.running && left > 0 ? Math.ceil(left / 1000) : 0,
    busy,
    mySeat: g.seats.findIndex((s) => s?.uid === uid),
    start: (entry: number) => {
      if (!busy) run(startCall({ entry, operationId: opId() }));
    },
    join: (seat = -1) => {
      if (!busy) run(joinCall({ seat, operationId: opId() }));
    },
    act: (type: string, extra: Record<string, unknown> = {}) => {
      if (!busy) run(actionCall({ type, round: g.round, ...extra }));
    },
  };
}

// Chat commands in the 29 room. True = handled (not posted as chat).
export function twentyNineHandleCommand(
  state: TnState,
  text: string,
  note: (t: string) => void,
  defaultEntry: number
): boolean {
  const parts = text.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  if (cmd === "!start") {
    const amt = Number((parts[1] || "").replace(/,/g, ""));
    state.start(Number.isInteger(amt) && amt > 0 ? amt : defaultEntry);
    return true;
  }
  if (cmd === "!j" || cmd === "!join") {
    state.join();
    return true;
  }
  if (cmd === "!auto") {
    const me = state.seats[state.mySeat];
    if (!me) note("29 Bot: You're not at this table.");
    else state.act("auto", { on: !me.auto });
    return true;
  }
  if (cmd === "!help") {
    note(
      "29 Bot: !start [entry] opens a table · !j sits down · empty seats get bots · Bid 16–28 · J>9>A>10>K>Q>8>7 · J3 9:2 A1 10:1 · follow suit · can't follow → ask for trump · Pair K+Q of trump ±4 · Double/Redouble · Single Hand = win all 8 alone"
    );
    return true;
  }
  return false;
}

function sortHand(cards: string[]): string[] {
  return [...cards].sort(
    (a, b) =>
      SUITS.indexOf(a.slice(-1)) - SUITS.indexOf(b.slice(-1)) ||
      RANKS.indexOf(a.slice(0, -1)) - RANKS.indexOf(b.slice(0, -1))
  );
}

function legalCards(state: TnState, seat: number): string[] {
  const hand = state.myCards;
  const trump = state.trumpSuit;
  if (state.mustTrumpSeat === seat && trump) {
    const t = hand.filter((c) => c.endsWith(trump));
    if (t.length) return t;
  }
  const led = state.ledSuit;
  if (!led) return hand;
  const f = hand.filter((c) => c.endsWith(led));
  return f.length ? f : hand;
}

const teamName = (seat: number) => (seat % 2 === 0 ? "A" : "B");

export function TwentyNineTable({ state }: { state: TnState }) {
  const [entry, setEntry] = useState(500);
  const [collapsed, setCollapsed] = useState(false);
  const mySeat = state.mySeat;

  const phaseLabel: Record<string, string> = {
    JOINING: "Seats",
    BIDDING: "Bidding",
    TRUMP: "Trump",
    DOUBLE: "Double?",
    SINGLE: "Single?",
    NEXTDEAL: "Next deal",
  };

  return (
    <div className="border-t border-blue-300/20 bg-gradient-to-b from-blue-900/40 to-transparent px-2 py-2">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-gradient-to-r from-blue-700 to-violet-600 px-2.5 py-0.5 text-sm font-black">
          🃏 29
        </span>
        {state.running && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              state.secondsLeft > 0 && state.secondsLeft <= 5 ? "bg-rose-500/80" : "bg-violet-600/80"
            }`}
          >
            {phaseLabel[state.phase] || `Trick ${state.tricksPlayed + 1}/8`} · {state.secondsLeft}s
          </span>
        )}
        {state.running && state.dealNo > 0 && (
          <span className="text-xs font-black text-white/80">
            A {state.match[0] > 0 ? `+${state.match[0]}` : state.match[0]} · B{" "}
            {state.match[1] > 0 ? `+${state.match[1]}` : state.match[1]} /6
          </span>
        )}
        {state.running && mySeat >= 0 && state.phase !== "JOINING" && (
          <button
            type="button"
            onClick={() => state.act("auto", { on: !state.seats[mySeat]?.auto })}
            disabled={state.busy}
            className={`rounded-full px-2 py-0.5 text-xs font-black ${
              state.seats[mySeat]?.auto ? "bg-emerald-600" : "border border-white/15 bg-white/5"
            }`}
          >
            🤖 Auto{state.seats[mySeat]?.auto ? " ON" : ""}
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

      {!collapsed &&
        (!state.running ? (
          <TnIdle state={state} entry={entry} setEntry={setEntry} />
        ) : state.phase === "JOINING" ? (
          <TnJoining state={state} />
        ) : (
          <>
            <TnInfo state={state} />
            <TnFelt state={state} />
            <TnActions state={state} />
            {mySeat >= 0 && <TnHand state={state} />}
          </>
        ))}
    </div>
  );
}

function TnIdle({ state, entry, setEntry }: { state: TnState; entry: number; setEntry: (n: number) => void }) {
  return (
    <div className="mt-2">
      {state.resultWinTeam >= 0 && (
        <p className="mb-2 text-center text-xs font-semibold text-white/80">
          Last match: Team {state.resultWinTeam === 0 ? "A" : "B"} won (A {state.match[0]} · B {state.match[1]})
          {state.resultShare > 0 ? ` · ${state.resultShare.toLocaleString()} coins each` : ""}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-white/50">Entry</span>
        {ENTRY_OPTIONS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setEntry(a)}
            className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
              entry === a ? "border-amber-300 bg-amber-300 text-neutral-900" : "border-white/10 text-white/70"
            }`}
          >
            {a >= 1000 ? `${a / 1000}K` : a}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => state.start(entry)}
        disabled={state.busy}
        className="mt-2 w-full rounded-xl bg-gradient-to-r from-amber-300 to-amber-500 py-2.5 text-sm font-black text-neutral-900 disabled:opacity-50"
      >
        🃏 Open a 29 table ({entry.toLocaleString()})
      </button>
      <p className="mt-1 text-center text-[10px] text-white/40">
        4 players · teams A vs B · empty seats get bots · first team to +6 wins 90% of the pot
      </p>
    </div>
  );
}

function TnJoining({ state }: { state: TnState }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-white/80">
        Entry {state.entry.toLocaleString()} · Pot {state.pot.toLocaleString()}
      </p>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {[0, 1, 2, 3].map((s) => {
          const p = state.seats[s];
          const free = !p && state.mySeat < 0 && !state.busy;
          return (
            <button
              key={s}
              type="button"
              disabled={!free}
              onClick={() => state.join(s)}
              className={`rounded-xl border-2 py-2 text-center ${
                s % 2 === 0 ? "border-sky-400/60" : "border-orange-400/60"
              } ${p ? "bg-white/10" : "bg-white/[0.03] hover:bg-white/10"}`}
            >
              <div className="text-[10px] text-white/50">Team {teamName(s)}</div>
              <div className="truncate px-1 text-xs font-bold">{p?.username || (state.mySeat < 0 ? "Sit" : "—")}</div>
            </button>
          );
        })}
      </div>
      {state.mySeat < 0 && (
        <button
          type="button"
          onClick={() => state.join()}
          disabled={state.busy}
          className="mt-2 w-full rounded-xl bg-gradient-to-r from-amber-300 to-amber-500 py-2.5 text-sm font-black text-neutral-900 disabled:opacity-50"
        >
          Sit down ({state.entry.toLocaleString()})
        </button>
      )}
    </div>
  );
}

function TnInfo({ state }: { state: TnState }) {
  const myTeam = state.mySeat >= 0 ? state.mySeat % 2 : -1;
  const chips: [string, boolean][] = [];
  if (state.bidder >= 0) {
    chips.push([`Bid ${state.bid} · ${state.seats[state.bidder]?.username || ""}`, false]);
    if (state.target > 0) chips.push([`Target ${state.target}`, true]);
  }
  const trump =
    state.singleSeat >= 0
      ? "No trump (Single)"
      : state.trumpRevealed && state.trumpSuit
        ? `Trump ${state.trumpSuit}`
        : state.myTrump
          ? `Trump ${state.myTrump} (only you)`
          : state.bidder >= 0 && state.phase !== "BIDDING" && state.phase !== "TRUMP"
            ? "Trump 🂠 hidden"
            : "";
  if (trump) chips.push([trump, false]);
  if (state.doubleLevel > 1) chips.push([state.doubleLevel === 4 ? "Redouble x4" : "Double x2", false]);
  chips.push([`A ${state.points[0]}${myTeam === 0 ? " (you)" : ""}`, false]);
  chips.push([`B ${state.points[1]}${myTeam === 1 ? " (you)" : ""}`, false]);
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {chips.map(([t, strong], i) => (
        <span
          key={i}
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            strong ? "bg-gradient-to-r from-blue-700 to-violet-600" : "border border-white/15 bg-white/5"
          }`}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

// The four seats, rotated so I sit at the bottom, with the current trick in the middle.
function TnFelt({ state }: { state: TnState }) {
  const base = state.mySeat >= 0 ? state.mySeat : 0;
  const posOf = (seat: number) => (seat - base + 4) % 4; // 0 bottom, 1 left, 2 top, 3 right
  const seatAt = (pos: number) => [0, 1, 2, 3].find((s) => posOf(s) === pos) ?? 0;
  const trickAt = (pos: number) => state.trick.find((t) => posOf(t.seat) === pos);

  const SeatBadge = ({ pos }: { pos: number }) => {
    const seat = seatAt(pos);
    const p = state.seats[seat];
    if (!p) return <div />;
    const isTurn =
      (state.phase === "TRUMP" && state.bidder === seat) || (state.phase !== "TRUMP" && state.turn === seat);
    const out = state.singleSeat >= 0 && seat === (state.singleSeat + 2) % 4;
    return (
      <div className={`flex flex-col items-center ${out ? "opacity-40" : ""}`}>
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-neutral-900 ${
            seat % 2 === 0 ? "bg-sky-300" : "bg-orange-300"
          } ${isTurn ? "ring-2 ring-amber-300 animate-pulse" : ""}`}
        >
          {(p.username.replace("🤖", "").trim()[0] || "?").toUpperCase()}
        </div>
        <div className="max-w-[80px] truncate text-[10px] font-bold">
          {(p.bot || p.auto) && "🤖"}
          {p.username.replace("🤖", "").trim()}
          {seat === state.bidder ? ` · ${state.bid}` : ""}
          {seat === state.dealer ? " · D" : ""}
          {seat === state.singleSeat ? " · 1H" : ""}
        </div>
      </div>
    );
  };

  const TrickSlot = ({ pos }: { pos: number }) => {
    const t = trickAt(pos);
    return <div className="flex justify-center">{t ? <MiniCard card={t.card} /> : null}</div>;
  };

  const showTrump = ["PLAYING", "DOUBLE", "SINGLE", "NEXTDEAL"].includes(state.phase);
  const shownSuit = state.trumpRevealed ? state.trumpSuit : null;
  const mine = !state.trumpRevealed ? state.myTrump : null;

  return (
    <div className="mt-2 rounded-3xl bg-gradient-to-r from-amber-200 via-amber-600 to-amber-200 p-[3px]">
      <div className="relative grid grid-cols-3 grid-rows-3 items-center gap-1 rounded-[22px] bg-[radial-gradient(circle,_#3F6CD0,_#2D56B0,_#142B63)] px-2 py-2">
        {/* trump card, top-left */}
        <div className="flex flex-col items-center">
          {showTrump && (
            <>
              <span className="text-[8px] font-black tracking-wider text-amber-300">TRUMP</span>
              {state.singleSeat >= 0 ? (
                <span className="text-sm font-bold">—</span>
              ) : shownSuit || mine ? (
                <span
                  className={`flex h-9 w-7 items-center justify-center rounded-md bg-white text-lg ${
                    (shownSuit || mine) === "♥" || (shownSuit || mine) === "♦" ? "text-red-600" : "text-black"
                  } ${mine ? "ring-2 ring-amber-300" : ""}`}
                >
                  {shownSuit || mine}
                </span>
              ) : (
                <CardBack />
              )}
            </>
          )}
        </div>
        <SeatBadge pos={2} />
        <div />
        <SeatBadge pos={1} />
        <div className="grid grid-cols-3 grid-rows-3 place-items-center">
          <div />
          <TrickSlot pos={2} />
          <div />
          <TrickSlot pos={1} />
          <span className="text-[9px] font-black tracking-[3px] text-amber-300/50">29</span>
          <TrickSlot pos={3} />
          <div />
          <TrickSlot pos={0} />
          <div />
        </div>
        <SeatBadge pos={3} />
        <div />
        <SeatBadge pos={0} />
        <div />
      </div>
    </div>
  );
}

function TnActions({ state }: { state: TnState }) {
  const mySeat = state.mySeat;
  const btn = "rounded-lg px-2.5 py-1.5 text-xs font-black transition active:scale-95 disabled:opacity-40";

  if (state.phase === "NEXTDEAL") {
    const made = state.lastDeal.winTeam === state.lastDeal.bidderTeam;
    return (
      <p className={`mt-2 text-center text-xs font-bold ${made ? "text-emerald-400" : "text-rose-400"}`}>
        Deal {state.dealNo}: team {state.lastDeal.bidderTeam === 0 ? "A" : "B"}{" "}
        {made ? `made the bid +${state.lastDeal.gp}` : `failed −${state.lastDeal.gp}`} · next deal in{" "}
        {state.secondsLeft}s
      </p>
    );
  }

  const myTurn =
    mySeat >= 0 &&
    ((state.phase === "TRUMP" && state.bidder === mySeat) || (state.phase !== "TRUMP" && state.turn === mySeat));

  if (!myTurn) {
    const who =
      (state.phase === "TRUMP" ? state.seats[state.bidder]?.username : state.seats[state.turn]?.username) || "";
    const text: Record<string, string> = {
      BIDDING: `${who} is bidding…`,
      TRUMP: `${who} is choosing trump 🤫`,
      DOUBLE: `${who}: double?`,
      SINGLE: `${who}: single hand?`,
    };
    return <p className="mt-2 text-center text-xs text-white/50">{text[state.phase] || `${who}'s turn`}</p>;
  }

  if (state.phase === "BIDDING") {
    const min = Math.max(16, state.bid + 1);
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="text-xs font-black">Bid:</span>
        <button type="button" disabled={state.busy} onClick={() => state.act("pass")} className={`${btn} bg-rose-500`}>
          PASS
        </button>
        {Array.from({ length: 28 - min + 1 }, (_, i) => min + i).map((b) => (
          <button
            key={b}
            type="button"
            disabled={state.busy}
            onClick={() => state.act("bid", { bid: b })}
            className={`${btn} bg-amber-400 text-neutral-900`}
          >
            {b}
          </button>
        ))}
      </div>
    );
  }

  if (state.phase === "TRUMP") {
    return (
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-xs font-black">Trump 🤫</span>
        {SUITS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={state.busy}
            onClick={() => state.act("trump", { suit: s })}
            className={`flex-1 rounded-lg border-2 border-amber-300 bg-white py-1 text-lg ${
              s === "♥" || s === "♦" ? "text-red-600" : "text-black"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    );
  }

  if (state.phase === "DOUBLE" || state.phase === "SINGLE") {
    const bidderTeam = state.bidder >= 0 && mySeat % 2 === state.bidder % 2;
    return (
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={state.busy}
          onClick={() => state.act(state.phase === "DOUBLE" ? "double" : "single")}
          className={`${btn} bg-amber-400 py-2 text-neutral-900`}
        >
          {state.phase === "SINGLE" ? "Single Hand" : bidderTeam ? "Redouble x4" : "Double x2"}
        </button>
        <button type="button" disabled={state.busy} onClick={() => state.act("pass")} className={`${btn} bg-rose-500 py-2`}>
          PASS
        </button>
      </div>
    );
  }

  // PLAYING
  const led = state.ledSuit;
  const cantFollow = !!led && !state.myCards.some((c) => c.endsWith(led));
  return (
    <div className="mt-2 space-y-1">
      {cantFollow && !state.trumpRevealed && state.singleSeat < 0 && (
        <button
          type="button"
          disabled={state.busy}
          onClick={() => state.act("reveal")}
          className={`${btn} w-full bg-amber-400 py-2 text-neutral-900`}
        >
          🔓 Ask for trump
        </button>
      )}
      <p className="text-center text-xs font-bold text-violet-300">
        {state.seats[mySeat]?.auto
          ? "🤖 Auto Play is playing for you"
          : state.mustTrumpSeat === mySeat
            ? "Your turn — play a trump"
            : "Your turn — tap a card"}
      </p>
    </div>
  );
}

function TnHand({ state }: { state: TnState }) {
  const mySeat = state.mySeat;
  const playing = state.phase === "PLAYING" && state.turn === mySeat;
  const legal = new Set(playing ? legalCards(state, mySeat) : []);
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-1">
      {sortHand(state.myCards).map((c) => {
        const ok = playing && legal.has(c) && !state.busy;
        return (
          <button
            key={c}
            type="button"
            disabled={!ok}
            onClick={() => state.act("play", { card: c })}
            className={`transition ${ok ? "-translate-y-1 hover:-translate-y-2" : ""} ${
              playing && !ok ? "opacity-45" : ""
            }`}
          >
            <MiniCard card={c} size="md" />
          </button>
        );
      })}
    </div>
  );
}
