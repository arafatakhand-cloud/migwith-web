"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { isOnlineNow } from "../../lib/heartbeat";
import { setViewedTable } from "../../lib/gameTables";
import { BotFace } from "./BotFace";
import { StyleShopDialog, useInventory, type Inventory, type ShopItem } from "./StyleShop";
import { isClassicNow } from "../../lib/uiStyle";

// 🃏 29 (Twenty-Nine) — server-driven (tnStart / tnJoin / tnAction / tnTick).
// 4 seats, teams A (seats 1+3) vs B (seats 2+4); empty seats get bots. Your own
// cards come from room_game/{table}/tn_hands/{uid}, which only you can read.
// Unlimited tables per room: table 1 = room_game/{room}, table N =
// "{room} #N" (every table doc carries tnRoom). Same flow as TwentyNineGame.kt.

export const TN_ROOM = "🃏 29 Official";
// 🆓 Same game, no coins (no entry, no payout) — the server checks this too.
export const TN_FREE_ROOM = "🃏 29 Card Free";

const RANKS = ["7", "8", "Q", "K", "10", "A", "9", "J"];
const SUITS = ["♠", "♥", "♣", "♦"];
const TEAM_A = "#7DB6FF";
const TEAM_B = "#FF9B7A";
const GOLD = "#F2C94C";
const GOLD_DARK = "#D29B16";
const INK = "#22204A";
const PURPLE = "#6A4BD8";
const ROSE = "#E5586A";
const GLASS = "rgba(255,255,255,.07)";
const GLASS_LINE = "rgba(255,255,255,.14)";
const GOLD_GRAD = "linear-gradient(to bottom, #FFE9A8, #F2C94C, #D29B16)";
/** Height of the one big board (lobby, seats and game). */
const BOARD_H = 348;

const startCall = httpsCallable<Record<string, unknown>, { table?: number }>(functions, "tnStart");
const joinCall = httpsCallable<Record<string, unknown>, { table?: number }>(functions, "tnJoin");
const actionCall = httpsCallable(functions, "tnAction");
const tickCall = httpsCallable(functions, "tnTick");
const inviteCall = httpsCallable(functions, "tnInvite");
const addBotCall = httpsCallable(functions, "tnAddBot");

// ---------------- 🎨 Styles: board + cards ----------------
// One of each is free, the rest are bought with coins (from 50,000).
// Same ids and prices as TN_SHOP in index.js. Styles are what YOU see.
type TnBoardSkin = ShopItem & { felt: string[]; rim: string[]; glow: string; pattern: string };
type TnCardSkin = ShopItem & {
  face: string[];
  edge: string[];
  red: string;
  black: string;
  back: string[];
  backLine: string;
  medal: string[];
};

const TN_BOARD_SKINS: TnBoardSkin[] = [
  {"id": "royal", "name": "Royal Blue", "price": 0, "felt": ["#5585E8", "#2D56B0", "#142B63"], "rim": ["#FFF3C4", "#D29B16", "#FFE49A", "#D29B16"], "glow": "#4A78DA", "pattern": "#FFFFFF"},
  {"id": "emerald", "name": "Casino Green", "price": 50000, "felt": ["#3FC07A", "#1B7A45", "#0A3B20"], "rim": ["#FFF3C4", "#D29B16", "#FFE49A", "#D29B16"], "glow": "#1B7A45", "pattern": "#FFFFFF"},
  {"id": "crimson", "name": "Crimson", "price": 60000, "felt": ["#E0485E", "#9E1B32", "#4A0614"], "rim": ["#FFF3C4", "#D29B16", "#FFE49A", "#D29B16"], "glow": "#B0243A", "pattern": "#FFE08A"},
  {"id": "midnight", "name": "Neon Midnight", "price": 75000, "felt": ["#3A2C8C", "#1B1450", "#080622"], "rim": ["#00E5FF", "#7C4DFF", "#FF2D95", "#00E5FF"], "glow": "#7C4DFF", "pattern": "#00E5FF"},
  {"id": "gold", "name": "VIP Gold", "price": 100000, "felt": ["#3B2A12", "#1E1408", "#0A0703"], "rim": ["#FFF8D6", "#FFC107", "#FFF3C4", "#B8860B"], "glow": "#FFB300", "pattern": "#FFD54F"},
];

const TN_CARD_SKINS: TnCardSkin[] = [
  {"id": "ivory", "name": "Ivory", "price": 0, "face": ["#FFFFFF", "#FFF8E7", "#F6EBD0"], "edge": ["#FFE49A", "#D29B16", "#FFE49A"], "red": "#C62828", "black": "#1B1B2F", "back": ["#4A78DA", "#2D56B0", "#142B63"], "backLine": "#FFFFFF", "medal": ["#FFF3C4", "#F2C94C", "#D29B16"]},
  {"id": "classic", "name": "Classic Red", "price": 50000, "face": ["#FFFFFF", "#FFFFFF", "#F4F4F4"], "edge": ["#BDBDBD", "#9E9E9E", "#BDBDBD"], "red": "#D32F2F", "black": "#111111", "back": ["#E53935", "#B71C1C", "#7F0000"], "backLine": "#FFFFFF", "medal": ["#FFFFFF", "#FFCDD2", "#E57373"]},
  {"id": "neon", "name": "Neon", "price": 60000, "face": ["#1A1433", "#120E2A", "#0E0A22"], "edge": ["#00E5FF", "#7C4DFF", "#FF2D95"], "red": "#FF4D8D", "black": "#00E5FF", "back": ["#2A2350", "#160F33", "#0A0620"], "backLine": "#00E5FF", "medal": ["#FF8AD8", "#FF2D95", "#7C4DFF"]},
  {"id": "gold", "name": "Gold", "price": 75000, "face": ["#FFFDF3", "#FFF1C9", "#FFE08A"], "edge": ["#FFF3C4", "#B8860B", "#FFF3C4"], "red": "#B71C1C", "black": "#3E2500", "back": ["#FFE57F", "#FFB300", "#B8860B"], "backLine": "#5D3A00", "medal": ["#FFFDF3", "#FFE57F", "#B8860B"]},
  {"id": "diamond", "name": "Diamond", "price": 100000, "face": ["#FFFFFF", "#EAF6FF", "#D6ECFF"], "edge": ["#E3F7FF", "#3A8DDE", "#E3F7FF"], "red": "#E53935", "black": "#0D47A1", "back": ["#E3F7FF", "#8FD8FF", "#3A8DDE"], "backLine": "#FFFFFF", "medal": ["#FFFFFF", "#B3E5FC", "#3A8DDE"]},
];

const TN_KINDS = [
  { kind: "board", ownedField: "ownedBoards", free: "royal" },
  { kind: "card", ownedField: "ownedCards", free: "ivory" },
];
const boardSkinOf = (id: string | undefined) => TN_BOARD_SKINS.find((s) => s.id === id) || TN_BOARD_SKINS[0];
const cardSkinOf = (id: string | undefined) => TN_CARD_SKINS.find((s) => s.id === id) || TN_CARD_SKINS[0];
// 📟 Classic app style: blue felt with an orange rim and Classic Red cards for
// everyone (not sold in the shop); bought styles return in Modern.
const TN_CLASSIC_BOARD: TnBoardSkin = {
  id: "classic_ui", name: "Classic", price: 0,
  felt: ["#5A8FD6", "#2F6ABD", "#1D4378"],
  rim: ["#FFE0B8", "#F07A00", "#FFC27A", "#F07A00"],
  glow: "#F07A00", pattern: "#FFFFFF",
};
const boardNow = (id: string | undefined) => (isClassicNow() ? TN_CLASSIC_BOARD : boardSkinOf(id));
const cardNow = () => cardSkinOf(isClassicNow() ? "classic" : myCardSkinId);
// My card style — read by every 29 card drawn.
let myCardSkinId = "ivory";

