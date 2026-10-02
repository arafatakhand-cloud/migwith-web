"use client";

import { useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { isOnlineNow } from "../../lib/heartbeat";

// 🃏 29 (Twenty-Nine) — server-driven (tnStart / tnJoin / tnAction / tnTick).
// 4 seats, teams A (seats 1+3) vs B (seats 2+4); empty seats get bots. Your own
// cards come from room_game/{room}/tn_hands/{uid}, which only you can read.
// Same flow as TwentyNineGame.kt.

export const TN_ROOM = "🃏 29 Official";
// 🆓 Same game, no coins (no entry, no payout) — the server checks this too.
export const TN_FREE_ROOM = "🃏 29 Card Free";

const ENTRY_OPTIONS = [100, 200, 500, 1000, 2000, 5000];
const RANKS = ["7", "8", "Q", "K", "10", "A", "9", "J"];
const SUITS = ["♠", "♥", "♣", "♦"];
const TEAM_A = "#7DB6FF";
const TEAM_B = "#FF9B7A";

const startCall = httpsCallable(functions, "tnStart");
const joinCall = httpsCallable(functions, "tnJoin");
const actionCall = httpsCallable(functions, "tnAction");
const tickCall = httpsCallable(functions, "tnTick");
const inviteCall = httpsCallable(functions, "tnInvite");

type Seat = { uid: string; username: string; bot: boolean; auto: boolean } | null;
type TrickCard = { seat: number; card: string };
/** 🎟 An empty seat kept for an invited player (tnInvite). */
type TnInvite = { uid: string; username: string; by: string; byUid: string };

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
  /** Each seat's own last bid this deal + who has passed (bidding duel badges). */
  seatBids: number[];
  passed: boolean[];
  /** 🎟 seat → invite, while seats are open. */
  invites: Record<number, TnInvite>;
  myUid: string;
  myCards: string[];
  myTrump: string | null;
  secondsLeft: number;
  busy: boolean;
  mySeat: number;
  /** 🆓 The free room: no entry, no payout. */
  free: boolean;
  start: (entry: number) => void;
  join: (seat?: number) => void;
  act: (type: string, extra?: Record<string, unknown>) => void;
  /** 🎟 Keep an empty seat for a friend (seat -1 = the server picks, partner seat first). */
  invite: (username: string, seat?: number) => void;
  cancelInvite: (seat: number) => void;
};

function opId(): string {
  return "tn_" + crypto.randomUUID().replace(/-/g, "");
}

function pair(v: unknown): [number, number] {
  return Array.isArray(v) && v.length === 2 ? [Number(v[0]) || 0, Number(v[1]) || 0] : [0, 0];
}

