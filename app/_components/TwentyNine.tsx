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
  /** 7️⃣ the bidder chose "7th card" trump (the suit of their 7th card). */
  seventhCard: boolean;
  trick: TrickCard[];
  /** The trick that just finished and who won it (shown until the next card). */
  lastTrick: TrickCard[];
  lastTrickWinner: number;
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
    seventhCard: false,
    trick: [] as TrickCard[],
    lastTrick: [] as TrickCard[],
    lastTrickWinner: -1,
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
        seventhCard: d.get("seventhCard") === true,
        trick: Array.isArray(rawTrick)
          ? rawTrick.map((t: any) => ({ seat: Number(t?.seat || 0), card: String(t?.card || "") }))
          : [],
        lastTrick: Array.isArray(d.get("lastTrick")?.cards)
          ? d.get("lastTrick").cards.map((t: any) => ({ seat: Number(t?.seat || 0), card: String(t?.card || "") }))
          : [],
        lastTrickWinner: Number(d.get("lastTrick")?.winner ?? -1),
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
          🃏 29 Card
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

// Lobby (no match running) — dark "VIP casino" look like the app: felt banner
// with a moving shine, glass cards, gold entry picker and a shimmering button.
const TN_GOLD_TEXT = "linear-gradient(to bottom, #FFF3C4, #F2C94C, #D29B16)";
const goldText = { background: TN_GOLD_TEXT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" } as const;

function TnIdle({ state, entry, setEntry }: { state: TnState; entry: number; setEntry: (n: number) => void }) {
  // 4 entries in the pot, 90% split between the 2 winners.
  const winEach = Math.floor((entry * 4 * 9) / 10 / 2);
  const sc = (v: number) => (v > 0 ? `+${v}` : `${v}`);
  const win = state.resultWinTeam;
  const teamColor = win === 0 ? "#7DB6FF" : "#FF9B7A";
  return (
    <div className="mt-1 rounded-[18px] border border-[#F2C94C]/45 bg-gradient-to-b from-[#2A1F6B] via-[#130F33] to-[#0C0A24] p-2">
      {/* Casino table banner: gold rim, felt, faint suit pattern, light sweep, fanned 29 cards */}
      <div
        className="rounded-[22px] p-[2.5px] shadow-[0_6px_18px_rgba(74,120,218,.55)]"
        style={{ background: "linear-gradient(135deg, #FFF3C4, #D29B16, #FFE49A, #D29B16)" }}
      >
        <div className="tn-shine relative h-[108px] overflow-hidden rounded-[20px] bg-[radial-gradient(circle,_#5585E8,_#2D56B0_60%,_#142B63)]">
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 overflow-hidden whitespace-nowrap text-[18px] leading-tight text-white/5">
            {[0, 1, 2, 3].map((r) => (
              <span key={r}>{(r % 2 === 0 ? "♠  ♥  ♣  ♦  " : "  ♦  ♣  ♥  ♠").repeat(4)}</span>
            ))}
          </div>
          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            <div className="flex items-center gap-1.5">
              <span className="rounded border border-[#F2C94C]/60 bg-[#F2C94C]/20 px-1 py-px text-[8px] font-extrabold tracking-[1px] text-[#F2C94C]">♛ VIP</span>
              <span className="text-[11px] font-extrabold tracking-[4px] text-[#F2C94C]">miglife</span>
            </div>
            <p
              className="text-[25px] font-black leading-tight tracking-[1px]"
              style={{ background: "linear-gradient(#FFFFFF, #FFE49A)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
            >
              29 CARD
            </p>
            <div className="flex items-center text-[10px] font-bold text-white/80">
              <span className="h-2 w-2 rounded-full bg-[#7DB6FF]" />
              &nbsp;Team A&nbsp;<span className="text-[9px] font-black text-[#F2C94C]">VS</span>&nbsp;Team B&nbsp;
              <span className="h-2 w-2 rounded-full bg-[#FF9B7A]" />
            </div>
          </div>
          {/* J > 9 > A > 10 — the four point cards, fanned out */}
          <div className="absolute right-[18px] top-1/2 h-20 w-28 -translate-y-1/2">
            {["10♦", "A♣", "9♥", "J♠"].map((c, i) => (
              <span
                key={c}
                className="absolute left-1/2 top-1/2 drop-shadow-md"
                style={{
                  transform: `translate(-50%, -50%) translate(${i * 19 - 28}px, ${i === 1 || i === 2 ? -4 : 3}px) rotate(${-21 + i * 14}deg)`,
                }}
              >
                <MiniCard card={c} size="md" />
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Last match result */}
      {win >= 0 && (
        <div
          className="mt-3 flex items-center rounded-2xl px-3 py-2.5"
          style={{
            border: "1px solid transparent",
            background: `linear-gradient(to right, ${teamColor}38, rgba(255,255,255,.07)) padding-box, linear-gradient(to right, ${teamColor}, rgba(242,201,76,.4)) border-box`,
          }}
        >
          <span className="relative">
            <span
              className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-2 border-[#F2C94C] text-lg font-black text-[#22204A]"
              style={{ background: `radial-gradient(circle, #FFFFFF, ${teamColor})` }}
            >
              {win === 0 ? "A" : "B"}
            </span>
            <span className="absolute -top-[11px] left-1/2 -translate-x-1/2 text-[13px]">👑</span>
          </span>
          <span className="ml-3 min-w-0 flex-1">
            <span className="block text-[9px] font-extrabold tracking-[1.2px]" style={goldText}>
              LAST MATCH · WINNER
            </span>
            <span className="block text-base font-extrabold text-white">Team {win === 0 ? "A" : "B"} 🏆</span>
            <span className="block text-[11px] font-bold text-white/60">
              A {sc(state.match[0])} · B {sc(state.match[1])}
            </span>
          </span>
          {state.resultShare > 0 && (
            <span className="flex flex-col items-center rounded-xl bg-gradient-to-b from-[#4BE39A] to-[#1E9B5A] px-2.5 py-1 shadow-[0_0_10px_#3DD68C]">
              <span className="text-sm font-extrabold text-white">+{state.resultShare.toLocaleString()} 🪙</span>
              <span className="text-[9px] font-bold text-white/85">each</span>
            </span>
          )}
        </div>
      )}

      {/* Entry picker — 2 rows of 3 */}
      <div className="mt-3 flex items-center">
        <span className="text-[10px] font-extrabold tracking-[1.5px]" style={goldText}>
          ✦ CHOOSE ENTRY
        </span>
        <span className="flex-1" />
        <span className="rounded-full border border-[#3DD68C]/50 bg-[#3DD68C]/15 px-2 py-0.5 text-[10px] font-extrabold text-[#6BF0AE]">
          Win {winEach.toLocaleString()} 🪙 each
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-[7px]">
        {ENTRY_OPTIONS.map((a) => {
          const sel = entry === a;
          return (
            <button
              key={a}
              type="button"
              onClick={() => setEntry(a)}
              className="relative flex items-center justify-center gap-1 rounded-[14px] py-2.5"
              style={{
                background: sel ? "linear-gradient(#FFE9A8, #F2C94C, #D29B16)" : "linear-gradient(rgba(255,255,255,.10), rgba(255,255,255,.04))",
                border: sel ? "1.5px solid #FFF3C4" : "1px solid rgba(255,255,255,.14)",
                boxShadow: sel ? "0 0 12px rgba(242,201,76,.7)" : undefined,
              }}
            >
              <span className="text-xs">🪙</span>
              <span className={`text-[15px] font-extrabold ${sel ? "text-[#22204A]" : "text-white/90"}`}>{a >= 1000 ? `${a / 1000}K` : a}</span>
              {sel && <span className="absolute right-[7px] top-0.5 text-[9px] font-extrabold text-[#22204A]">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Big gold "open table" button: pulsing glow + a light sweep */}
      <button
        type="button"
        onClick={() => state.start(entry)}
        disabled={state.busy}
        className={`relative mt-3.5 flex w-full items-center overflow-hidden rounded-[18px] py-[9px] pl-3 pr-2 text-left ${state.busy ? "" : "tn-open tn-shine"}`}
        style={{
          background: state.busy ? "linear-gradient(#6E6A8E, #4E4A6E)" : "linear-gradient(#FFE9A8, #F2C94C, #D29B16)",
          border: state.busy ? "1.5px solid transparent" : "1.5px solid #FFF3C4",
        }}
      >
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#22204A]/10 text-lg">🃏</span>
        <span className="ml-2.5 min-w-0 flex-1">
          <span className={`block text-base font-black ${state.busy ? "text-white" : "text-[#22204A]"}`}>Open a 29 Card table</span>
          <span className={`block text-[9px] font-bold ${state.busy ? "text-white/60" : "text-[#22204A]/60"}`}>Tap to deal · bots fill empty seats</span>
        </span>
        <span className="rounded-xl border border-[#F2C94C]/50 bg-gradient-to-b from-[#2E2A63] to-[#22204A] px-[11px] py-[7px] text-sm font-extrabold">
          <span style={goldText}>{entry.toLocaleString()}</span> 🪙
        </span>
      </button>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {[
          ["👥", "4 players"],
          ["🤖", "Bots fill seats"],
          ["🏆", "First to +6"],
        ].map(([icon, label]) => (
          <span key={label} className="flex items-center justify-center gap-[3px] truncate rounded-[10px] border border-white/15 bg-white/[0.07] py-1.5">
            <span className="text-[11px]">{icon}</span>
            <span className="truncate text-[10px] font-bold text-white/75">{label}</span>
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-center text-[9px] text-white/40">Winning team shares 90% of the pot</p>
    </div>
  );
}

// Seat picking — same dark VIP look as the lobby (like the app): Entry · Pot
// strip, the 4 seats around a mini felt table (me at the bottom, the next seat
// in turn order on my right, partner across), a gold "Sit down" button.
function TnJoining({ state }: { state: TnState }) {
  const mySeat = state.mySeat;
  const base = mySeat >= 0 ? mySeat : 0;
  const seated = state.seats.filter(Boolean).length;
  const urgent = state.secondsLeft >= 1 && state.secondsLeft <= 5;
  const posClass = ["bottom-2 left-1/2 -translate-x-1/2", "left-2 top-1/2 -translate-y-1/2", "top-2 left-1/2 -translate-x-1/2", "right-2 top-1/2 -translate-y-1/2"];
  return (
    <div className="mt-1 rounded-[18px] border border-[#F2C94C]/45 bg-gradient-to-b from-[#2A1F6B] via-[#130F33] to-[#0C0A24] p-2">
      {/* Entry · Pot strip */}
      <div className="grid grid-cols-2 gap-1.5">
        {(
          [
            ["ENTRY", state.entry],
            ["POT", state.pot],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="flex items-center rounded-xl border border-white/15 bg-white/[0.07] px-2.5 py-1.5">
            <span className="text-[9px] font-extrabold tracking-[1.2px] text-white/55">{label}</span>
            <span className="flex-1" />
            <span className="text-sm font-black">
              <span style={goldText}>{v.toLocaleString()}</span> 🪙
            </span>
          </div>
        ))}
      </div>

      {/* The 4 seats around a mini felt table */}
      <div
        className="mt-2 rounded-[26px] p-[2.5px] shadow-[0_6px_18px_rgba(74,120,218,.55)]"
        style={{ background: "linear-gradient(135deg, #FFF3C4, #D29B16, #FFE49A, #D29B16)" }}
      >
        <div className="tn-shine relative h-[226px] overflow-hidden rounded-[24px] bg-[radial-gradient(circle,_#5585E8,_#2D56B0_60%,_#142B63)]">
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
            <span className="text-[10px] font-extrabold tracking-[4px] text-[#F2C94C]/70">miglife</span>
            <span
              className="text-lg font-black tracking-[1px]"
              style={{ background: "linear-gradient(#FFFFFF, #FFE49A)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
            >
              29 CARD
            </span>
            <span
              className={`mt-0.5 rounded-full px-[9px] py-0.5 text-[11px] font-extrabold text-white ${
                urgent ? "bg-[#E5586A]" : "border border-[#F2C94C]/50 bg-black/30"
              }`}
            >
              ⏳ {state.secondsLeft}s
            </span>
          </div>
          {[0, 1, 2, 3].map((seat) => {
            const p = state.seats[seat];
            const teamColor = seat % 2 === 0 ? "#7DB6FF" : "#FF9B7A";
            const isMe = mySeat === seat;
            const canSit = !p && mySeat < 0 && !state.busy;
            const name = p?.username.replace("🤖", "").trim() || "";
            return (
              <button
                key={seat}
                type="button"
                disabled={!canSit}
                onClick={() => state.join(seat)}
                className={`absolute flex w-[72px] flex-col items-center ${posClass[(base - seat + 4) % 4]}`}
              >
                <span className="relative">
                  {p ? (
                    <span
                      className="flex h-[42px] w-[42px] items-center justify-center rounded-full text-base font-black text-[#22204A]"
                      style={{
                        background: `radial-gradient(circle, #FFFFFF, ${teamColor})`,
                        border: `2px solid ${isMe ? "#F2C94C" : "rgba(255,255,255,.8)"}`,
                        boxShadow: isMe ? "0 0 12px #F2C94C" : "0 2px 5px rgba(0,0,0,.35)",
                      }}
                    >
                      {(name[0] || "?").toUpperCase()}
                    </span>
                  ) : (
                    // empty seat: dashed ring, glowing "+" when I can take it
                    <span
                      className={`flex h-[42px] w-[42px] items-center justify-center rounded-full bg-black/25 text-xl font-black ${canSit ? "tn-seat-pulse text-white" : "text-white/50"}`}
                      style={{ border: `2px dashed ${teamColor}`, opacity: canSit ? undefined : 0.75, ["--tc" as string]: teamColor }}
                    >
                      {canSit ? "+" : "·"}
                    </span>
                  )}
                  {p?.bot && <span className="absolute -bottom-0.5 -right-1 text-[11px]">🤖</span>}
                </span>
                <span
                  className={`mt-[3px] max-w-[66px] truncate rounded-full px-[7px] py-px text-[9px] font-extrabold ${isMe ? "text-[#22204A]" : "text-white"}`}
                  style={{
                    background: isMe ? "linear-gradient(#FFE9A8, #F2C94C)" : p ? "rgba(0,0,0,.45)" : `${teamColor}40`,
                  }}
                >
                  {p ? name : canSit ? `SIT · ${seat % 2 === 0 ? "A" : "B"}` : `Team ${seat % 2 === 0 ? "A" : "B"}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2.5">
        {mySeat < 0 ? (
          <button
            type="button"
            onClick={() => state.join()}
            disabled={state.busy}
            className={`relative flex w-full items-center overflow-hidden rounded-[18px] py-[9px] pl-3 pr-2 text-left ${state.busy ? "" : "tn-open tn-shine"}`}
            style={{
              background: state.busy ? "linear-gradient(#6E6A8E, #4E4A6E)" : "linear-gradient(#FFE9A8, #F2C94C, #D29B16)",
              border: state.busy ? "1.5px solid transparent" : "1.5px solid #FFF3C4",
            }}
          >
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#22204A]/10 text-lg">🃏</span>
            <span className="ml-2.5 min-w-0 flex-1">
              <span className={`block text-base font-black ${state.busy ? "text-white" : "text-[#22204A]"}`}>Sit down</span>
              <span className={`block text-[9px] font-bold ${state.busy ? "text-white/60" : "text-[#22204A]/60"}`}>
                Or tap an empty seat · empty seats get bots
              </span>
            </span>
            <span className="rounded-xl border border-[#F2C94C]/50 bg-gradient-to-b from-[#2E2A63] to-[#22204A] px-[11px] py-[7px] text-sm font-extrabold">
              <span style={goldText}>{state.entry.toLocaleString()}</span> 🪙
            </span>
          </button>
        ) : (
          <div className="flex items-center rounded-[14px] border border-[#3DD68C]/50 bg-[#3DD68C]/15 px-3 py-[9px]">
            <span className="text-base font-black text-[#6BF0AE]">✓</span>
            <span className="ml-2 flex-1 text-[13px] font-extrabold text-white">You&apos;re in · Team {mySeat % 2 === 0 ? "A" : "B"}</span>
            <span className="text-[11px] font-bold text-[#6BF0AE]">{seated}/4 seated</span>
          </div>
        )}
      </div>
      <p className="mt-1.5 text-center text-[9px] text-white/40">
        Teams sit across: A = seats 1+3 · B = seats 2+4 · bots fill empty seats when the timer ends
      </p>
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
        : state.myTrump && state.seventhCard
          ? `7th card: ${state.myTrump} (only you)`
          : state.myTrump
            ? `Trump ${state.myTrump} (only you)`
            : state.seventhCard
              ? "Trump 7th card 🂠"
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
  // 29 is played ANTICLOCKWISE: the next seat in turn order (seat + 1) sits
  // on my right, then across, then on my left (same as the app).
  const posOf = (seat: number) => (base - seat + 4) % 4; // 0 bottom, 1 left, 2 top, 3 right
  const seatAt = (pos: number) => [0, 1, 2, 3].find((s) => posOf(s) === pos) ?? 0;
  // A finished trick's 4 cards stay on the table (winner's card outlined in
  // gold) until the next card is played.
  const showingLast =
    state.trick.length === 0 && state.lastTrick.length > 0 && (state.phase === "PLAYING" || state.phase === "NEXTDEAL");
  const onTable = showingLast ? state.lastTrick : state.trick;
  const trickAt = (pos: number) => onTable.find((t) => posOf(t.seat) === pos);

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
        <div className="max-w-[80px] truncate text-[9px] font-bold">
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
    // Fixed height, so the table doesn't jump as cards are played.
    const winner = showingLast && t && t.seat === state.lastTrickWinner;
    return (
      <div className="flex h-12 justify-center">
        {t ? (
          <span className={winner ? "rounded-md ring-2 ring-[#E8B84A]" : ""}>
            <MiniCard card={t.card} size="md" />
          </span>
        ) : null}
      </div>
    );
  };

  const showTrump = ["PLAYING", "DOUBLE", "SINGLE", "NEXTDEAL"].includes(state.phase);
  const shownSuit = state.trumpRevealed ? state.trumpSuit : null;
  const mine = !state.trumpRevealed ? state.myTrump : null;

  return (
    <div className="mt-2 rounded-3xl bg-gradient-to-r from-amber-200 via-amber-600 to-amber-200 p-[3px]">
      <div className="relative grid min-h-[206px] grid-cols-3 grid-rows-[auto_auto_auto] items-center gap-1 rounded-[22px] bg-[radial-gradient(circle,_#3F6CD0,_#2D56B0,_#142B63)] px-2 py-2">
        {/* trump card, top-left */}
        <div className="flex flex-col items-center">
          {showTrump && (
            <>
              <span className="text-[8px] font-black tracking-wider text-amber-300">
                {state.seventhCard ? "7TH CARD" : "TRUMP"}
              </span>
              {state.singleSeat >= 0 ? (
                <span className="text-sm font-bold">—</span>
              ) : shownSuit || mine ? (
                <span
                  className={`flex h-12 w-[34px] items-center justify-center rounded-md bg-white text-[28px] leading-none ${
                    (shownSuit || mine) === "♥" || (shownSuit || mine) === "♦" ? "text-red-600" : "text-black"
                  } ${mine ? "ring-2 ring-amber-300" : ""}`}
                >
                  {shownSuit || mine}
                </span>
              ) : (
                <span className="inline-flex h-12 w-[34px] [&>span]:h-full [&>span]:w-full">
                  <CardBack />
                </span>
              )}
            </>
          )}
        </div>
        <SeatBadge pos={2} />
        <div />
        <SeatBadge pos={1} />
        <div className="grid grid-cols-3 grid-rows-[auto_auto_auto] place-items-center gap-0.5">
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
      <div className="mt-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-black">Trump 🤫</span>
          {SUITS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={state.busy}
              onClick={() => state.act("trump", { suit: s })}
              className={`flex-1 rounded-[10px] border-2 border-amber-300 bg-white py-1 text-[20px] leading-tight ${
                s === "♥" || s === "♦" ? "text-red-600" : "text-black"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {/* 7️⃣ "7th card" trump: the suit of your 7th card (dealt next) is trump */}
        <button
          type="button"
          disabled={state.busy}
          onClick={() => state.act("trump", { suit: "7TH" })}
          className="mt-1.5 w-full rounded-[10px] border-2 border-amber-300 bg-gradient-to-r from-violet-700 to-emerald-800 py-[7px] text-[13px] font-extrabold text-white disabled:opacity-50"
        >
          7️⃣&nbsp; 7th Card Trump
        </button>
        <p className="mt-[3px] text-center text-[10px] text-white/60">
          The suit of your 7th card (dealt next) becomes trump — hidden from everyone else.
        </p>
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
    <div className="mt-3 flex flex-wrap justify-center pl-1.5">
      {sortHand(state.myCards).map((c) => {
        const ok = playing && legal.has(c) && !state.busy;
        return (
          <button
            key={c}
            type="button"
            disabled={!ok}
            onClick={() => state.act("play", { card: c })}
            className={`-ml-1.5 transition ${ok ? "-translate-y-1.5 hover:-translate-y-2.5" : ""} ${
              playing && !ok ? "opacity-45" : ""
            }`}
          >
            <MiniCard card={c} size="lg" />
          </button>
        );
      })}
    </div>
  );
}