type Seat = { uid: string; username: string; bot: boolean; auto: boolean; photoUrl: string } | null;
type TrickCard = { seat: number; card: string };
/** 🎟 An empty seat kept for an invited player (tnInvite). */
type TnInvite = { uid: string; username: string; by: string; byUid: string };
/** One table of the room (for the table strip). */
type TableInfo = { no: number; running: boolean; phase: string; seats: number; entry: number; phaseEndsAt: number; mine: boolean; invitedMe: boolean; round: number };

export type TnState = {
  /** Table on screen: 1, 2, 3 … · 0 = a new, empty table. */
  table: number;
  tables: TableInfo[];
  /** Table I'm playing at (0 = none) — the screen sticks to it. */
  myTable: number;
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
  lastDeal: { winTeam: number; gp: number; bidderTeam: number; annulled: boolean; reason: string };
  /** Each seat's own last bid this deal + who has passed (bidding duel badges). */
  seatBids: number[];
  passed: boolean[];
  /** Bidding duel: holder (may HOLD = say the same number) vs challenger (must go higher). */
  bidH: number;
  bidC: number;
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
  selectedEntry: number;
  setSelectedEntry: (n: number) => void;
  inv: Inventory;
  showTable: (table: number) => void;
  start: (entry: number) => void;
  /** table = 0 → the table on screen if it's taking seats, else the first open one. */
  join: (seat?: number, table?: number) => void;
  act: (type: string, extra?: Record<string, unknown>) => void;
  /** 🎟 Keep an empty seat for a friend (seat -1 = the server picks, partner seat first). */
  invite: (username: string, seat?: number) => void;
  cancelInvite: (seat: number) => void;
  /** 🤖 Put a bot into an empty seat (I must be seated). */
  addBot: (seat: number) => void;
};

function opId(): string {
  return "tn_" + crypto.randomUUID().replace(/-/g, "");
}

function pair(v: unknown): [number, number] {
  return Array.isArray(v) && v.length === 2 ? [Number(v[0]) || 0, Number(v[1]) || 0] : [0, 0];
}

function parseSeats(raw: unknown): Seat[] {
  return [0, 1, 2, 3].map((i) => {
    const m = Array.isArray(raw) ? raw[i] : null;
    return m && typeof m === "object"
      ? { uid: String(m.uid || ""), username: String(m.username || ""), bot: m.bot === true, auto: m.auto === true, photoUrl: String(m.photoUrl || "") }
      : null;
  });
}

function parseGame(d: Record<string, any> | undefined) {
  const res = (d?.result || {}) as Record<string, any>;
  const ld = (d?.lastDeal || {}) as Record<string, any>;
  const trickOf = (raw: unknown): TrickCard[] =>
    Array.isArray(raw) ? raw.map((t: any) => ({ seat: Number(t?.seat || 0), card: String(t?.card || "") })) : [];
  return {
    running: d?.running === true,
    phase: String(d?.phase || "IDLE"),
    phaseEndsAt: Number(d?.phaseEndsAt || 0),
    round: Number(d?.roundNumber || 0),
    entry: Number(d?.entry || 500),
    pot: Number(d?.pot || 0),
    seats: parseSeats(d?.seats),
    dealer: Number(d?.dealer || 0),
    turn: Number(d?.turn ?? -1),
    bid: Number(d?.bid || 0),
    bidder: Number(d?.bidder ?? -1),
    target: Number(d?.target || 0),
    doubleLevel: Number(d?.doubleLevel || 1),
    singleSeat: Number(d?.singleSeat ?? -1),
    trumpRevealed: d?.trumpRevealed === true,
    trumpSuit: d?.trumpSuit ? String(d.trumpSuit) : null,
    seventhCard: d?.seventhCard === true,
    trick: trickOf(d?.trick),
    lastTrick: trickOf(d?.lastTrick?.cards),
    lastTrickWinner: Number(d?.lastTrick?.winner ?? -1),
    ledSuit: d?.ledSuit ? String(d.ledSuit) : null,
    points: pair(d?.points),
    tricksPlayed: Number(d?.tricksPlayed || 0),
    mustTrumpSeat: Number(d?.mustTrumpSeat ?? -1),
    resultWinTeam: Number(res.winTeam ?? -1),
    resultShare: Number(res.share || 0),
    match: pair(d?.match),
    dealNo: Number(d?.dealNo || 0),
    lastDeal: {
      winTeam: Number(ld.winTeam ?? -1),
      gp: Number(ld.gp || 0),
      bidderTeam: Number(ld.bidderTeam ?? -1),
      annulled: ld.annulled === true,
      reason: typeof ld.reason === "string" ? ld.reason : "",
    },
    seatBids: [0, 1, 2, 3].map((i) => Number((d?.seatBids || [])[i]) || 0),
    passed: [0, 1, 2, 3].map((i) => (d?.passed || [])[i] === true),
    bidH: Number(d?.bidH ?? -1),
    bidC: Number(d?.bidC ?? -1),
    invites: Object.fromEntries(
      Object.entries((d?.invites || {}) as Record<string, any>)
        .filter(([k, v]) => Number.isInteger(Number(k)) && v && typeof v === "object")
        .map(([k, v]) => [Number(k), { uid: String(v.uid || ""), username: String(v.username || ""), by: String(v.by || ""), byUid: String(v.byUid || "") }])
    ) as Record<number, TnInvite>,
  };
}