// roomId = the 29 room (official or 🆓 free) or null in every other room.
export function useTwentyNine(roomId: string | null, uid: string | undefined, note: (t: string) => void): TnState | null {
  const enabled = !!roomId;
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
    seatBids: [0, 0, 0, 0],
    passed: [false, false, false, false],
    invites: {} as Record<number, TnInvite>,
  });
  const [hand, setHand] = useState({ round: 0, cards: [] as string[], trump: null as string | null });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const lastTick = useRef(0);
  const noteRef = useRef(note);
  noteRef.current = note;

  // The table.
  useEffect(() => {
    if (!roomId || !uid) return;
    return onSnapshot(doc(db, "room_game", roomId), (d) => {
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
        seatBids: [0, 1, 2, 3].map((i) => Number((d.get("seatBids") || [])[i]) || 0),
        passed: [0, 1, 2, 3].map((i) => (d.get("passed") || [])[i] === true),
        invites: Object.fromEntries(
          Object.entries((d.get("invites") || {}) as Record<string, any>)
            .filter(([k, v]) => Number.isInteger(Number(k)) && v && typeof v === "object")
            .map(([k, v]) => [
              Number(k),
              { uid: String(v.uid || ""), username: String(v.username || ""), by: String(v.by || ""), byUid: String(v.byUid || "") },
            ])
        ),
      });
    });
  }, [roomId, uid]);

  // My own cards (only I can read them).
  useEffect(() => {
    if (!roomId || !uid) return;
    return onSnapshot(doc(db, "room_game", roomId, "tn_hands", uid), (d) => {
      setHand({
        round: Number(d.get("round") || 0),
        cards: Array.isArray(d.get("cards")) ? d.get("cards").map(String) : [],
        trump: d.get("trump") ? String(d.get("trump")) : null,
      });
    });
  }, [roomId, uid]);

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
        tickCall({ roomId }).catch(() => {});
      }
    }, 250);
    return () => clearInterval(t);
  }, [enabled, roomId, g.running, g.phaseEndsAt]);

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
    myUid: uid || "",
    free: roomId === TN_FREE_ROOM,
    start: (entry: number) => {
      if (!busy) run(startCall({ entry, operationId: opId(), roomId }));
    },
    join: (seat = -1) => {
      if (!busy) run(joinCall({ seat, operationId: opId(), roomId }));
    },
    act: (type: string, extra: Record<string, unknown> = {}) => {
      if (!busy) run(actionCall({ type, round: g.round, roomId, ...extra }));
    },
    invite: (username: string, seat = -1) => {
      const name = username.trim().replace(/^@/, "");
      if (name && !busy) run(inviteCall({ username: name, seat, roomId }));
    },
    cancelInvite: (seat: number) => {
      if (!busy) run(inviteCall({ cancel: true, seat, roomId }));
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
    state.start(state.free ? 0 : Number.isInteger(amt) && amt > 0 ? amt : defaultEntry);
    return true;
  }
  if (cmd === "!j" || cmd === "!join") {
    state.join();
    return true;
  }
  if (cmd === "!invite" || cmd === "!inv") {
    if (!parts[1]) note("29 Bot: Invite a friend to an empty seat: !invite name");
    else state.invite(parts[1]);
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
      "29 Bot: !start [entry] opens a table · !j sits down · !invite name keeps a seat for a friend · empty seats get bots · Bid 16–28 · J>9>A>10>K>Q>8>7 · J3 9:2 A1 10:1 · follow suit · can't follow → ask for trump · Pair K+Q of trump ±4 · Double/Redouble · Single Hand = win all 8 alone"
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

export function TwentyNineTable({ state, roomUsers = [] }: { state: TnState; roomUsers?: string[] }) {
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
    <div className="border-t border-[#F2C94C]/30 bg-gradient-to-b from-[#2A1F6B] via-[#130F33] to-[#0C0A24] px-2 py-2">
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
          <span className="rounded-full border border-[#F2C94C]/50 bg-black/30 px-2 py-[3px] text-[11px] font-extrabold">
            <span style={goldText}>
              A {state.match[0] > 0 ? `+${state.match[0]}` : state.match[0]} · B {state.match[1] > 0 ? `+${state.match[1]}` : state.match[1]} /6
            </span>
          </span>
        )}
        {state.running && mySeat >= 0 && state.phase !== "JOINING" && (
          <button
            type="button"
            onClick={() => state.act("auto", { on: !state.seats[mySeat]?.auto })}
            disabled={state.busy}
            className={`rounded-full px-2 py-0.5 text-xs font-black ${
              state.seats[mySeat]?.auto ? "bg-gradient-to-r from-[#34C77B] to-[#1E9B5A]" : "border border-white/15 bg-white/[0.07]"
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
          <TnJoining state={state} roomUsers={roomUsers} />
        ) : (
          <div className="mt-1 space-y-1.5">
            <TnInfo state={state} />
            <TnFelt state={state} />
            <TnActions state={state} />
            {mySeat >= 0 && <TnHand state={state} />}
          </div>
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
              <span className="rounded border border-[#F2C94C]/60 bg-[#F2C94C]/20 px-1 py-px text-[8px] font-extrabold tracking-[1px] text-[#F2C94C]">{state.free ? "🆓 FREE" : "♛ VIP"}</span>
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
                <TnCard card={c} w={40} />
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

      {state.free ? (
        <>
          {/* 🆓 free room: no entry to pick, nothing to win or lose */}
          <div className="mt-3 flex items-center rounded-[14px] border border-[#3DD68C]/50 bg-[#3DD68C]/15 px-3 py-2.5">
            <span className="text-xl">🆓</span>
            <span className="ml-2.5">
              <span className="block text-[13px] font-black tracking-[1px] text-[#6BF0AE]">FREE TABLE</span>
              <span className="block text-[10px] font-bold text-white/70">No coins needed · practise and play for fun</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => state.start(0)}
            disabled={state.busy}
            className={`relative mt-3.5 flex w-full items-center overflow-hidden rounded-[18px] py-[9px] pl-3 pr-2 text-left ${state.busy ? "" : "tn-open tn-shine"}`}
            style={{
              background: state.busy ? "linear-gradient(#6E6A8E, #4E4A6E)" : "linear-gradient(#FFE9A8, #F2C94C, #D29B16)",
              border: state.busy ? "1.5px solid transparent" : "1.5px solid #FFF3C4",
            }}
          >
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#22204A]/10 text-lg">🃏</span>
            <span className="ml-2.5 min-w-0 flex-1">
              <span className={`block text-base font-black ${state.busy ? "text-white" : "text-[#22204A]"}`}>Open a free table</span>
              <span className={`block text-[9px] font-bold ${state.busy ? "text-white/60" : "text-[#22204A]/60"}`}>Tap to deal · bots fill empty seats</span>
            </span>
            <span className="rounded-xl border border-[#F2C94C]/50 bg-gradient-to-b from-[#2E2A63] to-[#22204A] px-[11px] py-[7px] text-sm font-extrabold">
              <span style={goldText}>FREE</span>
            </span>
          </button>
        </>
      ) : (
        <>
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

        </>
      )}

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
      <p className="mt-1.5 text-center text-[9px] text-white/40">
        {state.free ? "Just for fun — no coins in, no coins out" : "Winning team shares 90% of the pot"}
      </p>
    </div>
  );
}

// Seat picking — same dark VIP look as the lobby (like the app): Entry · Pot
// strip, the 4 seats around a mini felt table (me at the bottom, the next seat
// in turn order on my right, partner across), a gold "Sit down" button.
function TnJoining({ state, roomUsers }: { state: TnState; roomUsers: string[] }) {
  // 🎟 invite dialog: null = closed, -1 = any seat
  const [inviteSeat, setInviteSeat] = useState<number | null>(null);
  const myInvite = Object.entries(state.invites).find(([, v]) => v.uid === state.myUid);
  const mySeat = state.mySeat;
  const base = mySeat >= 0 ? mySeat : 0;
  const seated = state.seats.filter(Boolean).length;
  const urgent = state.secondsLeft >= 1 && state.secondsLeft <= 5;
  const posClass = ["bottom-2 left-1/2 -translate-x-1/2", "left-2 top-1/2 -translate-y-1/2", "top-2 left-1/2 -translate-x-1/2", "right-2 top-1/2 -translate-y-1/2"];
  return (
    <div className="mt-1 rounded-[18px] border border-[#F2C94C]/45 bg-gradient-to-b from-[#2A1F6B] via-[#130F33] to-[#0C0A24] p-2">
      {/* Entry · Pot strip (free room: just a FREE tag) */}
      {state.free ? (
        <div className="flex items-center justify-center rounded-xl border border-[#3DD68C]/50 bg-[#3DD68C]/15 py-1.5 text-xs font-black tracking-[1px] text-[#6BF0AE]">
          🆓 FREE GAME · no coins
        </div>
      ) : (
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
      )}

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
            const invite = p ? null : state.invites[seat] || null;
            const invitedMe = !!invite && invite.uid === state.myUid;
            const mineInvite = !!invite && invite.byUid === state.myUid;
            const canSit = !p && mySeat < 0 && !state.busy && (!invite || invitedMe);
            const canInvite = !p && !invite && mySeat >= 0 && !state.busy;
            const name = p?.username.replace("🤖", "").trim() || "";
            const team = seat % 2 === 0 ? "A" : "B";
            return (
              <button
                key={seat}
                type="button"
                disabled={!(canSit || canInvite || mineInvite)}
                onClick={() => (canSit ? state.join(seat) : canInvite ? setInviteSeat(seat) : mineInvite ? state.cancelInvite(seat) : undefined)}
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
                  ) : invite ? (
                    // 🎟 kept for an invited player: their letter, gold dashed ring
                    <span
                      className={`flex h-[42px] w-[42px] items-center justify-center rounded-full text-base font-black text-white ${invitedMe ? "tn-seat-pulse" : ""}`}
                      style={{
                        background: `radial-gradient(circle, rgba(255,255,255,.35), ${teamColor}59)`,
                        border: "2.5px dashed #F2C94C",
                        ["--tc" as string]: "#F2C94C",
                      }}
                    >
                      {(invite.username[0] || "?").toUpperCase()}
                    </span>
                  ) : (
                    // empty seat: dashed ring, glowing "+" when I can sit or invite
                    <span
                      className={`flex h-[42px] w-[42px] items-center justify-center rounded-full bg-black/25 font-black ${canInvite ? "text-base" : "text-xl"} ${
                        canSit || canInvite ? "tn-seat-pulse text-white" : "text-white/50"
                      }`}
                      style={{ border: `2px dashed ${teamColor}`, opacity: canSit || canInvite ? undefined : 0.75, ["--tc" as string]: teamColor }}
                    >
                      {canSit ? "+" : canInvite ? "🎟" : "·"}
                    </span>
                  )}
                  {p?.bot && <span className="absolute -bottom-0.5 -right-1 text-[11px]">🤖</span>}
                  {invite && <span className="absolute -bottom-0.5 -right-1 text-[11px]">🎟</span>}
                </span>
                <span
                  className={`mt-[3px] max-w-[70px] truncate rounded-full px-[7px] py-px text-[9px] font-extrabold ${isMe || invitedMe ? "text-[#22204A]" : "text-white"}`}
                  style={{
                    background:
                      isMe || invitedMe
                        ? "linear-gradient(#FFE9A8, #F2C94C)"
                        : p
                          ? "rgba(0,0,0,.45)"
                          : invite
                            ? "rgba(242,201,76,.25)"
                            : `${teamColor}40`,
                  }}
                >
                  {p
                    ? name
                    : invitedMe
                      ? "YOUR SEAT"
                      : mineInvite
                        ? `✕ ${invite!.username}`
                        : invite
                          ? `🎟 ${invite.username}`
                          : canSit
                            ? `SIT · ${team}`
                            : canInvite
                              ? `INVITE · ${team}`
                              : `Team ${team}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2.5">
        {/* 🎟 I've been invited → big Accept banner */}
        {mySeat < 0 && myInvite && (
          <button
            type="button"
            onClick={() => state.join(Number(myInvite[0]))}
            disabled={state.busy}
            className="tn-open tn-shine relative mb-2 flex w-full items-center overflow-hidden rounded-[18px] border-[1.5px] border-[#FFF3C4] bg-gradient-to-b from-[#FFE9A8] via-[#F2C94C] to-[#D29B16] py-[9px] pl-3 pr-2 text-left disabled:opacity-60"
          >
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#22204A]/10 text-lg">🎟</span>
            <span className="ml-2.5 min-w-0 flex-1">
              <span className="block text-base font-black text-[#22204A]">Accept invite</span>
              <span className="block truncate text-[9px] font-bold text-[#22204A]/60">
                🎟 {myInvite[1].by} kept seat {Number(myInvite[0]) + 1} (Team {Number(myInvite[0]) % 2 === 0 ? "A" : "B"}) for you
              </span>
            </span>
            <span className="rounded-xl border border-[#F2C94C]/50 bg-gradient-to-b from-[#2E2A63] to-[#22204A] px-[11px] py-[7px] text-sm font-extrabold">
              {state.free ? <span style={goldText}>FREE</span> : <><span style={goldText}>{state.entry.toLocaleString()}</span> 🪙</>}
            </span>
          </button>
        )}
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
              {state.free ? <span style={goldText}>FREE</span> : <><span style={goldText}>{state.entry.toLocaleString()}</span> 🪙</>}
            </span>
          </button>
        ) : (
          <div className="flex items-center rounded-[14px] border border-[#3DD68C]/50 bg-[#3DD68C]/15 px-3 py-[9px]">
            <span className="text-base font-black text-[#6BF0AE]">✓</span>
            <span className="ml-2 flex-1 text-[13px] font-extrabold text-white">You&apos;re in · Team {mySeat % 2 === 0 ? "A" : "B"}</span>
            <span className="text-[11px] font-bold text-[#6BF0AE]">{seated}/4 seated</span>
          </div>
        )}
        {mySeat >= 0 && [0, 1, 2, 3].some((i) => !state.seats[i] && !state.invites[i]) && (
          <button
            type="button"
            disabled={state.busy}
            onClick={() => setInviteSeat(-1)}
            className="mt-1.5 flex w-full items-center rounded-[14px] border border-[#F2C94C]/60 bg-gradient-to-r from-[#6A4BD8] to-[#2D56B0] px-3 py-[9px] text-left disabled:opacity-60"
          >
            <span className="text-base">🎟</span>
            <span className="ml-2 flex-1 text-[13px] font-extrabold text-white">Invite a friend to sit</span>
            <span className="text-[10px] text-white/60">or tap an empty seat</span>
          </button>
        )}
      </div>
      <p className="mt-1.5 text-center text-[9px] text-white/40">
        Teams sit across: A = seats 1+3 · B = seats 2+4 · bots fill empty seats when the timer ends
      </p>
      {inviteSeat !== null && <TnInviteDialog state={state} seat={inviteSeat} roomUsers={roomUsers} onClose={() => setInviteSeat(null)} />}
    </div>
  );
}