// roomId = the 29 room (official or 🆓 free) or null in every other room.
export function useTwentyNine(roomId: string | null, uid: string | undefined, note: (t: string) => void): TnState | null {
  const enabled = !!roomId;
  const [first, setFirst] = useState<Record<string, any> | null>(null);
  const [rest, setRest] = useState<Record<number, Record<string, any>>>({});
  const [table, setTable] = useState(0);
  const [hand, setHand] = useState({ key: "", round: 0, cards: [] as string[], trump: null as string | null });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(500);
  const autoPicked = useRef(false);
  const inviteJump = useRef("");
  const lastTick = useRef<Record<number, number>>({});
  const noteRef = useRef(note);
  noteRef.current = note;
  const inv = useInventory("tn_inventory", enabled ? uid : undefined, TN_KINDS);
  myCardSkinId = inv.active.card;

  // A different room → start over.
  useEffect(() => {
    setFirst(null);
    setRest({});
    setTable(0);
    autoPicked.current = false;
  }, [roomId]);

  // Every table: table 1 = room_game/{room}, the others carry tnRoom = {room}.
  useEffect(() => {
    if (!roomId || !uid) return;
    const a = onSnapshot(
      doc(db, "room_game", roomId),
      (snap) => setFirst(snap.exists() ? snap.data() : null),
      () => {}
    );
    const b = onSnapshot(
      query(collection(db, "room_game"), where("tnRoom", "==", roomId)),
      (qs) => {
        const next: Record<number, Record<string, any>> = {};
        qs.docs.forEach((d) => {
          const t = Number(d.get("table") || 0);
          if (t > 1) next[t] = d.data();
        });
        setRest(next);
      },
      () => {}
    );
    return () => {
      a();
      b();
    };
  }, [roomId, uid]);

  const docs = useMemo(() => {
    const all: Record<number, Record<string, any>> = { ...rest };
    if (first) all[1] = first;
    return all;
  }, [first, rest]);

  const tables: TableInfo[] = useMemo(
    () =>
      Object.entries(docs)
        .map(([k, d]) => {
          const running = d.running === true;
          const seats = (Array.isArray(d.seats) ? d.seats : []).filter((m: any) => m && typeof m === "object");
          return {
            no: Number(k),
            running,
            phase: String(d.phase || "IDLE"),
            seats: seats.length,
            entry: Number(d.entry || 500),
            phaseEndsAt: Number(d.phaseEndsAt || 0),
            mine: running && !!uid && seats.some((m: any) => m.uid === uid),
            invitedMe:
              running && !!uid && d.phase === "JOINING" && Object.values((d.invites || {}) as Record<string, any>).some((v) => v && v.uid === uid),
            round: Number(d.roundNumber || 0),
          };
        })
        .sort((a, b) => a.no - b.no),
    [docs, uid]
  );
  const myTable = tables.find((t) => t.mine)?.no || 0;

  // The screen sticks to my table; just walked in → a table taking seats;
  // invited → that table (once per invite).
  useEffect(() => {
    if (!enabled) return;
    if (myTable > 0) {
      if (table !== myTable) setTable(myTable);
      return;
    }
    if (!autoPicked.current && tables.length > 0) {
      autoPicked.current = true;
      if (table === 0) {
        const open = tables.find((t) => t.running && t.phase === "JOINING");
        if (open) setTable(open.no);
      }
    }
    const invited = tables.find((t) => t.invitedMe);
    if (invited) {
      const key = `${invited.no}:${invited.round}`;
      if (inviteJump.current !== key) {
        inviteJump.current = key;
        setTable(invited.no);
      }
    }
  }, [enabled, tables, myTable, table]);

  useEffect(() => {
    if (!enabled) return;
    setViewedTable("tn", table);
    return () => setViewedTable("tn", 0);
  }, [enabled, table]);

  const idOf = (t: number) => (roomId ? (t > 1 ? `${roomId} #${t}` : roomId) : "");
  const tableRoomId = idOf(table);

  // My own cards (only I can read them), for the table on screen.
  useEffect(() => {
    if (!roomId || !uid || table <= 0) return;
    const key = `${table}`;
    return onSnapshot(
      doc(db, "room_game", tableRoomId, "tn_hands", uid),
      (d) =>
        setHand({
          key,
          round: Number(d.get("round") || 0),
          cards: Array.isArray(d.get("cards")) ? d.get("cards").map(String) : [],
          trump: d.get("trump") ? String(d.get("trump")) : null,
        }),
      () => {}
    );
  }, [roomId, uid, table, tableRoomId]);

  // Countdown, and move every running table on when its timer ends.
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (document.visibilityState !== "visible") return;
      for (const tb of tables) {
        if (!tb.running || tb.phaseEndsAt <= 0 || n < tb.phaseEndsAt + 300) continue;
        if (n - (lastTick.current[tb.no] || 0) < 1200) continue;
        lastTick.current[tb.no] = n;
        tickCall({ roomId: idOf(tb.no) }).catch(() => {});
      }
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomId, tables]);

  if (!enabled) return null;

  const g = parseGame(table > 0 ? docs[table] : undefined);
  const run = (p: Promise<{ data?: { table?: number } } | unknown>) => {
    setBusy(true);
    p.then((r: any) => {
      const t = Number(r?.data?.table || 0);
      if (t > 0) setTable(t);
    })
      .catch((err: any) => noteRef.current(`29 Bot: ${err?.message || "Something went wrong. Try again."}`))
      .finally(() => setBusy(false));
  };

  const left = g.phaseEndsAt - now;
  const handHere = hand.key === `${table}`;
  const myCards = handHere && (hand.round === g.round || g.round === 0) ? hand.cards : [];

  return {
    ...g,
    table,
    tables,
    myTable,
    myCards,
    myTrump: handHere ? hand.trump : null,
    secondsLeft: g.running && left > 0 ? Math.ceil(left / 1000) : 0,
    busy,
    mySeat: g.seats.findIndex((s) => s?.uid === uid),
    myUid: uid || "",
    free: roomId === TN_FREE_ROOM,
    selectedEntry,
    setSelectedEntry,
    inv,
    showTable: (t: number) => {
      if (myTable > 0 && t !== myTable) {
        noteRef.current(`29 Bot: Finish your match at Table ${myTable} first.`);
        return;
      }
      setTable(t);
    },
    start: (entry: number) => {
      // the table on screen if it's free, else the server opens the next free one
      if (!busy) run(startCall({ entry, operationId: opId(), roomId, table: g.running ? 0 : table }));
    },
    join: (seat = -1, t = 0) => {
      if (busy) return;
      const pick = t > 0 ? t : table;
      run(joinCall({ seat, operationId: opId(), roomId: idOf(pick), anyTable: t === 0 && !(g.running && g.phase === "JOINING") }));
    },
    act: (type: string, extra: Record<string, unknown> = {}) => {
      if (!busy) run(actionCall({ type, round: g.round, roomId: tableRoomId, ...extra }));
    },
    invite: (username: string, seat = -1) => {
      const name = username.trim().replace(/^@/, "");
      if (name && !busy) run(inviteCall({ username: name, seat, roomId: tableRoomId }));
    },
    cancelInvite: (seat: number) => {
      if (!busy) run(inviteCall({ cancel: true, seat, roomId: tableRoomId }));
    },
    addBot: (seat: number) => {
      if (!busy) run(addBotCall({ seat, roomId: tableRoomId }));
    },
  };
}

// Chat commands in the 29 room. True = handled (not posted as chat).
export function twentyNineHandleCommand(state: TnState, text: string, note: (t: string) => void): boolean {
  const parts = text.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  if (cmd === "!start") {
    const amt = Number((parts[1] || "").replace(/,/g, ""));
    state.start(state.free ? 0 : Number.isInteger(amt) && amt > 0 ? amt : state.selectedEntry);
    return true;
  }
  if (cmd === "!j" || cmd === "!join") {
    // !j 2 = sit at table 2
    const n = Number((parts[1] || "").replace(/^t/, ""));
    if (parts[1] && Number.isInteger(n) && n >= 1) state.join(-1, n);
    else state.join();
    return true;
  }
  if (cmd === "!tables" || cmd === "!t") {
    const running = state.tables.filter((t) => t.running);
    note(
      running.length === 0
        ? "29 Bot: No tables running. !start opens one."
        : "29 Bot: " + running.map((t) => `T${t.no} ` + (t.phase === "JOINING" ? `${t.seats}/4 seats (!j ${t.no})` : "playing")).join(" · ")
    );
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
      "29 Bot: !start [entry] opens a table · !j sits down (!j 2 = table 2) · !tables · !invite name keeps a seat for a friend · empty seats get bots · Bid 16–28 · J>9>A>10>K>Q>8>7 · J3 9:2 A1 10:1 · follow suit · can't follow → ask for trump · Pair K+Q of trump ±4 · Double/Redouble · Single Hand = win all 8 alone"
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



const goldText = { background: "linear-gradient(to bottom, #FFF3C4, #F2C94C, #D29B16)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" } as const;
const whiteGoldText = { background: "linear-gradient(to bottom, #FFFFFF, #FFE49A)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" } as const;
const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

export function TwentyNineTable({ state, roomUsers = [] }: { state: TnState; roomUsers?: string[] }) {
  const [collapsed, setCollapsed] = useState(!state.running);
  const [styles, setStyles] = useState(false);
  const [inviteSeat, setInviteSeat] = useState<number | null>(null);
  // Open by itself when a match starts.
  useEffect(() => {
    if (state.running) setCollapsed(false);
  }, [state.running]);
  const mySeat = state.mySeat;
  const playing = state.running && state.phase !== "JOINING";
  const felt = boardNow(state.inv.active.board).felt;
  const phaseLabel: Record<string, string> = {
    JOINING: "Seats",
    BIDDING: "Bidding",
    TRUMP: "Trump",
    DOUBLE: "Double?",
    SINGLE: "Single?",
    NEXTDEAL: "Next deal",
  };
  const autoOn = mySeat >= 0 && state.seats[mySeat]?.auto === true;

  return (
    <div className="px-2 py-1">
      <div
        className="rounded-[18px] px-2 py-1.5"
        style={{ background: "linear-gradient(to bottom, #2A1F6B, #130F33, #0C0A24)", border: `1px solid ${GOLD}73` }}
      >
        {/* Header */}
        <div className="flex items-center">
          <span className="shrink-0 rounded-full px-2.5 py-[3px] text-[13px] font-extrabold text-white" style={{ background: `linear-gradient(90deg, ${felt[1]}, ${PURPLE})` }}>
            {state.table > 0 ? `🃏 29 · T${state.table}` : "🃏 29 Card"}
          </span>
          {state.running && (
            <span
              className="ml-1.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
              style={{ background: state.secondsLeft >= 1 && state.secondsLeft <= 5 ? ROSE : PURPLE }}
            >
              {phaseLabel[state.phase] ? `${phaseLabel[state.phase]} ${state.secondsLeft}s` : `Trick ${state.tricksPlayed + 1}/8 · ${state.secondsLeft}s`}
            </span>
          )}
          <span className="flex-1" />
          {/* 🤖 Auto Play toggle (only when I'm seated in a running match) */}
          {playing && mySeat >= 0 && (
            <button
              type="button"
              disabled={state.busy}
              onClick={() => state.act("auto", { on: !autoOn })}
              className="mr-1.5 shrink-0 rounded-full px-2 py-[3px] text-[11px] font-extrabold text-white"
              style={autoOn ? { background: "linear-gradient(90deg, #34C77B, #1E9B5A)" } : { background: GLASS, border: `1px solid ${GLASS_LINE}` }}
            >
              {autoOn ? "🤖 Auto ON" : "🤖 Auto"}
            </button>
          )}
          <button type="button" onClick={() => setStyles(true)} className="shrink-0 px-[5px] text-base" aria-label="Styles">
            🎨
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-[#D9D3F3] bg-white text-base font-bold"
            style={{ color: INK }}
          >
            {collapsed ? "+" : "−"}
          </button>
        </div>

        {!collapsed && (
          <>
            {/* table chips + (during a game) the bid / trump / score chips — one line */}
            <TnTablesStrip state={state}>{playing && <TnInfo state={state} />}</TnTablesStrip>
            <div className="mt-1">
              {!state.running ? (
                <TnLobbyBoard state={state} />
              ) : state.phase === "JOINING" ? (
                <TnJoinFelt state={state} onInvite={setInviteSeat} />
              ) : (
                <TnFeltTable state={state} />
              )}
            </div>
            {playing && (
              <div className="mt-1 space-y-[3px]">
                <TnActions state={state} />
                {mySeat >= 0 && <TnHand state={state} />}
              </div>
            )}
          </>
        )}
      </div>
      {styles && <TnStyleDialog inv={state.inv} onClose={() => setStyles(false)} />}
      {inviteSeat !== null && state.phase === "JOINING" && (
        <TnInviteDialog state={state} seat={inviteSeat} roomUsers={roomUsers} onClose={() => setInviteSeat(null)} />
      )}
    </div>
  );
}

/**
 * The big board, in my board style: a shining metal rim, a padded rail, the
 * felt with a soft spotlight, a faint suit pattern, a gold inner line and
 * whatever the board shows on top.
 */
function TnBoardFrame({ state, children }: { state: TnState; children: ReactNode }) {
  const sk = boardNow(state.inv.active.board);
  return (
    <div
      className="rounded-[34px] p-[3px]"
      style={{ height: BOARD_H, background: `conic-gradient(${[...sk.rim, sk.rim[0]].join(", ")})`, boxShadow: `0 8px 22px ${sk.glow}88` }}
    >
      <div className="h-full rounded-[31px] p-[7px]" style={{ background: "linear-gradient(#2B1B3F, #120A1E, #2B1B3F)" }}>
        <div
          className="relative h-full overflow-hidden rounded-[26px]"
          style={{
            background: `radial-gradient(circle at 50% 42%, rgba(255,255,255,.16), transparent 60%), radial-gradient(circle, transparent 55%, rgba(0,0,0,.35)), radial-gradient(circle, ${sk.felt[0]}, ${sk.felt[1]} 60%, ${sk.felt[2]})`,
          }}
        >
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 overflow-hidden whitespace-nowrap text-[18px] leading-tight" style={{ color: sk.pattern, opacity: 0.045 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((r) => (
              <span key={r}>{(r % 2 === 0 ? "♠  ♥  ♣  ♦  " : "  ♦  ♣  ♥  ♠").repeat(4)}</span>
            ))}
          </div>
          {/* gold betting line around the middle */}
          <div className="pointer-events-none absolute inset-[26px] rounded-[42px] border-[1.5px] border-dashed" style={{ borderColor: `${sk.rim[1]}73` }} />
          {children}
        </div>
      </div>
    </div>
  );
}

/** A player's round photo: the profile picture, or a cartoon face for a bot. */
function TnAvatar({ p, size, teamColor }: { p: NonNullable<Seat>; size: number; teamColor: string }) {
  const name = p.username.replace("🤖", "").trim();
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-black"
      style={{ width: size, height: size, background: `radial-gradient(circle, #FFFFFF, ${teamColor})`, color: INK, fontSize: size * 0.38 }}
    >
      {p.bot ? (
        <BotFace name={name} size={size} />
      ) : (
        <>
          {(name[0] || "?").toUpperCase()}
          {p.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrl} alt={name} className="absolute inset-0 h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
          )}
        </>
      )}
    </span>
  );
}