// My friends who are online right now (heartbeat in the last 90 s — same
// rule as the Friends page). Loaded once when the invite dialog opens.
async function loadOnlineFriends(uid: string): Promise<string[]> {
  const me = String((await getDoc(doc(db, "users", uid))).get("username") || "");
  if (!me) return [];
  const accepted = (field: string, other: string) =>
    getDocs(query(collection(db, "friend_requests"), where(field, "==", me), where("status", "==", "accepted"))).then((q) =>
      q.docs.map((d) => String(d.get(other) || "").trim())
    );
  const [fromMe, toMe] = await Promise.all([accepted("fromUsername", "toUsername"), accepted("toUsername", "fromUsername")]);
  const seen = new Set<string>();
  const friends = [...fromMe, ...toMe].filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
  const chunks: string[][] = [];
  for (let i = 0; i < friends.length; i += 10) chunks.push(friends.slice(i, i + 10));
  const docs = (await Promise.all(chunks.map((c) => getDocs(query(collection(db, "users"), where("username", "in", c)))))).flatMap((q) => q.docs);
  return docs
    .filter((d) => isOnlineNow(d.data()))
    .map((d) => String(d.get("username") || ""))
    .filter(Boolean)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

// 🎟 Pick who to invite: type a name, or tap an online friend / someone in the room.
function TnInviteDialog({ state, seat, roomUsers, onClose }: { state: TnState; seat: number; roomUsers: string[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [onlineFriends, setOnlineFriends] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    if (!state.myUid) return setOnlineFriends([]);
    loadOnlineFriends(state.myUid)
      .then((f) => alive && setOnlineFriends(f))
      .catch(() => alive && setOnlineFriends([]));
    return () => {
      alive = false;
    };
  }, [state.myUid]);
  const taken = new Set([
    ...state.seats.map((p) => (p ? p.username.toLowerCase() : "")),
    ...Object.values(state.invites).map((v) => v.username.toLowerCase()),
  ]);
  const friendPicks = (onlineFriends || []).filter((u) => !taken.has(u.toLowerCase()));
  const friendSet = new Set(friendPicks.map((u) => u.toLowerCase()));
  const seen = new Set<string>();
  const suggestions = roomUsers
    .filter((u) => {
      const k = u.toLowerCase();
      if (!u.trim() || taken.has(k) || friendSet.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 20);
  const pickRow = (title: string, names: string[], dot: boolean) => (
    <>
      <p className="mt-2.5 text-[11px] font-bold text-[#7A7699]">{title}</p>
      <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {names.map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setName(u)}
            className={`flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-bold ${u.toLowerCase() === name.toLowerCase() ? "bg-[#F2C94C]" : "bg-[#EDEAFB]"}`}
          >
            {dot && <span className="mr-[5px] h-[7px] w-[7px] rounded-full bg-[#2ECC71]" />}
            {u}
          </button>
        ))}
      </div>
    </>
  );
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 text-[#22204A]" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-extrabold">{seat >= 0 ? `🎟 Invite to seat ${seat + 1} (Team ${seat % 2 === 0 ? "A" : "B"})` : "🎟 Invite a friend"}</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value.trim().slice(0, 30))}
          placeholder="Username"
          className="mt-3 w-full rounded-xl border border-[#D9D3F3] px-3 py-2.5 text-base outline-none focus:border-[#6A4BD8]"
        />
        {friendPicks.length > 0 ? (
          pickRow("🟢 Online friends", friendPicks, true)
        ) : (
          <p className="mt-2.5 text-[11px] text-[#7A7699]">{onlineFriends === null ? "🟢 Online friends · loading…" : "🟢 No friends online right now"}</p>
        )}
        {suggestions.length > 0 && pickRow("👥 In this room", suggestions, false)}
        <p className="mt-2 text-[10px] text-[#7A7699]">They get an alert + notification. Only they can take the seat until the timer ends.</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-bold text-[#6A4BD8]">
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || state.busy}
            onClick={() => {
              state.invite(name, seat);
              onClose();
            }}
            className="rounded-lg bg-[#6A4BD8] px-4 py-2 text-sm font-extrabold text-white disabled:opacity-40"
          >
            Invite
          </button>
        </div>
      </div>
    </div>
  );
}