/**
 * 🃏 Unlimited tables: a chip per running table + "＋ New table". Four people
 * play at Table 1 while others play at Table 2, 3 … — each phone shows its own.
 */
function TnTablesStrip({ state, children }: { state: TnState; children?: ReactNode }) {
  const shown = state.tables.filter((t) => t.running || t.no === state.table);
  const playing = state.running && state.phase !== "JOINING";
  if (shown.length === 0 && state.table === 0 && !playing) return null;
  return (
    <div className="mt-1 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
      {shown.map((t) => {
        const on = t.no === state.table;
        const dot = !t.running ? "#9E9E9E" : t.phase === "JOINING" ? "#FFC107" : "#3DD68C";
        return (
          <button
            key={t.no}
            type="button"
            onClick={() => state.showTable(t.no)}
            className="flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-extrabold"
            style={{
              background: on ? GOLD_GRAD : GLASS,
              border: `1px solid ${t.mine ? "#FFF3C4" : GLASS_LINE}`,
              color: on ? INK : "#FFFFFF",
            }}
          >
            <span className="mr-[5px] h-[7px] w-[7px] rounded-full" style={{ background: dot }} />
            {t.mine ? "⭐ " : ""}T{t.no} · {!t.running ? "free" : t.phase === "JOINING" ? `${t.seats}/4 · join` : "live"}
          </button>
        );
      })}
      {state.myTable === 0 && (
        <button
          type="button"
          onClick={() => state.showTable(0)}
          className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-extrabold text-white"
          style={{ background: state.table === 0 ? PURPLE : GLASS, border: `1px solid ${GOLD}99` }}
        >
          ＋ New table
        </button>
      )}
      {children}
    </div>
  );
}

/** Small gold pill button used on the board. */
function TnBoardButton({ label, enabled, onClick }: { label: string; enabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className="whitespace-nowrap rounded-full border border-[#FFF3C4] px-3.5 py-1.5 text-xs font-black"
      style={{
        background: enabled ? GOLD_GRAD : "linear-gradient(#6E6A8E, #4E4A6E)",
        color: INK,
        boxShadow: enabled ? `0 0 10px ${GOLD}aa` : "none",
      }}
    >
      {label}
    </button>
  );
}

/** Lobby on the board: a dark glass card with the entry chips and PLAY. */
function TnLobbyBoard({ state }: { state: TnState }) {
  const seatSpots = ["left-1/2 top-2.5 -translate-x-1/2", "left-2.5 top-1/2 -translate-y-1/2", "bottom-2.5 left-1/2 -translate-x-1/2", "right-2.5 top-1/2 -translate-y-1/2"];
  return (
    <TnBoardFrame state={state}>
      {/* the 4 empty seats, faint, so it already looks like the table */}
      {seatSpots.map((pos, i) => (
        <span key={i} className={`absolute h-[34px] w-[34px] rounded-full bg-black/20 ${pos}`} style={{ border: `1.5px solid ${i % 2 === 0 ? TEAM_A : TEAM_B}73` }} />
      ))}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="flex w-[80%] flex-col items-center gap-[7px] rounded-[22px] px-3 py-2.5"
          style={{
            background: "linear-gradient(rgba(42,31,107,.95), rgba(19,15,51,.95)) padding-box, linear-gradient(135deg, #FFF3C4, #F2C94C, #D29B16) border-box",
            border: "1.5px solid transparent",
            boxShadow: `0 10px 28px rgba(124,77,255,.45), 0 0 14px ${GOLD}55`,
          }}
        >
          <div className="flex items-center">
            <span className="text-[13px]" style={{ color: GOLD }}>
              {state.free ? "🆓" : "♛"}
            </span>
            <span className="ml-[5px] text-lg font-black tracking-[1px]" style={whiteGoldText}>
              29 CARD
            </span>
            <span className="ml-1.5 h-[7px] w-[7px] rounded-full" style={{ background: TEAM_A }} />
            <span className="text-[9px] font-bold text-white/80">&nbsp;A&nbsp;</span>
            <span className="text-[8px] font-black" style={{ color: GOLD }}>
              VS
            </span>
            <span className="text-[9px] font-bold text-white/80">&nbsp;B&nbsp;</span>
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: TEAM_B }} />
          </div>
          {state.resultWinTeam >= 0 && (
            <span
              className="max-w-full truncate rounded-full px-2.5 py-0.5 text-[9px] font-bold text-[#FFE08A]"
              style={{ background: "linear-gradient(90deg, rgba(255,213,79,.2), rgba(255,255,255,.13))", border: "1px solid rgba(255,213,79,.4)" }}
            >
              🏆 Team {state.resultWinTeam === 0 ? "A" : "B"} won · A {signed(state.match[0])} · B {signed(state.match[1])}
              {state.resultShare > 0 ? ` · +${state.resultShare.toLocaleString()} each` : ""}
            </span>
          )}
          {state.free ? (
            <span className="text-[10px] font-extrabold text-[#6BF0AE]">FREE TABLE · no coins · play for fun</span>
          ) : (
            [
              [100, 200, 500],
              [1000, 2000, 5000],
            ].map((row) => (
              <div key={row[0]} className="flex w-full gap-[5px]">
                {row.map((a) => {
                  const sel = state.selectedEntry === a;
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => state.setSelectedEntry(a)}
                      className="h-[26px] flex-1 rounded-full text-[11px] font-extrabold"
                      style={{
                        background: sel ? GOLD_GRAD : "linear-gradient(rgba(255,255,255,.1), rgba(255,255,255,.04))",
                        border: `1px solid ${sel ? "#FFF3C4" : GLASS_LINE}`,
                        color: sel ? INK : "rgba(255,255,255,.9)",
                      }}
                    >
                      🪙 {a >= 1000 ? `${a / 1000}K` : a}
                    </button>
                  );
                })}
              </div>
            ))
          )}
          <button
            type="button"
            disabled={state.busy}
            onClick={() => state.start(state.free ? 0 : state.selectedEntry)}
            className={`h-[38px] w-[80%] rounded-full border border-[#FFF3C4] text-sm font-black tracking-[0.5px] ${state.busy ? "" : "tn-open"}`}
            style={{ background: state.busy ? "linear-gradient(#6E6A8E, #4E4A6E)" : GOLD_GRAD, color: INK }}
          >
            {state.free ? "▶︎  PLAY · FREE" : `▶︎  PLAY · ${state.selectedEntry.toLocaleString()} 🪙`}
          </button>
          <span className="text-center text-[8.5px] text-white/50">
            {state.free ? "4 players · bots fill seats · first to +6" : "4 players · bots fill seats · first to +6 · winners share 90%"}
          </span>
        </div>
      </div>
    </TnBoardFrame>
  );
}

// The 4 seats around the board (same layout as the game: me at the bottom,
// the next seat in turn order on my right, partner across).
function TnJoinFelt({ state, onInvite }: { state: TnState; onInvite: (seat: number) => void }) {
  const mySeat = state.mySeat;
  const base = mySeat >= 0 ? mySeat : 0;
  const spot = ["bottom-1.5 left-1/2 -translate-x-1/2", "left-1.5 top-1/2 -translate-y-1/2", "left-1/2 top-1.5 -translate-x-1/2", "right-1.5 top-1/2 -translate-y-1/2"];
  const urgent = state.secondsLeft >= 1 && state.secondsLeft <= 5;
  const myInvite = Object.entries(state.invites).find(([, v]) => v.uid === state.myUid);
  const seated = state.seats.filter(Boolean).length;
  return (
    <TnBoardFrame state={state}>
      {/* centre: title, countdown, entry / pot and what I can do now */}
      <div className="absolute left-1/2 top-1/2 flex max-w-[200px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1">
        <span className="text-[10px] font-extrabold tracking-[4px]" style={{ color: `${GOLD}b3` }}>
          miGlife
        </span>
        <span className="text-lg font-black tracking-[1px]" style={whiteGoldText}>
          29 CARD
        </span>
        <span
          className="rounded-full px-[9px] py-0.5 text-[11px] font-extrabold text-white"
          style={{ background: urgent ? ROSE : "rgba(0,0,0,.3)", border: urgent ? "none" : `1px solid ${GOLD}80` }}
        >
          ⏳ {state.secondsLeft}s
        </span>
        <span className="text-[10px] font-extrabold" style={{ color: state.free ? "#6BF0AE" : "#FFE08A" }}>
          {state.free ? "🆓 FREE · no coins" : `Entry ${state.entry.toLocaleString()} · Pot ${state.pot.toLocaleString()} 🪙`}
        </span>
        {mySeat < 0 && myInvite ? (
          <TnBoardButton label={`🎟 Accept seat ${Number(myInvite[0]) + 1}`} enabled={!state.busy} onClick={() => state.join(Number(myInvite[0]))} />
        ) : mySeat < 0 ? (
          <TnBoardButton label={state.free ? "Sit down · FREE" : `Sit down · ${state.entry.toLocaleString()}`} enabled={!state.busy} onClick={() => state.join()} />
        ) : (
          <span className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[9px] font-extrabold text-[#6BF0AE]" style={{ background: "rgba(61,214,140,.18)", border: "1px solid rgba(61,214,140,.6)" }}>
            ✓ Team {mySeat % 2 === 0 ? "A" : "B"} · {seated}/4 · tap 🎟 to invite
          </span>
        )}
      </div>
      {[0, 1, 2, 3].map((seat) => (
        <div key={seat} className={`absolute ${spot[(base - seat + 4) % 4]}`}>
          <TnJoinSeat state={state} seat={seat} onInvite={onInvite} />
        </div>
      ))}
    </TnBoardFrame>
  );
}

function TnJoinSeat({ state, seat, onInvite }: { state: TnState; seat: number; onInvite: (seat: number) => void }) {
  const mySeat = state.mySeat;
  const p = state.seats[seat];
  const invite = p ? undefined : state.invites[seat];
  const teamColor = seat % 2 === 0 ? TEAM_A : TEAM_B;
  const team = seat % 2 === 0 ? "A" : "B";
  const isMe = mySeat === seat;
  const invitedMe = !!invite && invite.uid === state.myUid;
  const myInvite = !!invite && invite.byUid === state.myUid;
  const canSit = !p && mySeat < 0 && !state.busy && (!invite || invitedMe);
  const canInvite = !p && !invite && mySeat >= 0 && !state.busy;
  const active = canSit || canInvite;
  const label = p
    ? p.username.replace("🤖", "").trim()
    : invitedMe
      ? "YOUR SEAT"
      : myInvite
        ? `✕ ${invite!.username}`
        : invite
          ? `🎟 ${invite.username}`
          : canSit
            ? `SIT · ${team}`
            : canInvite
              ? `INVITE · ${team}`
              : `Team ${team}`;
  return (
    <button
      type="button"
      disabled={!(canSit || canInvite || myInvite)}
      onClick={() => (canSit ? state.join(seat) : canInvite ? onInvite(seat) : myInvite ? state.cancelInvite(seat) : undefined)}
      className="flex w-[84px] flex-col items-center"
    >
      {p ? (
        <span
          className="flex h-[52px] w-[52px] items-center justify-center rounded-full p-[2.5px]"
          style={{ border: `2.5px solid ${isMe ? GOLD : "rgba(255,255,255,.85)"}`, boxShadow: isMe ? `0 0 10px ${GOLD}` : "0 2px 4px rgba(0,0,0,.4)" }}
        >
          <TnAvatar p={p} size={43} teamColor={teamColor} />
        </span>
      ) : invite ? (
        // 🎟 kept for an invited player: their letter, gold dashed ring
        <span
          className={`relative flex h-[52px] w-[52px] items-center justify-center rounded-full border-[2.5px] border-dashed text-base font-black text-white ${invitedMe ? "tn-seat-pulse" : ""}`}
          style={{ borderColor: GOLD, background: `radial-gradient(circle, rgba(255,255,255,.35), ${teamColor}59)`, ["--tc" as string]: GOLD }}
        >
          {(invite.username[0] || "?").toUpperCase()}
          <span className="absolute bottom-0 right-0 text-[11px]">🎟</span>
        </span>
      ) : (
        // empty seat: dashed ring, glowing "+" when I can sit or invite
        <span
          className={`flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-dashed bg-black/25 font-black ${active ? "tn-seat-pulse" : ""}`}
          style={{ borderColor: active ? teamColor : `${teamColor}80`, color: active ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.5)", fontSize: canInvite ? 16 : 20, ["--tc" as string]: teamColor }}
        >
          {canSit ? "+" : canInvite ? "🎟" : "·"}
        </span>
      )}
      <span
        className="mt-[3px] max-w-[70px] truncate rounded-full px-[7px] py-px text-[9px] font-extrabold"
        style={{
          background: isMe || invitedMe ? "linear-gradient(#FFE9A8, #F2C94C)" : p ? "rgba(0,0,0,.45)" : invite ? `${GOLD}40` : `${teamColor}40`,
          color: isMe || invitedMe ? INK : "#FFFFFF",
        }}
      >
        {label}
      </span>
    </button>
  );
}

// The four seats, rotated so I am at the bottom; the current trick in the middle.
function TnFeltTable({ state }: { state: TnState }) {
  const mySeat = state.mySeat;
  const base = mySeat >= 0 ? mySeat : 0;
  // screen position: 0 = bottom, 1 = left, 2 = top, 3 = right. 29 is played
  // ANTICLOCKWISE: the next seat in turn order (seat + 1) sits on my RIGHT.
  const posOf = (seat: number) => (base - seat + 4) % 4;
  const boxRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const h = BOARD_H - 6 - 14;
  const seatXY = (pos: number): [number, number] =>
    pos === 0 ? [w / 2 - 46, h - 76] : pos === 1 ? [4, h / 2 - 38] : pos === 2 ? [w / 2 - 46, 6] : [w - 96, h / 2 - 38];
  const cardXY = (pos: number): [number, number] =>
    pos === 0 ? [w / 2 - 16, h / 2 + 8] : pos === 1 ? [w / 2 - 72, h / 2 - 22] : pos === 2 ? [w / 2 - 16, h / 2 - 54] : [w / 2 + 40, h / 2 - 22];
  // A finished trick's 4 cards stay on the table (winner's card outlined in
  // gold) until the next card is played.
  const showingLast = state.trick.length === 0 && state.lastTrick.length > 0 && (state.phase === "PLAYING" || state.phase === "NEXTDEAL");
  const onTable = showingLast ? state.lastTrick : state.trick;
  const showTrump = ["PLAYING", "DOUBLE", "SINGLE", "NEXTDEAL"].includes(state.phase);
  const shownSuit = state.trumpRevealed ? state.trumpSuit : null;
  const mine = !state.trumpRevealed ? state.myTrump : null;
  const myTeam = mySeat >= 0 ? mySeat % 2 : -1;

  return (
    <TnBoardFrame state={state}>
      <div ref={boxRef} className="absolute inset-0">
        {state.dealNo > 0 && (
          <>
            <TnTeamScore state={state} team={0} mine={myTeam === 0} className="left-3 top-3" />
            <TnTeamScore state={state} team={1} mine={myTeam === 1} className="bottom-3 right-3" />
          </>
        )}
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <span className="text-[15px] font-extrabold tracking-[5px]" style={{ color: `${GOLD}73` }}>
            miGlife
          </span>
          <span className="text-[8px] font-bold tracking-[3px] text-white/30">29 CARD</span>
        </div>
        {w > 0 &&
          [0, 1, 2, 3].map((seat) => {
            if (!state.seats[seat]) return null;
            const [x, y] = seatXY(posOf(seat));
            return (
              <div key={seat} className="absolute w-[92px]" style={{ left: x, top: y }}>
                <SeatBadge state={state} seat={seat} />
              </div>
            );
          })}
        {w > 0 &&
          onTable.map((t) => {
            const [x, y] = cardXY(posOf(t.seat));
            const winner = showingLast && t.seat === state.lastTrickWinner;
            return (
              <span
                key={`${t.seat}${t.card}`}
                className="absolute rounded-[5px]"
                style={{ left: x, top: y, boxShadow: winner ? `0 0 0 2.5px ${GOLD}, 0 0 10px ${GOLD}` : "0 2px 6px rgba(0,0,0,.45)" }}
              >
                <TnCard card={t.card} w={32} />
              </span>
            );
          })}
        {/* Trump card — face-down until revealed; the bidder sees their own suit on it. */}
        {showTrump && (
          <div className="absolute top-3 flex flex-col items-center rounded-[10px] bg-black/25 px-1.5 py-1" style={{ right: "16%", border: `1px solid ${GOLD}80` }}>
            <span className="text-[8px] font-extrabold tracking-[1px]" style={{ color: GOLD }}>
              {state.seventhCard ? "7TH CARD" : "TRUMP"}
            </span>
            <span className="mt-0.5">
              {state.singleSeat >= 0 ? (
                <span className="text-sm font-bold text-white">—</span>
              ) : shownSuit || mine ? (
                <span
                  className={`flex h-[42px] w-[30px] items-center justify-center rounded-[5px] bg-white text-2xl leading-none ${
                    (shownSuit || mine) === "♥" || (shownSuit || mine) === "♦" ? "text-[#D32F2F]" : "text-black"
                  }`}
                  style={{ border: mine ? `2px solid ${GOLD}` : "1px solid #CFC6E2" }}
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
    </TnBoardFrame>
  );
}

/** Match score of one team (first to +6), shown in a corner of the board. */
function TnTeamScore({ state, team, mine, className }: { state: TnState; team: number; mine: boolean; className: string }) {
  const v = state.match[team] || 0;
  const teamColor = team === 0 ? TEAM_A : TEAM_B;
  return (
    <div
      className={`absolute flex flex-col items-center rounded-[14px] px-[9px] py-1 ${className}`}
      style={{
        background: `linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.35)) padding-box, linear-gradient(${teamColor}, ${GOLD}99) border-box`,
        border: "1.5px solid transparent",
        boxShadow: `0 0 10px ${teamColor}66`,
      }}
    >
      <span className="flex items-center text-[8px] font-extrabold tracking-[0.8px] text-white/80">
        <span className="mr-1 h-[7px] w-[7px] rounded-full" style={{ background: teamColor }} />
        TEAM {team === 0 ? "A" : "B"}
        {mine ? " · YOU" : ""}
      </span>
      <span className="flex items-end leading-none">
        <span className="text-lg font-black" style={goldText}>
          {signed(v)}
        </span>
        <span className="mb-0.5 text-[9px] font-bold text-white/50">&nbsp;/6</span>
      </span>
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
  // the two players in the current duel (falls back to bidder vs turn on old data)
  const inDuel = state.bidH >= 0 ? seat === state.bidH || seat === state.bidC : seat === state.turn;
  const challenger = bidding && inDuel && seat !== state.bidder;
  // 🏷️ bid badges: during bidding both players of the duel show their number
  // (holder gold ★, challenger purple, "…" = still thinking)
  const badge: [string, string] | null = passedHere
    ? ["PASS", "#6E6A8E"]
    : bidding && holder
      ? [`★ ${state.bid}`, GOLD_DARK]
      : challenger
        ? [seatBid > 0 ? `${seatBid}` : "…", PURPLE]
        : bidding && seatBid > 0
          ? [`${seatBid}`, "#6E6A8E"]
          : holder
            ? [`${state.bid}`, PURPLE]
            : null;
  const duel = bidding && (holder || challenger);
  return (
    <div className={`flex flex-col items-center ${out ? "opacity-40" : ""}`}>
      <span className="relative flex h-[58px] w-[58px] items-center justify-center">
        {isTurn && <span className="tn-turn-halo absolute inset-0 rounded-full" style={{ background: `${GOLD}59` }} />}
        <span
          className="relative flex h-12 w-12 items-center justify-center rounded-full p-0.5"
          style={{
            background: `radial-gradient(circle, #FFFFFF, ${teamColor})`,
            border: `${isTurn ? 2.5 : 2}px solid ${isTurn || isMe ? GOLD : "rgba(255,255,255,.8)"}`,
            boxShadow: isTurn || isMe ? `0 0 8px ${GOLD}` : "0 1px 3px rgba(0,0,0,.4)",
          }}
        >
          <TnAvatar p={p} size={40} teamColor={teamColor} />
        </span>
        {p.auto && !p.bot && <span className="absolute bottom-1 right-1 text-[10px]">🤖</span>}
        {/* dealer button */}
        {seat === state.dealer && (
          <span
            className="absolute right-1 top-1 flex h-[15px] w-[15px] items-center justify-center rounded-full border border-white text-[8px] font-black"
            style={{ background: "radial-gradient(circle, #FFF3C4, #F2C94C, #D29B16)", color: INK }}
          >
            D
          </span>
        )}
      </span>
      <span
        className="flex max-w-full items-center rounded-full px-1.5 py-px"
        style={{ background: isMe ? "linear-gradient(#FFE9A8, #F2C94C)" : "rgba(0,0,0,.45)", color: isMe ? INK : "#FFFFFF" }}
      >
        <span className="max-w-[52px] truncate text-[9px] font-extrabold">{name}</span>
        {badge && (
          <span
            className={`ml-[3px] rounded-full font-black text-white ${duel ? "border border-white/80 px-[5px] text-[10px]" : "px-1 text-[8px]"}`}
            style={{ background: badge[1] }}
          >
            {badge[0]}
          </span>
        )}
        {seat === state.singleSeat && (
          <span className="ml-[3px] text-[8px] font-black" style={{ color: isMe ? INK : GOLD }}>
            1H
          </span>
        )}
      </span>
    </div>
  );
}

function TnStyleDialog({ inv, onClose }: { inv: Inventory; onClose: () => void }) {
  return (
    <StyleShopDialog
      title="🎨 29 Card Style"
      subtitle="1 of each is free · the rest from 50,000 coins · bought styles are saved to your account"
      theme={{ bg: "linear-gradient(#2A1F6B, #130F33)", border: GOLD, title: GOLD, sub: "rgba(255,255,255,.5)", accent: GOLD_GRAD, accentInk: INK }}
      tabs={[
        {
          label: "Board",
          kind: "board",
          items: TN_BOARD_SKINS,
          noun: "board",
          perRow: 2,
          preview: (b: TnBoardSkin) => (
            <div className="aspect-[1.5] w-full rounded-xl p-[3px]" style={{ background: `conic-gradient(${[...b.rim, b.rim[0]].join(", ")})` }}>
              <div
                className="flex h-full w-full items-center justify-center rounded-[10px] text-base font-black"
                style={{ background: `radial-gradient(circle, ${b.felt.join(", ")})`, color: `${b.pattern}80` }}
              >
                29
              </div>
            </div>
          ),
        },
        {
          label: "Cards",
          kind: "card",
          items: TN_CARD_SKINS,
          noun: "card style",
          perRow: 3,
          preview: (c: TnCardSkin) => (
            <span className="flex justify-center gap-[3px] py-2">
              <TnCardBack w={22} skin={c} />
              <TnCard card="J♠" w={22} skin={c} />
              <TnCard card="9♥" w={22} skin={c} />
            </span>
          ),
        },
      ]}
      inv={inv}
      buyFn="buyTwentyNineItem"
      setFn="setTwentyNineStyle"
      opPrefix="tn"
      onClose={onClose}
    />
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
          {/* 🤖 or fill the seat with a bot right now */}
          <button
            type="button"
            disabled={state.busy}
            onClick={() => {
              state.addBot(seat);
              onClose();
            }}
            className="rounded-lg px-3 py-2 text-sm font-extrabold text-[#6A4BD8] disabled:opacity-40"
          >
            🤖 Add bot
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
  if (state.phase === "BIDDING" && state.bidH >= 0 && state.bidC >= 0) {
    // ⚔ who is bidding against whom right now (holder first)
    const bidOf = (s: number) => ((state.seatBids[s] || 0) > 0 ? `${state.seatBids[s]}` : "…");
    chips.push([`⚔ ${nameOf(state.bidH)} ${bidOf(state.bidH)}  vs  ${nameOf(state.bidC)} ${bidOf(state.bidC)}`, "strong"]);
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
    <div className="flex shrink-0 gap-1.5">
      {chips.map(([t, kind], i) => {
        const tint = kind === "a" ? TEAM_A : kind === "b" ? TEAM_B : null;
        return (
          <span
            key={i}
            className="shrink-0 whitespace-nowrap rounded-full px-2 py-[3px] text-[10px] font-extrabold text-white"
            style={{
              background:
                kind === "strong"
                  ? `linear-gradient(to right, ${boardNow(state.inv.active.board).felt[1]}, #6A4BD8)`
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

const goldBtn = "rounded-[10px] border border-[#FFF3C4] bg-gradient-to-b from-[#FFE9A8] via-[#F2C94C] to-[#D29B16] font-black text-[#22204A]";
const roseBtn = "rounded-[10px] bg-gradient-to-b from-[#F07A89] to-[#E5586A] font-black text-white";
const goldLabel = "mb-1 block text-[10px] font-extrabold tracking-[1.5px]";

function TnActions({ state }: { state: TnState }) {
  const mySeat = state.mySeat;

  if (state.phase === "NEXTDEAL" && state.lastDeal.annulled) {
    // 🔄 cancelled deal (four Jacks, no trump with the opponents, …)
    return (
      <p
        className="rounded-xl px-2.5 py-[7px] text-center text-xs font-bold"
        style={{ background: `${GOLD}26`, border: `1px solid ${GOLD}99`, color: GOLD }}
      >
        🔄 Deal {state.dealNo} cancelled — {state.lastDeal.reason} · new deal in {state.secondsLeft}s
      </p>
    );
  }

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
    // the holder may HOLD (say the same number); the challenger must go higher
    const holder = mySeat === state.bidH;
    const canHold = holder && state.bid > 0;
    const min = canHold ? state.bid + 1 : Math.max(16, state.bid + 1);
    const vs = state.seats[holder ? state.bidC : state.bidH]?.username.replace("🤖", "").trim();
    return (
      <div>
        <span className={goldLabel} style={goldText}>
          {canHold ? `✦ HOLD ${state.bid} or go higher · vs ${vs}` : holder ? `✦ YOU OPEN · vs ${vs}` : vs ? `✦ BEAT ${state.bid} · vs ${vs}` : "✦ YOUR BID"}
        </span>
        <div className="flex gap-[5px] overflow-x-auto pb-0.5 [scrollbar-width:none]">
          <button type="button" disabled={state.busy} onClick={() => state.act("pass")} className={`${roseBtn} shrink-0 px-3 py-2 text-xs disabled:opacity-50`}>
            PASS
          </button>
          {canHold && (
            <button
              type="button"
              disabled={state.busy}
              onClick={() => state.act("bid", { bid: state.bid })}
              className="shrink-0 rounded-[10px] border-[1.5px] border-[#F2C94C] bg-gradient-to-b from-[#8E6CFF] to-[#6A4BD8] px-2.5 py-2 text-xs font-black text-white shadow-[0_0_8px_rgba(242,201,76,.6)] disabled:opacity-50"
            >
              ✋ HOLD {state.bid}
            </button>
          )}
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

function TnCard({ card, w, skin = cardNow() }: { card: string; w: number; skin?: TnCardSkin }) {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const ink = suit === "♥" || suit === "♦" ? skin.red : skin.black;
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
          `linear-gradient(115deg, rgba(255,255,255,0) 15%, rgba(255,255,255,.55) 40%, rgba(255,255,255,0) 65%) padding-box, linear-gradient(135deg, ${skin.face.join(", ")}) padding-box, linear-gradient(135deg, ${skin.edge.join(", ")}) border-box`,
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
function TnCardBack({ w, skin = cardNow() }: { w: number; skin?: TnCardSkin }) {
  const line = skin.backLine === "#FFFFFF" ? "rgba(255,255,255,.14)" : `${skin.backLine}24`;
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
            `repeating-linear-gradient(45deg, ${line} 0 1px, transparent 1px 6px), repeating-linear-gradient(-45deg, ${line} 0 1px, transparent 1px 6px), radial-gradient(circle, ${skin.back[0]}, ${skin.back[1]} 60%, ${skin.back[2]})`,
        }}
      >
        <span
          className="flex items-center justify-center rounded-full border border-white/80 font-black text-[#22204A]"
          style={{ width: w * 0.55, height: w * 0.55, fontSize: w * 0.24, background: `radial-gradient(circle, ${skin.medal.join(", ")})` }}
        >
          29
        </span>
      </span>
    </span>
  );
}