function TnInfo({ state }: { state: TnState }) {
  const myTeam = state.mySeat >= 0 ? state.mySeat % 2 : -1;
  const nameOf = (s: number) => (state.seats[s]?.username || "").replace("🤖", "").trim();
  // [text, kind] — kind: "strong" purple · "a"/"b" team tint · "" glass
  const chips: [string, string][] = [];
  if (state.phase === "BIDDING" && state.bidder >= 0 && state.turn >= 0 && state.turn !== state.bidder) {
    // ⚔ who is bidding against whom right now
    const other = state.seatBids[state.turn] || 0;
    chips.push([`⚔ ${nameOf(state.bidder)} ${state.bid}  vs  ${nameOf(state.turn)} ${other > 0 ? other : "…"}`, "strong"]);
  } else if (state.bidder >= 0) {
    chips.push([`Bid ${state.bid} · ${nameOf(state.bidder)}`, ""]);
    if (state.target > 0) chips.push([`🎯 Target ${state.target}`, "strong"]);
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
  if (trump) chips.push([trump, ""]);
  if (state.doubleLevel > 1) chips.push([state.doubleLevel === 4 ? "🔥 Redouble x4" : "🔥 Double x2", "strong"]);
  chips.push([`A ${state.points[0]}${myTeam === 0 ? " (you)" : ""}`, "a"]);
  chips.push([`B ${state.points[1]}${myTeam === 1 ? " (you)" : ""}`, "b"]);
  return (
    <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
      {chips.map(([t, kind], i) => {
        const tint = kind === "a" ? TEAM_A : kind === "b" ? TEAM_B : null;
        return (
          <span
            key={i}
            className="shrink-0 whitespace-nowrap rounded-full px-2 py-[3px] text-[10px] font-extrabold text-white"
            style={{
              background:
                kind === "strong"
                  ? "linear-gradient(to right, #2D56B0, #6A4BD8)"
                  : tint
                    ? `linear-gradient(to right, ${tint}4D, ${tint}1F)`
                    : "rgba(255,255,255,.07)",
              border: `1px solid ${kind === "strong" ? "rgba(242,201,76,.6)" : tint ? `${tint}B3` : "rgba(255,255,255,.14)"}`,
            }}
          >
            {t}
          </span>
        );
      })}
    </div>
  );
}

// The four seats, rotated so I sit at the bottom, with the current trick in the middle.
function TnFelt({ state }: { state: TnState }) {
  const base = state.mySeat >= 0 ? state.mySeat : 0;
  // 29 is played ANTICLOCKWISE: the next seat in turn order (seat + 1) sits
  // on my right, then across, then on my left (same as the app).
  const posOf = (seat: number) => (base - seat + 4) % 4; // 0 bottom, 1 left, 2 top, 3 right
  // A finished trick's 4 cards stay on the table (winner's card outlined in
  // gold) until the next card is played.
  const showingLast =
    state.trick.length === 0 && state.lastTrick.length > 0 && (state.phase === "PLAYING" || state.phase === "NEXTDEAL");
  const onTable = showingLast ? state.lastTrick : state.trick;
  const seatPos = ["bottom-1 left-1/2 -translate-x-1/2", "left-1 top-1/2 -translate-y-1/2", "top-1 left-1/2 -translate-x-1/2", "right-1 top-1/2 -translate-y-1/2"];
  // trick cards near each player's side
  const cardPos = [
    "left-1/2 top-1/2 -translate-x-1/2 translate-y-[2px]",
    "left-1/2 top-1/2 -translate-x-[80px] -translate-y-[27px]",
    "left-1/2 top-1/2 -translate-x-1/2 -translate-y-[50px]",
    "left-1/2 top-1/2 translate-x-[44px] -translate-y-[27px]",
  ];
  const showTrump = ["PLAYING", "DOUBLE", "SINGLE", "NEXTDEAL"].includes(state.phase);
  const shownSuit = state.trumpRevealed ? state.trumpSuit : null;
  const mine = !state.trumpRevealed ? state.myTrump : null;

  return (
    <div
      className="mt-1.5 rounded-[30px] p-[2.5px] shadow-[0_6px_18px_rgba(74,120,218,.55)]"
      style={{ background: "linear-gradient(135deg, #FFF3C4, #D29B16, #FFE49A, #D29B16)" }}
    >
      <div className="tn-shine relative h-[226px] overflow-hidden rounded-[28px] bg-[radial-gradient(circle,_#5585E8,_#2D56B0_60%,_#142B63)]">
        {/* faint suit pattern + "miglife 29 CARD" printed on the felt */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 overflow-hidden whitespace-nowrap text-[18px] leading-tight text-white/[0.04]">
          {[0, 1, 2, 3, 4, 5].map((r) => (
            <span key={r}>{(r % 2 === 0 ? "♠  ♥  ♣  ♦  " : "  ♦  ♣  ♥  ♠").repeat(4)}</span>
          ))}
        </div>
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <span className="text-[15px] font-extrabold tracking-[5px] text-[#F2C94C]/45">miglife</span>
          <span className="text-[8px] font-bold tracking-[3px] text-white/30">29 CARD</span>
        </div>
        {[0, 1, 2, 3].map((seat) =>
          state.seats[seat] ? (
            <div key={seat} className={`absolute ${seatPos[posOf(seat)]}`}>
              <SeatBadge state={state} seat={seat} />
            </div>
          ) : null
        )}
        {onTable.map((t) => {
          const winner = showingLast && t.seat === state.lastTrickWinner;
          return (
            <span
              key={`${t.seat}${t.card}`}
              className={`absolute ${cardPos[posOf(t.seat)]} rounded-[5px] ${winner ? "ring-[2.5px] ring-[#F2C94C] shadow-[0_0_10px_#F2C94C]" : ""}`}
            >
              <TnCard card={t.card} w={36} />
            </span>
          );
        })}
        {/* Trump card — top-left; face-down until revealed, the bidder sees their own suit */}
        {showTrump && (
          <div className="absolute left-[18%] top-2.5 flex flex-col items-center rounded-[10px] border border-[#F2C94C]/50 bg-black/25 px-1.5 py-1">
            <span className="text-[8px] font-extrabold tracking-[1px] text-[#F2C94C]">{state.seventhCard ? "7TH CARD" : "TRUMP"}</span>
            <span className="mt-0.5">
              {state.singleSeat >= 0 ? (
                <span className="text-sm font-bold text-white">—</span>
              ) : shownSuit || mine ? (
                <span
                  className={`flex h-[42px] w-[30px] items-center justify-center rounded-[5px] bg-white text-2xl leading-none ${
                    (shownSuit || mine) === "♥" || (shownSuit || mine) === "♦" ? "text-[#D32F2F]" : "text-black"
                  }`}
                  style={{ border: mine ? "2px solid #F2C94C" : "1px solid #CFC6E2" }}
                >
                  {shownSuit || mine}
                </span>
              ) : (
                <TnCardBack w={30} />
              )}
            </span>
            {mine && <span className="text-[7px] text-white/75">only you</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function SeatBadge({ state, seat }: { state: TnState; seat: number }) {
  const p = state.seats[seat];
  if (!p) return null;
  const isTurn = (state.phase === "TRUMP" && state.bidder === seat) || (state.phase !== "TRUMP" && state.turn === seat);
  const isMe = state.mySeat === seat;
  const out = state.singleSeat >= 0 && seat === (state.singleSeat + 2) % 4;
  const teamColor = seat % 2 === 0 ? TEAM_A : TEAM_B;
  const name = p.username.replace("🤖", "").trim();
  const bidding = state.phase === "BIDDING";
  const seatBid = state.seatBids[seat] || 0;
  const passedHere = bidding && state.passed[seat] === true;
  const holder = seat === state.bidder && state.bid > 0;
  const challenger = bidding && seat === state.turn && seat !== state.bidder;
  // 🏷️ bid badges: during bidding both players of the duel show their number
  // (holder gold ★, challenger purple, "…" = still thinking)
  const badge: [string, string] | null = passedHere
    ? ["PASS", "#6E6A8E"]
    : bidding && holder
      ? [`★ ${state.bid}`, "#D29B16"]
      : challenger
        ? [seatBid > 0 ? `${seatBid}` : "…", "#6A4BD8"]
        : bidding && seatBid > 0
          ? [`${seatBid}`, "#6E6A8E"]
          : holder
            ? [`${state.bid}`, "#6A4BD8"]
            : null;
  const duel = bidding && (holder || challenger);
  return (
    <div className={`flex w-[84px] flex-col items-center ${out ? "opacity-40" : ""}`}>
      <span className="relative flex h-11 w-11 items-center justify-center">
        {isTurn && <span className="tn-turn-halo absolute inset-0 rounded-full bg-[#F2C94C]/35" />}
        <span
          className={`relative flex h-9 w-9 items-center justify-center rounded-full text-sm font-black text-[#22204A]`}
          style={{
            background: `radial-gradient(circle, #FFFFFF, ${teamColor})`,
            border: `${isTurn ? 2.5 : 2}px solid ${isTurn || isMe ? "#F2C94C" : "rgba(255,255,255,.8)"}`,
            boxShadow: isTurn || isMe ? "0 0 8px #F2C94C" : "0 1px 3px rgba(0,0,0,.4)",
          }}
        >
          {(name[0] || "?").toUpperCase()}
        </span>
        {(p.bot || p.auto) && <span className="absolute bottom-0 right-0 text-[10px]">🤖</span>}
        {/* dealer button */}
        {seat === state.dealer && (
          <span className="absolute right-0 top-0 flex h-[15px] w-[15px] items-center justify-center rounded-full border border-white bg-[radial-gradient(circle,_#FFF3C4,_#F2C94C,_#D29B16)] text-[8px] font-black text-[#22204A]">
            D
          </span>
        )}
      </span>
      <span
        className={`mt-0.5 flex max-w-full items-center rounded-full px-1.5 py-px ${isMe ? "text-[#22204A]" : "text-white"}`}
        style={{ background: isMe ? "linear-gradient(#FFE9A8, #F2C94C)" : "rgba(0,0,0,.45)" }}
      >
        <span className="max-w-[42px] truncate text-[9px] font-extrabold">{name}</span>
        {badge && (
          <span
            className={`ml-[3px] rounded-full font-black text-white ${duel ? "border border-white/80 px-[5px] text-[10px]" : "px-1 text-[8px]"}`}
            style={{ background: badge[1] }}
          >
            {badge[0]}
          </span>
        )}
        {seat === state.singleSeat && <span className={`ml-[3px] text-[8px] font-black ${isMe ? "text-[#22204A]" : "text-[#F2C94C]"}`}>1H</span>}
      </span>
    </div>
  );
}

const goldBtn = "rounded-[10px] border border-[#FFF3C4] bg-gradient-to-b from-[#FFE9A8] via-[#F2C94C] to-[#D29B16] font-black text-[#22204A]";
const roseBtn = "rounded-[10px] bg-gradient-to-b from-[#F07A89] to-[#E5586A] font-black text-white";
const goldLabel = "mb-1 block text-[10px] font-extrabold tracking-[1.5px]";

function TnActions({ state }: { state: TnState }) {
  const mySeat = state.mySeat;

  if (state.phase === "NEXTDEAL") {
    const made = state.lastDeal.winTeam === state.lastDeal.bidderTeam;
    const c = made ? "#3DD68C" : "#E5586A";
    return (
      <p
        className="rounded-xl px-2.5 py-[7px] text-center text-xs font-bold"
        style={{ background: `${c}26`, border: `1px solid ${c}99`, color: made ? "#6BF0AE" : "#FF9AA6" }}
      >
        Deal {state.dealNo}: team {state.lastDeal.bidderTeam === 0 ? "A" : "B"}{" "}
        {made ? `made the bid +${state.lastDeal.gp}` : `failed −${state.lastDeal.gp}`} · next deal in {state.secondsLeft}s
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
      BIDDING: `⏳ ${who} is bidding…`,
      TRUMP: `⏳ ${who} is choosing trump 🤫`,
      DOUBLE: `⏳ ${who}: double?`,
      SINGLE: `⏳ ${who}: single hand?`,
    };
    return <p className="text-center text-[11px] font-semibold text-white/60">{text[state.phase] || `⏳ ${who}'s turn`}</p>;
  }

  if (state.phase === "BIDDING") {
    const min = Math.max(16, state.bid + 1);
    return (
      <div>
        <span className={goldLabel} style={goldText}>
          ✦ YOUR BID
        </span>
        <div className="flex gap-[5px] overflow-x-auto pb-0.5 [scrollbar-width:none]">
          <button type="button" disabled={state.busy} onClick={() => state.act("pass")} className={`${roseBtn} shrink-0 px-3 py-2 text-xs disabled:opacity-50`}>
            PASS
          </button>
          {Array.from({ length: 28 - min + 1 }, (_, i) => min + i).map((b) => (
            <button
              key={b}
              type="button"
              disabled={state.busy}
              onClick={() => state.act("bid", { bid: b })}
              className={`${goldBtn} shrink-0 px-2.5 py-2 text-[13px] disabled:opacity-50`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (state.phase === "TRUMP") {
    return (
      <div>
        <span className={goldLabel} style={goldText}>
          ✦ CHOOSE TRUMP 🤫
        </span>
        <div className="flex gap-1.5">
          {SUITS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={state.busy}
              onClick={() => state.act("trump", { suit: s })}
              className={`flex-1 rounded-xl border-[1.5px] border-[#F2C94C] bg-gradient-to-b from-white to-[#F3F0FA] py-1.5 text-2xl leading-tight shadow-[0_0_8px_rgba(242,201,76,.6)] ${
                s === "♥" || s === "♦" ? "text-[#D32F2F]" : "text-black"
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
          className="mt-1.5 w-full rounded-xl border-[1.5px] border-[#F2C94C] bg-gradient-to-r from-[#6A4BD8] to-[#2D56B0] py-2 text-[13px] font-extrabold text-white disabled:opacity-50"
        >
          7️⃣&nbsp; 7th Card Trump
        </button>
        <p className="mt-[3px] text-center text-[10px] text-white/50">The suit of your 7th card (dealt next) becomes trump — hidden from everyone else.</p>
      </div>
    );
  }

  if (state.phase === "DOUBLE" || state.phase === "SINGLE") {
    const bidderTeam = state.bidder >= 0 && mySeat % 2 === state.bidder % 2;
    return (
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={state.busy}
          onClick={() => state.act(state.phase === "DOUBLE" ? "double" : "single")}
          className={`${goldBtn} py-[7px] text-[13px] disabled:opacity-50`}
        >
          {state.phase === "SINGLE" ? "☝ Single Hand" : bidderTeam ? "🔥 Redouble x4" : "🔥 Double x2"}
        </button>
        <button type="button" disabled={state.busy} onClick={() => state.act("pass")} className={`${roseBtn} py-[7px] text-[13px] disabled:opacity-50`}>
          PASS
        </button>
      </div>
    );
  }

  // PLAYING
  const led = state.ledSuit;
  const cantFollow = !!led && !state.myCards.some((c) => c.endsWith(led));
  return (
    <div className="space-y-1">
      {cantFollow && !state.trumpRevealed && state.singleSeat < 0 && (
        <button type="button" disabled={state.busy} onClick={() => state.act("reveal")} className={`${goldBtn} w-full py-[7px] text-[13px] disabled:opacity-50`}>
          🔓 Ask for trump
        </button>
      )}
      <p className="text-center text-[13px] font-extrabold" style={goldText}>
        {state.seats[mySeat]?.auto
          ? "🤖 Auto Play is playing for you"
          : state.mustTrumpSeat === mySeat
            ? "✦ Your turn — play a trump"
            : "✦ Your turn — tap a card"}
      </p>
    </div>
  );
}

function TnHand({ state }: { state: TnState }) {
  const mySeat = state.mySeat;
  const playing = state.phase === "PLAYING" && state.turn === mySeat;
  const legal = new Set(playing ? legalCards(state, mySeat) : []);
  return (
    // my cards lie on a dark velvet tray with a gold edge
    <div className="flex justify-center overflow-x-auto rounded-2xl border border-[#F2C94C]/35 bg-gradient-to-b from-white/[0.08] to-black/25 pb-1.5 pl-1.5 pt-1 [scrollbar-width:none]">
      {sortHand(state.myCards).map((c) => {
        const ok = playing && legal.has(c) && !state.busy;
        return (
          <button
            key={c}
            type="button"
            disabled={!ok}
            onClick={() => state.act("play", { card: c })}
            className={`-ml-1.5 mt-2 shrink-0 rounded-md transition ${ok ? "-translate-y-2 shadow-[0_0_10px_#F2C94C] hover:-translate-y-3" : ""} ${
              playing && !ok ? "opacity-45" : ""
            }`}
          >
            <TnCard card={c} w={44} />
          </button>
        );
      })}
    </div>
  );
}

// 🃏 29 Card's own playing cards (like the app): ivory face with a gold edge
// and a soft shine; rank + suit in two corners, a big centre suit (J ⚔ ·
// Q ♛ · K ♚ on the face cards) and a gold badge with the card's 29 points
// (J 3 · 9 2 · A 1 · 10 1). Height = width × 1.4.
const CARD_POINTS: Record<string, number> = { J: 3, "9": 2, A: 1, "10": 1 };

function TnCard({ card, w }: { card: string; w: number }) {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const ink = suit === "♥" || suit === "♦" ? "#C62828" : "#1B1B2F";
  const pts = CARD_POINTS[rank] || 0;
  const face = rank === "J" ? "⚔" : rank === "Q" ? "♛" : rank === "K" ? "♚" : null;
  const r = w * 0.14;
  return (
    <span
      className="relative block overflow-hidden"
      style={{
        width: w,
        height: w * 1.4,
        borderRadius: r,
        border: "1.2px solid transparent",
        background:
          "linear-gradient(115deg, rgba(255,255,255,0) 15%, rgba(255,255,255,.55) 40%, rgba(255,255,255,0) 65%) padding-box, linear-gradient(135deg, #FFFFFF, #FFF8E7, #F6EBD0) padding-box, linear-gradient(135deg, #FFE49A, #D29B16, #FFE49A) border-box",
        boxShadow: "0 2px 4px rgba(0,0,0,.4)",
        color: ink,
      }}
    >
      {/* thin inner frame */}
      <span className="pointer-events-none absolute" style={{ inset: 2, borderRadius: r * 0.7, border: `0.8px solid ${ink}1F` }} />
      {/* top-left corner */}
      <span className="absolute flex flex-col items-center leading-none" style={{ left: w * 0.08, top: w * 0.05 }}>
        <span className="font-black tracking-[-0.5px]" style={{ fontSize: w * 0.32 }}>
          {rank}
        </span>
        <span style={{ fontSize: w * 0.24 }}>{suit}</span>
        {/* 29 points badge under the corner (stays visible when cards overlap) */}
        {pts > 0 && (
          <span
            className="mt-px flex items-center justify-center rounded-full border-[0.8px] border-white font-black text-[#22204A]"
            style={{ width: w * 0.25, height: w * 0.25, fontSize: w * 0.16, background: "radial-gradient(circle, #FFF3C4, #F2C94C, #D29B16)" }}
          >
            {pts}
          </span>
        )}
      </span>
      {/* centre: big suit, face cards get their crown / sword */}
      <span className="absolute inset-0 flex items-center justify-center leading-none" style={{ paddingTop: w * 0.12 }}>
        {face ? (
          <span
            className="flex items-center justify-center rounded-full"
            style={{
              width: w * 0.62,
              height: w * 0.62,
              fontSize: w * 0.36,
              background: `radial-gradient(circle, ${ink}1A, ${ink}05)`,
              border: "1px solid rgba(210,155,22,.6)",
            }}
          >
            {face}
          </span>
        ) : (
          <span style={{ fontSize: w * 0.56, opacity: 0.9 }}>{suit}</span>
        )}
      </span>
      {/* bottom-right corner, upside down */}
      <span className="absolute flex rotate-180 flex-col items-center leading-none" style={{ right: w * 0.08, bottom: w * 0.05 }}>
        <span className="font-black" style={{ fontSize: w * 0.22 }}>
          {rank}
        </span>
        <span style={{ fontSize: w * 0.17 }}>{suit}</span>
      </span>
    </span>
  );
}

// Card back: royal blue with a gold rim, diamond lattice and a "29" medallion.
function TnCardBack({ w }: { w: number }) {
  return (
    <span
      className="flex items-center justify-center p-[1.5px] shadow-[0_2px_4px_rgba(0,0,0,.4)]"
      style={{ width: w, height: w * 1.4, borderRadius: w * 0.14, background: "linear-gradient(135deg, #FFE49A, #D29B16, #FFE49A)" }}
    >
      <span
        className="flex h-full w-full items-center justify-center"
        style={{
          borderRadius: w * 0.11,
          background:
            "repeating-linear-gradient(45deg, rgba(255,255,255,.1) 0 1px, transparent 1px 6px), repeating-linear-gradient(-45deg, rgba(255,255,255,.1) 0 1px, transparent 1px 6px), radial-gradient(circle, #4A78DA, #2D56B0 60%, #142B63)",
        }}
      >
        <span
          className="flex items-center justify-center rounded-full border border-white/80 font-black text-[#22204A]"
          style={{ width: w * 0.55, height: w * 0.55, fontSize: w * 0.24, background: "radial-gradient(circle, #FFF3C4, #F2C94C, #D29B16)" }}
        >
          29
        </span>
      </span>
    </span>
  );
}
