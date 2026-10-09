"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { collection, doc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { gameInvitedMe, setGameHideMessages, setViewedTable } from "../../lib/gameTables";
import { BotFace } from "./BotFace";
import { StyleShopDialog, useInventory, type Inventory, type ShopItem } from "./StyleShop";
import { isClassicNow } from "../../lib/uiStyle";
import { readRememberedAmount, rememberAmount } from "../../lib/amountMemory";

// 🎲 Ludo — dice rolls, moves, cuts, coins and the winner are all decided by
// the Cloud Functions (startLudo / joinLudo / ludoAction / tickLudo /
// ludoAddBot / ludoInvite). The web only draws the board and sends taps,
// same as LudoGame.kt. Unlimited tables per room: table 1 =
// room_game/{room}, the others carry ludoRoom = {room}.
//
// Token position: -1 yard · 0..50 shared track (from the player's own start)
// · 51..55 home column · 56 home. Track square = (color × 13 + pos) mod 52.
// Colors clockwise from top-left: 0 Red, 1 Green, 2 Yellow, 3 Blue.

export const LUDO_ROOM = "🎲 Ludo Bot Official";
/** 🆓 Same Ludo, no coins: entry 0, no pot, no prize. */
export const LUDO_FREE_ROOM = "🎲 Ludo Bot Free";
const FEE_OPTIONS = [100, 200, 500, 1000, 2000];
const TOKEN_MODES = [1, 2, 3, 4];
const TABLE_SIZES = [2, 4];
const HOME = 56;

// Ludo King style: bright flat red / green / yellow / blue.
const COLORS = ["#FF3B6B", "#2EE59D", "#FFD43B", "#3BA4FF"];
const COLORS_DARK = ["#B71C1C", "#1B5E20", "#F9A825", "#0D47A1"];
const COLORS_LIGHT = ["#FF8A80", "#A5D6A7", "#FFF59D", "#90CAF9"];
const BRASS = "#C98B12";
const IVORY = "#2B3552";
const NEON = "linear-gradient(90deg, #00C6FF, #7C4DFF, #FF2D95)";

const startCall = httpsCallable<Record<string, unknown>, { table?: number }>(functions, "startLudo");
const joinCall = httpsCallable<Record<string, unknown>, { table?: number }>(functions, "joinLudo");
const actionCall = httpsCallable(functions, "ludoAction");
const tickCall = httpsCallable(functions, "tickLudo");
const addBotCall = httpsCallable(functions, "ludoAddBot");
const inviteCall = httpsCallable(functions, "ludoInvite");

// ---------------- 🎨 Styles: board, pieces, dice ----------------
// One of each is free, the rest are bought with coins. Same ids and prices
// as LUDO_SHOP in index.js. Board + pieces are what I see, my dice is what
// everyone at my table sees when I roll.
type BoardSkin = ShopItem & {
  bg: string[];
  blobs: boolean;
  tile: string;
  edge: string;
  yardAlpha: number;
  laneAlpha: number;
  nest: string;
  shine: boolean;
  star: string;
  frame: string[];
};
const BOARD_SKINS: BoardSkin[] = [
  { id: "glass", name: "Glass", price: 0, bg: ["#2B1D6B", "#5B2A86", "#1F4E8C"], blobs: true, tile: "rgba(255,255,255,.18)", edge: "rgba(255,255,255,.6)", yardAlpha: 0.45, laneAlpha: 0.6, nest: "rgba(255,255,255,.2)", shine: true, star: "#FFFFFF", frame: ["#6A5AE0", "#B34BD8", "#3FA9F5"] },
  { id: "classic", name: "Classic", price: 20000, bg: ["#FFFFFF", "#F2F2F2"], blobs: false, tile: "#FFFFFF", edge: "#A0A0A0", yardAlpha: 1, laneAlpha: 1, nest: "#FFFFFF", shine: false, star: "#757575", frame: ["#C98B12", "#F2B531", "#C98B12"] },
  { id: "wood", name: "Wood", price: 25000, bg: ["#9A6634", "#5D3A1A"], blobs: false, tile: "#F5DEB3", edge: "#6D4C2A", yardAlpha: 0.9, laneAlpha: 0.9, nest: "#FFF3DC", shine: false, star: "#8D5A2B", frame: ["#4E2C10", "#8D5A2B", "#4E2C10"] },
  { id: "night", name: "Neon Night", price: 30000, bg: ["#05060F", "#0B1030"], blobs: false, tile: "rgba(255,255,255,.08)", edge: "rgba(0,229,255,.55)", yardAlpha: 0.3, laneAlpha: 0.5, nest: "rgba(255,255,255,.12)", shine: true, star: "#00E5FF", frame: ["#00E5FF", "#7C4DFF", "#FF2D95"] },
];
const TOKEN_SKINS: ShopItem[] = [
  { id: "coin", name: "Coin", price: 0 },
  { id: "pin", name: "Pin", price: 20000 },
  { id: "ball", name: "Ball", price: 25000 },
];
type DiceSkin = ShopItem & { face: string[]; rim: string; pip: string; one: string; glow: string; sparkle?: boolean };
const DICE_SKINS: DiceSkin[] = [
  { id: "neon", name: "Neon", price: 0, face: ["#2A2350", "#120E2A"], rim: "#00E5FF", pip: "#00E5FF", one: "#FF2D95", glow: "#00E5FF" },
  { id: "classic", name: "Classic", price: 20000, face: ["#FFFFFF", "#E6E6EC"], rim: "#BDBDBD", pip: "#222222", one: "#E53935", glow: "#9E9E9E" },
  { id: "gold", name: "Gold", price: 25000, face: ["#FFE57F", "#FFB300", "#B8860B"], rim: "#FFF3C4", pip: "#5D3A00", one: "#8B0000", glow: "#FFC107" },
  { id: "ruby", name: "Ruby", price: 30000, face: ["#FF5A7A", "#C2185B", "#6A0F2E"], rim: "#FFC1D0", pip: "#FFFFFF", one: "#FFD54F", glow: "#FF2D55" },
  { id: "emerald", name: "Emerald", price: 30000, face: ["#6BFFB8", "#0F9D58", "#0B4F2E"], rim: "#C8FFE4", pip: "#FFE082", one: "#FFFFFF", glow: "#00E676" },
  { id: "ice", name: "Ice", price: 40000, face: ["#E3F7FF", "#8FD8FF", "#3A8DDE"], rim: "#FFFFFF", pip: "#0D47A1", one: "#00B0FF", glow: "#80D8FF" },
  { id: "galaxy", name: "Galaxy", price: 50000, face: ["#3A1C71", "#1B0B3A", "#0A0420"], rim: "#B388FF", pip: "#FF80F0", one: "#00E5FF", glow: "#B388FF", sparkle: true },
  { id: "fire", name: "Fire", price: 60000, face: ["#FFD54F", "#FF6D00", "#B71C1C"], rim: "#FFF59D", pip: "#FFFFFF", one: "#FFEB3B", glow: "#FF6D00", sparkle: true },
];
const LUDO_KINDS = [
  { kind: "board", ownedField: "ownedBoards", free: "glass" },
  { kind: "token", ownedField: "ownedTokens", free: "coin" },
  { kind: "dice", ownedField: "ownedDice", free: "neon" },
];
const boardSkinOf = (id: string | undefined) => BOARD_SKINS.find((s) => s.id === id) || BOARD_SKINS[0];
const diceSkinOf = (id: string | undefined) => DICE_SKINS.find((s) => s.id === id) || DICE_SKINS[0];
// 📟 Classic app style: everyone sees the plain Classic board and dice and the
// coin pieces, whatever they bought (their own style comes back in Modern).
// The style picker's previews ("preview") always show the real style.
const boardNow = (state: LudoState) =>
  isClassicNow() && !(state as unknown as { preview?: boolean }).preview ? "classic" : state.inv.active.board;
const diceNow = (id: string | undefined) => (isClassicNow() ? "classic" : id);

// ---------------- Board geometry ----------------
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

/** A point in cell units [row, col] after [turns] counter-clockwise quarter turns of the board. */
function rot(r: number, c: number, turns: number): [number, number] {
  let rr = r;
  let cc = c;
  for (let k = 0; k < ((turns % 4) + 4) % 4; k++) {
    const nr = 15 - cc;
    cc = rr;
    rr = nr;
  }
  return [rr, cc];
}

/** Top-left cell of a yard (its 6×6 block) after the turn. */
function yardShown(color: number, turns: number): [number, number] {
  const [r0, c0] = YARD_ORIGIN[Math.min(3, Math.max(0, color))];
  const [r, c] = rot(r0 + 3, c0 + 3, turns);
  return [Math.trunc(r - 3), Math.trunc(c - 3)];
}

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

// ---------------- State ----------------
type Player = {
  uid: string;
  username: string;
  color: number;
  tokens: number[];
  out: boolean;
  invested: number;
  auto: boolean;
  photoUrl: string;
  /** team game: all tokens home, waiting for the partner */
  done: boolean;
  /** this player's dice style */
  dice: string;
  isBot: boolean;
};

/** One table of the room (for the table strip). */
type TableInfo = {
  no: number;
  running: boolean;
  phase: string;
  seats: number;
  maxPlayers: number;
  fee: number;
  tokens: number;
  team: boolean;
  phaseEndsAt: number;
  mine: boolean;
  invitedMe: boolean;
  round: number;
};

export type LudoState = {
  roomId: string;
  isFree: boolean;
  table: number;
  tables: TableInfo[];
  myTable: number;
  running: boolean;
  phase: string;
  round: number;
  fee: number;
  tokenCount: number;
  maxPlayers: number;
  team: boolean;
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
  /** What each token is DRAWN at ("uid:token" → pos) — walks one square at a time. */
  shown: Record<string, number>;
  myUid: string;
  selectedFee: number;
  selectedTokens: number;
  selectedPlayers: number;
  selectedTeam: boolean;
  setSetup: (p: Partial<{ fee: number; tokens: number; players: number; team: boolean }>) => void;
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
  hideMessages: boolean;
  setHideMessages: (on: boolean) => void;
  inv: Inventory;
  showTable: (table: number) => void;
  start: (fee?: number, tokens?: number) => void;
  join: (table?: number) => void;
  addBot: () => void;
  act: (action: string, token?: number, on?: boolean) => void;
  invite: (username: string) => Promise<boolean>;
};

function opId(kind: string): string {
  return `ludo_${kind}_` + crypto.randomUUID().replace(/-/g, "");
}

function readPref(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(`migwith.ludo.${key}`);
    return v === null ? def : v === "1";
  } catch {
    return def;
  }
}
function writePref(key: string, on: boolean) {
  try {
    localStorage.setItem(`migwith.ludo.${key}`, on ? "1" : "0");
  } catch {}
}

// Short beep (and a tiny buzz on phones that can).
let audioCtx: AudioContext | null = null;
function beep(long: boolean) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = long ? 660 : 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (long ? 0.35 : 0.16));
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (long ? 0.36 : 0.17));
  } catch {}
}
function vibrate(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

const keyOf = (uid: string, token: number) => `${uid}:${token}`;

function parseGame(d: Record<string, any> | undefined) {
  const tokenCount = TOKEN_MODES.includes(Number(d?.tokenCount)) ? Number(d?.tokenCount) : 4;
  const maxPlayers = TABLE_SIZES.includes(Number(d?.maxPlayers)) ? Number(d?.maxPlayers) : 4;
  const players: Player[] = (Array.isArray(d?.players) ? d!.players : [])
    .filter((m: any) => m && m.uid)
    .map((m: any) => {
      const t = Array.isArray(m.tokens) ? m.tokens.map((x: unknown) => Number(x ?? -1)) : [];
      return {
        uid: String(m.uid),
        username: String(m.username || ""),
        color: typeof m.color === "number" ? m.color : -1,
        tokens: t.length === tokenCount ? t : Array.from({ length: tokenCount }, () => -1),
        out: m.out === true,
        invested: Number(m.invested || 0),
        auto: m.auto === true,
        photoUrl: String(m.photoUrl || ""),
        done: m.done === true,
        dice: String(m.dice || "neon"),
        isBot: String(m.uid).startsWith("bot"),
      };
    });
  return {
    running: d?.gameRunning === true,
    phase: String(d?.phase || "IDLE"),
    phaseEndsAt: Number(d?.phaseEndsAt || 0),
    round: Number(d?.roundNumber || 0),
    fee: Number(d?.fee ?? 200),
    tokenCount,
    maxPlayers,
    team: d?.team === true,
    pot: Number(d?.pot || 0),
    players,
    turnIndex: Number(d?.turnIndex ?? -1),
    dice: Number(d?.dice || 0),
    diceSeat: Number(d?.diceSeat ?? -1),
    rollNo: Number(d?.rollNo || 0),
    awaitingMove: d?.awaitingMove === true,
    legal: Array.isArray(d?.legal) ? d!.legal.map(Number) : [],
    lastWinners: Array.isArray(d?.lastWinners) ? d!.lastWinners.map(String) : [],
    lastPrize: Number(d?.lastPrize || 0),
  };
}

// roomId = the official or 🆓 free Ludo room, or null in every other room.
export function useLudo(roomId: string | null, uid: string | undefined, note: (t: string) => void): LudoState | null {
  const enabled = !!roomId;
  const [first, setFirst] = useState<Record<string, any> | null>(null);
  const [rest, setRest] = useState<Record<number, Record<string, any>>>({});
  const [table, setTable] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  // the entry fee is remembered until the tab is closed / logout (like the app)
  const [setup, setSetupRaw] = useState(() => ({ fee: readRememberedAmount("ludo_fee") ?? 200, tokens: 4, players: 4, team: false }));
  const [soundOn, setSoundOnRaw] = useState(true);
  const [hideMessages, setHideRaw] = useState(false);
  const [shown, setShown] = useState<Record<string, number>>({});
  const autoPicked = useRef(false);
  const inviteJump = useRef("");
  const lastTick = useRef<Record<number, number>>({});
  const lastBeep = useRef(-1);
  const noteRef = useRef(note);
  noteRef.current = note;
  const inv = useInventory("ludo_inventory", enabled ? uid : undefined, LUDO_KINDS);

  useEffect(() => {
    setFirst(null);
    setRest({});
    setTable(0);
    autoPicked.current = false;
  }, [roomId]);

  useEffect(() => {
    if (!enabled) return;
    setSoundOnRaw(readPref("sound", true));
    const h = readPref("hideMessages", false);
    setHideRaw(h);
    setGameHideMessages("ludo", h);
    return () => setGameHideMessages("ludo", false);
  }, [enabled]);

  // Every table of this room: one doc listener + one query listener.
  useEffect(() => {
    if (!roomId || !uid) return;
    const a = onSnapshot(
      doc(db, "room_game", roomId),
      (snap) => setFirst(snap.exists() ? snap.data() : null),
      () => {}
    );
    const b = onSnapshot(
      query(collection(db, "room_game"), where("ludoRoom", "==", roomId)),
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
          const running = d.gameRunning === true;
          const players = (Array.isArray(d.players) ? d.players : []).filter((m: any) => m && typeof m === "object");
          return {
            no: Number(k),
            running,
            phase: String(d.phase || "IDLE"),
            seats: players.length,
            maxPlayers: TABLE_SIZES.includes(Number(d.maxPlayers)) ? Number(d.maxPlayers) : 4,
            fee: Number(d.fee ?? 200),
            tokens: Number(d.tokenCount || 4),
            team: d.team === true,
            phaseEndsAt: Number(d.phaseEndsAt || 0),
            mine: running && !!uid && players.some((m: any) => m.uid === uid && m.out !== true),
            invitedMe: gameInvitedMe(d, uid, running),
            round: Number(d.roundNumber || 0),
          };
        })
        .sort((a, b) => a.no - b.no),
    [docs, uid]
  );
  const myTable = tables.find((t) => t.mine)?.no || 0;

  // Playing somewhere → that table stays on screen; just walked in → a table
  // taking seats; invited → that table (once per invite).
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
    setViewedTable("ludo", table);
    return () => setViewedTable("ludo", 0);
  }, [enabled, table]);

  const g = parseGame(table > 0 ? docs[table] : undefined);
  const gRef = useRef(g);
  gRef.current = g;

  // New game → tokens start from scratch on screen too.
  useEffect(() => setShown({}), [table, g.round]);

  // Tokens walk square by square toward where the server says they are. A
  // cut token (position went DOWN) jumps straight back to its yard.
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      const hidden = document.visibilityState !== "visible";
      setShown((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const p of gRef.current.players) {
          p.tokens.forEach((target, i) => {
            const key = keyOf(p.uid, i);
            const cur = next[key];
            let v = cur;
            if (cur === undefined || target < cur || p.out || hidden) v = target;
            else if (cur < 0 && target >= 0) v = 0;
            else if (cur < target) v = cur + 1;
            if (v !== cur) {
              next[key] = v;
              changed = true;
            }
          });
        }
        return changed ? next : prev;
      });
    }, 90);
    return () => clearInterval(t);
  }, [enabled]);

  // Countdown, and move every running table on when its timer ends (the
  // server does it once). A watchdog covers an empty room.
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (document.visibilityState !== "visible") return;
      for (const tb of tables) {
        if (!tb.running || tb.phaseEndsAt <= 0 || n < tb.phaseEndsAt + 350) continue;
        if (n - (lastTick.current[tb.no] || 0) < 1500) continue;
        lastTick.current[tb.no] = n;
        tickCall({ roomId, table: tb.no }).catch(() => {});
      }
    }, 300);
    return () => clearInterval(t);
  }, [enabled, roomId, tables]);

  const left = g.phaseEndsAt - now;
  const secondsLeft = g.running && left > 0 ? Math.ceil(left / 1000) : 0;
  const myTurnNow = g.phase === "PLAYING" && g.players[g.turnIndex]?.uid === uid;

  // "Your turn" — double buzz + beep whenever it's my roll.
  useEffect(() => {
    if (enabled && myTurnNow && !g.awaitingMove && soundOn) {
      vibrate([0, 120, 90, 120]);
      beep(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, g.round, g.turnIndex, g.rollNo, g.phase, g.awaitingMove]);

  // Beeps on the last 3 seconds of the join window and of MY turn.
  useEffect(() => {
    if (!enabled) return;
    const relevant = g.running && (g.phase === "JOINING" || myTurnNow);
    if (!relevant || secondsLeft > 3 || secondsLeft <= 0) {
      lastBeep.current = -1;
      return;
    }
    if (secondsLeft !== lastBeep.current && soundOn) {
      lastBeep.current = secondsLeft;
      beep(secondsLeft === 1);
    }
  }, [enabled, g.running, g.phase, myTurnNow, secondsLeft, soundOn]);

  if (!roomId) return null;
  const isFree = roomId === LUDO_FREE_ROOM;

  const run = (p: Promise<unknown>) => {
    setBusy(true);
    p.then((r: any) => {
      const t = Number(r?.data?.table || 0);
      if (t > 0) setTable(t);
    })
      .catch((err: any) => noteRef.current(`Ludo Bot: ${err?.message || "Something went wrong. Try again."}`))
      .finally(() => setBusy(false));
  };

  return {
    roomId,
    isFree,
    table,
    tables,
    myTable,
    ...g,
    secondsLeft,
    busy,
    shown,
    myUid: uid || "",
    selectedFee: setup.fee,
    selectedTokens: setup.tokens,
    selectedPlayers: setup.players,
    selectedTeam: setup.team,
    setSetup: (p) => {
      if (typeof p.fee === "number") rememberAmount("ludo_fee", p.fee);
      setSetupRaw((s) => ({ ...s, ...p }));
    },
    soundOn,
    setSoundOn: (on) => (setSoundOnRaw(on), writePref("sound", on)),
    hideMessages,
    setHideMessages: (on) => (setHideRaw(on), writePref("hideMessages", on), setGameHideMessages("ludo", on)),
    inv,
    showTable: (t: number) => {
      if (myTable > 0 && t !== myTable) {
        noteRef.current(`Ludo Bot: Finish your game at Table ${myTable} first.`);
        return;
      }
      setTable(t);
    },
    start: (fee?: number, tokens?: number) => {
      if (busy) return;
      // The table on screen if it's free, else the server opens the next free one.
      run(
        startCall({
          roomId,
          table: g.running ? 0 : table,
          fee: isFree ? 0 : (fee ?? setup.fee),
          tokens: tokens ?? setup.tokens,
          players: setup.players,
          team: setup.players === 4 && setup.team,
          operationId: opId("start"),
        })
      );
    },
    // table = 0 → the table on screen if it's taking seats, else the first open one.
    join: (t = 0) => {
      if (busy) return;
      const pick = t > 0 ? t : g.running && g.phase === "JOINING" ? table : 0;
      run(joinCall({ roomId, table: pick, operationId: opId("join") }));
    },
    addBot: () => {
      if (!busy) run(addBotCall({ roomId, table, roundNumber: g.round, operationId: opId("bot") }));
    },
    act: (action: string, token = -1, on?: boolean) => {
      if (busy) return;
      run(actionCall({ roomId, table, action, roundNumber: g.round, token, ...(on === undefined ? {} : { on }) }));
    },
    invite: async (username: string) => {
      try {
        await inviteCall({ roomId, table, toUsername: username });
        return true;
      } catch (err: any) {
        noteRef.current(`Ludo Bot: ${err?.message || "Could not invite."}`);
        return false;
      }
    },
  };
}

// Chat commands in the Ludo rooms. True = handled (not posted as chat).
export function ludoHandleCommand(state: LudoState, clean: string, note: (t: string) => void): boolean {
  const lower = clean.trim().toLowerCase();
  if (lower === "!start") {
    state.start();
    return true;
  }
  if (lower.startsWith("!start ")) {
    // !start [entry] [1|2|3|4] — e.g. "!start 500 2" = 500 coins, 2 tokens each
    const parts = lower.slice(7).trim().split(/\s+/);
    if (state.isFree) {
      // free room: "!start 2" = 2 tokens each (no entry fee)
      const n = Number(parts[parts.length - 1]);
      if (!TOKEN_MODES.includes(n)) note("Ludo Bot: Free room — choose tokens: !start 1, 2, 3 or 4");
      else state.start(0, n);
      return true;
    }
    const amount = Number(parts[0]);
    const tokens = parts.length > 1 ? Number(parts[1]) : undefined;
    if (!Number.isInteger(amount) || amount < 100 || amount > 50000) note("Ludo Bot: Custom entry must be 100 – 50000. Example: !start 500 2");
    else if (tokens !== undefined && !TOKEN_MODES.includes(tokens)) note("Ludo Bot: Tokens must be 1, 2, 3 or 4. Example: !start 500 2");
    else state.start(amount, tokens);
    return true;
  }
  if (lower === "!j" || lower === "!join") {
    state.join();
    return true;
  }
  if (lower.startsWith("!j ") || lower.startsWith("!join ")) {
    // !j 3 = sit at table 3
    const n = Number(lower.slice(lower.indexOf(" ") + 1).trim().replace(/^t/, ""));
    if (!Number.isInteger(n) || n < 1) note("Ludo Bot: Pick a table. Example: !j 2");
    else state.join(n);
    return true;
  }
  if (lower === "!tables" || lower === "!t") {
    const running = state.tables.filter((t) => t.running);
    note(
      running.length === 0
        ? "Ludo Bot: No tables running. !start opens one."
        : "Ludo Bot: " + running.map((t) => `T${t.no} ` + (t.phase === "JOINING" ? `${t.seats}/${t.maxPlayers} seats (!j ${t.no})` : "playing")).join(" · ")
    );
    return true;
  }
  if (lower === "!roll" || lower === "!r") {
    state.act("roll");
    return true;
  }
  if (lower.startsWith("!m ") || lower.startsWith("!move ")) {
    const n = Number(lower.slice(lower.indexOf(" ") + 1).trim());
    if (!Number.isInteger(n) || n < 1 || n > state.tokenCount) note(`Ludo Bot: Pick a token 1–${state.tokenCount}. Example: !m 1`);
    else state.act("move", n - 1);
    return true;
  }
  if (lower === "!leave") {
    state.act("leave");
    return true;
  }
  if (lower === "!auto" || lower === "!auto on" || lower === "!auto off") {
    const me = state.players.find((p) => p.uid === state.myUid);
    if (!me) {
      note("Ludo Bot: You're not in this game.");
      return true;
    }
    state.act("auto", -1, lower === "!auto on" ? true : lower === "!auto off" ? false : !me.auto);
    return true;
  }
  if (lower === "!help") {
    note(
      "Ludo Bot: !start [entry] [1|2|4 tokens] · !j sit (!j 2 = table 2) · !tables · !roll (!r) · !m 1-4 move a token · !auto Auto Play on/off · !leave · 6 brings a token out · 6 / cut / home = roll again · ⭐ squares are safe"
    );
    return true;
  }
  return false;
}

/** 🔄 Everyone sees their OWN yard at the bottom-left: quarter turns of the board. */
function viewTurns(state: LudoState, mySeat: number): number {
  if (mySeat < 0) return 0;
  const me = state.players[mySeat];
  if (!me) return 0;
  const color = me.color >= 0 && me.color <= 3 ? me.color : state.maxPlayers === 2 ? (mySeat === 0 ? 0 : 2) : Math.min(3, Math.max(0, mySeat));
  return (color + 1) % 4;
}

// ---------------- Drawing: dice, board, pieces ----------------
const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.22], [0.75, 0.22], [0.25, 0.5], [0.75, 0.5], [0.25, 0.78], [0.75, 0.78]],
};

let gradSeq = 0;
function useGradId(prefix: string) {
  const ref = useRef("");
  if (!ref.current) ref.current = `${prefix}${++gradSeq}`;
  return ref.current;
}

/** One die face, in the given style (drawn on a 100×100 box). */
function Die({ skin, face, size, glow = 0 }: { skin: DiceSkin; face: number; size: number | string; glow?: number }) {
  const id = useGradId("ld");
  const f = Math.min(6, Math.max(1, face || 1));
  const inset = 14;
  const iw = 100 - 2 * inset;
  const pip = iw * 0.11;
  const col = f === 1 ? skin.one : skin.pip;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          {skin.face.map((c, i) => (
            <stop key={i} offset={skin.face.length > 1 ? i / (skin.face.length - 1) : 0} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" rx="22" fill={`url(#${id})`} />
      {skin.sparkle &&
        [
          [0.18, 0.2, 0.018], [0.8, 0.3, 0.014], [0.3, 0.82, 0.016], [0.7, 0.75, 0.012], [0.52, 0.12, 0.01], [0.12, 0.55, 0.012], [0.88, 0.62, 0.016],
        ].map(([x, y, r], i) => <circle key={i} cx={x * 100} cy={y * 100} r={r * 100} fill="rgba(255,255,255,.75)" />)}
      <rect x="8" y="5" width="84" height="30" rx="18" fill="rgba(255,255,255,.16)" />
      <rect x="2.5" y="2.5" width="95" height="95" rx="20" fill="none" stroke={skin.rim} strokeOpacity={0.6 + 0.4 * glow} strokeWidth={5 + 2 * glow} />
      {PIPS[f].map(([x, y], i) => {
        const cx = inset + x * iw;
        const cy = inset + y * iw;
        const r = pip * (f === 1 ? 1.5 : 1);
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={r * 1.8} fill={skin.glow} fillOpacity={0.28} />
            <circle cx={cx} cy={cy} r={r} fill={col} />
            <circle cx={cx - r * 0.3} cy={cy - r * 0.3} r={r * 0.35} fill="rgba(255,255,255,.5)" />
          </g>
        );
      })}
    </svg>
  );
}

function starPoints(cx: number, cy: number, r: number, squash = 1): string {
  const pts: string[] = [];
  for (let k = 0; k < 10; k++) {
    const rr = k % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(3)},${(cy + rr * Math.sin(a) * squash).toFixed(3)}`);
  }
  return pts.join(" ");
}

/** One piece in the chosen style: coin, pin or ball. Base = where it stands (cell units). */
function Piece({ style, x, y, s, c, movable }: { style: string; x: number; y: number; s: number; c: number; movable: boolean }) {
  const id = useGradId("lp");
  const color = COLORS[c];
  const dark = COLORS_DARK[c];
  const light = COLORS_LIGHT[c];
  const glowRing = movable ? (
    <ellipse className="ludo-glow" cx={x} cy={y} rx={s * 0.95} ry={s * 0.34} fill="none" stroke="#FFFFFF" strokeWidth={s * 0.14} />
  ) : null;
  let body: ReactNode;
  if (style === "pin") {
    const foot = y;
    const headY = foot - s * 1.15;
    const hr = s * 0.42;
    body = (
      <>
        <defs>
          <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={light} />
            <stop offset="0.5" stopColor={color} />
            <stop offset="1" stopColor={dark} />
          </linearGradient>
          <radialGradient id={`${id}h`} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor={light} />
            <stop offset="0.55" stopColor={color} />
            <stop offset="1" stopColor={dark} />
          </radialGradient>
        </defs>
        <path
          d={`M${x - s * 0.52},${foot - s * 0.08} Q${x - s * 0.18},${foot - s * 0.55} ${x - hr * 0.55},${headY + hr * 0.6} L${x + hr * 0.55},${headY + hr * 0.6} Q${x + s * 0.18},${foot - s * 0.55} ${x + s * 0.52},${foot - s * 0.08}Z`}
          fill={`url(#${id}b)`}
        />
        <ellipse cx={x} cy={foot - s * 0.07} rx={s * 0.55} ry={s * 0.13} fill={dark} />
        <circle cx={x} cy={headY} r={hr} fill={`url(#${id}h)`} />
        <circle cx={x} cy={headY} r={hr * 0.55} fill="none" stroke="#FFFFFF" strokeWidth={s * 0.07} />
        <circle cx={x - hr * 0.4} cy={headY - hr * 0.45} r={hr * 0.22} fill="rgba(255,255,255,.55)" />
      </>
    );
  } else if (style === "ball") {
    const r = s * 0.62;
    const cy = y - r * 0.95;
    body = (
      <>
        <defs>
          <radialGradient id={`${id}g`} cx="0.32" cy="0.28" r="0.85">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="0.25" stopColor={light} />
            <stop offset="0.6" stopColor={color} />
            <stop offset="1" stopColor={dark} />
          </radialGradient>
        </defs>
        <circle cx={x} cy={cy} r={r} fill={`url(#${id}g)`} stroke="rgba(255,255,255,.9)" strokeWidth={s * 0.05} />
        <ellipse cx={x - r * 0.25} cy={cy - r * 0.57} rx={r * 0.3} ry={r * 0.17} fill="rgba(255,255,255,.6)" />
      </>
    );
  } else {
    // a glossy coin: thick disc with a white ring and a star
    const cy = y - s * 0.55;
    const r = s * 0.72;
    const ry = r * 0.55;
    const thick = s * 0.18;
    body = (
      <>
        <defs>
          <linearGradient id={`${id}c`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={light} />
            <stop offset="0.5" stopColor={color} />
            <stop offset="1" stopColor={dark} />
          </linearGradient>
        </defs>
        <ellipse cx={x} cy={cy + thick} rx={r} ry={ry} fill={dark} />
        <rect x={x - r} y={cy} width={2 * r} height={thick} fill={dark} />
        <ellipse cx={x} cy={cy} rx={r} ry={ry} fill={`url(#${id}c)`} stroke="rgba(255,255,255,.9)" strokeWidth={s * 0.05} />
        <ellipse cx={x} cy={cy} rx={r * 0.66} ry={ry * 0.66} fill="none" stroke="#FFFFFF" strokeWidth={s * 0.08} />
        <polygon points={starPoints(x, cy, r * 0.32, 0.55)} fill="#FFFFFF" />
        <ellipse cx={x - r * 0.35} cy={cy - ry * 0.62} rx={r * 0.35} ry={ry * 0.22} fill="rgba(255,255,255,.35)" />
      </>
    );
  }
  return (
    <g>
      <ellipse cx={x} cy={y} rx={s * 0.7} ry={s * 0.2} fill="rgba(0,0,0,.33)" />
      {glowRing}
      <g className={movable ? "ludo-hop" : undefined}>{body}</g>
    </g>
  );
}

/** The board (turned so MY yard is bottom-left), with the pieces when [live]. */
function Board({ state, mySeat, canMove, live, turns }: { state: LudoState; mySeat: number; canMove: boolean; live: boolean; turns: number }) {
  const sk = boardSkinOf(boardNow(state));
  const bgId = useGradId("lb");
  const turnColor = live ? (state.players[state.turnIndex]?.color ?? -1) : -1;
  const legal = canMove ? state.legal : [];
  const thin = 0.04;
  const turned = (r: number, c: number) => rot(r, c, turns);

  // one glass pane: tinted fill, a shine across the top half, a bright edge
  const pane = (key: string, x: number, y: number, w: number, h: number, fill: string, radius: number) => (
    <g key={key}>
      <rect x={x} y={y} width={w} height={h} rx={radius} fill={fill} />
      {sk.shine && <rect x={x} y={y} width={w} height={h * 0.5} rx={radius} fill="url(#ludoShine)" />}
      <rect x={x} y={y} width={w} height={h} rx={radius} fill="none" stroke={sk.edge} strokeWidth={thin} />
    </g>
  );

  const stars: [number, number, string, number][] = [];
  const g = 0.05;
  const backdrop: ReactNode[] = [];
  for (let color = 0; color < 4; color++) {
    const [r0, c0] = YARD_ORIGIN[color];
    const pad = 0.12;
    backdrop.push(pane(`y${color}`, c0 + pad, r0 + pad, 6 - 2 * pad, 6 - 2 * pad, hexA(COLORS[color], sk.yardAlpha), 0.7));
    backdrop.push(pane(`n${color}`, c0 + 1, r0 + 1, 4, 4, sk.nest, 0.5));
    YARD_SPOTS.forEach(([sr, sc], k) => {
      backdrop.push(
        <g key={`s${color}${k}`}>
          <circle cx={c0 + sc} cy={r0 + sr} r={0.66} fill={hexA(COLORS[color], 0.7)} stroke="rgba(255,255,255,.8)" strokeWidth={0.05} />
          <circle cx={c0 + sc} cy={r0 + sr} r={0.34} fill="rgba(255,255,255,.33)" />
        </g>
      );
    });
    if (color === turnColor) {
      backdrop.push(
        <rect key={`t${color}`} className="ludo-yard-glow" x={c0 + pad} y={r0 + pad} width={6 - 2 * pad} height={6 - 2 * pad} rx={0.7} fill="none" stroke="#FFFFFF" strokeWidth={0.16} />
      );
    }
  }
  TRACK.forEach(([r, c], abs) => {
    if (abs % 13 === 0) {
      backdrop.push(pane(`k${abs}`, c + g, r + g, 1 - 2 * g, 1 - 2 * g, hexA(COLORS[abs / 13], Math.max(0.8, sk.laneAlpha)), 0.22));
      stars.push([r + 0.5, c + 0.5, "#FFFFFF", 0]);
    } else {
      backdrop.push(pane(`k${abs}`, c + g, r + g, 1 - 2 * g, 1 - 2 * g, sk.tile, 0.22));
      if (STAR_SQUARES.has(abs)) stars.push([r + 0.5, c + 0.5, sk.star, 0.07]);
    }
  });
  for (let color = 0; color < 4; color++) {
    HOME_COLUMN[color].forEach(([r, c], k) => backdrop.push(pane(`h${color}${k}`, c + g, r + g, 1 - 2 * g, 1 - 2 * g, hexA(COLORS[color], sk.laneAlpha), 0.22)));
  }
  const tri: [number, number, number, number][] = [
    [6, 6, 6, 9],
    [6, 6, 9, 6],
    [9, 6, 9, 9],
    [6, 9, 9, 9],
  ];
  tri.forEach(([x1, y1, x2, y2], color) =>
    backdrop.push(
      <polygon key={`c${color}`} points={`${x1},${y1} ${x2},${y2} 7.5,7.5`} fill={hexA(COLORS[color], sk.laneAlpha)} stroke={sk.edge} strokeWidth={thin} />
    )
  );
  backdrop.push(<circle key="mid" cx={7.5} cy={7.5} r={0.55} fill={sk.shine ? "rgba(255,255,255,.33)" : sk.nest} stroke="rgba(255,255,255,.8)" strokeWidth={thin} />);
  stars.push([7.5, 7.5, sk.shine ? "#FFFFFF" : sk.star, 0]);

  // Pieces (upright, at their turned positions)
  type P = { seat: number; color: number; token: number; pos: number; r: number; c: number };
  const pieces: P[] = [];
  if (live) {
    state.players.forEach((p, seat) => {
      if (p.out || p.color < 0 || p.color > 3) return;
      p.tokens.forEach((real, i) => {
        const pos = state.shown[keyOf(p.uid, i)] ?? real;
        const [r0, c0] = tokenCenter(p.color, pos, i);
        const [r, c] = turned(r0, c0);
        pieces.push({ seat, color: p.color, token: i, pos, r, c });
      });
    });
  }
  const groups = new Map<string, P[]>();
  pieces.filter((p) => p.pos >= 0 && p.pos < HOME).forEach((p) => {
    const k = `${p.r}_${p.c}`;
    groups.set(k, [...(groups.get(k) || []), p]);
  });

  return (
    <svg viewBox="0 0 15 15" className="block h-full w-full" style={{ touchAction: "manipulation" }}>
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
          {sk.bg.map((c, i) => (
            <stop key={i} offset={sk.bg.length > 1 ? i / (sk.bg.length - 1) : 0} stopColor={c} />
          ))}
        </linearGradient>
        <linearGradient id="ludoShine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,.25)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        {["#FF4D8D", "#34E0A1", "#FFC93C", "#4DA3FF", "#B06CFF"].map((c, i) => (
          <radialGradient key={c} id={`ludoBlob${i}`}>
            <stop offset="0" stopColor={c} stopOpacity={0.6} />
            <stop offset="1" stopColor={c} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>
      <g transform={`rotate(${-90 * turns} 7.5 7.5)`}>
        <rect x="0" y="0" width="15" height="15" fill={`url(#${bgId})`} />
        {sk.blobs &&
          [
            [0.2, 0.2, 0.42],
            [0.85, 0.25, 0.38],
            [0.8, 0.85, 0.42],
            [0.15, 0.8, 0.38],
            [0.5, 0.5, 0.3],
          ].map(([fx, fy, fr], i) => <circle key={i} cx={fx * 15} cy={fy * 15} r={fr * 15} fill={`url(#ludoBlob${[0, 1, 2, 3, 4][i]})`} />)}
        {backdrop}
      </g>
      {stars.map(([r, c, col, outline], i) => {
        const [rr, cc] = turned(r, c);
        return outline > 0 ? (
          <polygon key={i} points={starPoints(cc, rr, 0.3)} fill="none" stroke={col} strokeOpacity={0.85} strokeWidth={outline} strokeLinejoin="round" />
        ) : (
          <polygon key={i} points={starPoints(cc, rr, 0.3)} fill={col} />
        );
      })}
      {[0, 1, 2, 3].map((color) => {
        const [yr, yc] = yardShown(color, turns);
        return (
          <text
            key={color}
            x={yc + 3}
            y={yr + 0.52 + 0.17}
            textAnchor="middle"
            fontSize={0.5}
            fontWeight={700}
            letterSpacing={0.06}
            fill="#FFFFFF"
            style={{ filter: "drop-shadow(0 0.03px 0.1px rgba(0,0,0,.35))" }}
          >
            miGlife
          </text>
        );
      })}
      {[...pieces]
        .sort((a, b) => a.r - b.r)
        .map((p) => {
          let cx = p.c;
          let s = 0.62;
          if (p.pos >= HOME) s = 0.32;
          const grp = groups.get(`${p.r}_${p.c}`);
          if (grp && grp.length > 1) {
            const j = grp.indexOf(p);
            cx += (j - (grp.length - 1) / 2) * (0.5 / (grp.length - 1));
            s = 0.4;
          }
          const movable = p.seat === mySeat && legal.includes(p.token);
          return (
            <g
              key={`${p.seat}:${p.token}`}
              onClick={movable && !state.busy ? () => state.act("move", p.token) : undefined}
              style={movable ? { cursor: "pointer" } : undefined}
            >
              {movable && <circle cx={cx} cy={p.r} r={0.75} fill="transparent" />}
              <Piece style={isClassicNow() ? "coin" : state.inv.active.token} x={cx} y={p.r + s * 0.35} s={s} c={p.color} movable={movable} />
            </g>
          );
        })}
    </svg>
  );
}

/** "#RRGGBB" + alpha → rgba(). */
function hexA(hex: string, a: number): string {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * A die thrown onto the board: it flies out of the roller's yard, bounces
 * three times while spinning and showing random faces, lands near the centre
 * on the real number, rests a moment and fades away.
 */
function RollingDie({ rollKey, value, fromColor, turns, skin }: { rollKey: number; value: number; fromColor: number; turns: number; skin: DiceSkin }) {
  const lastKey = useRef(rollKey); // no throw for the roll already shown on open
  const [anim, setAnim] = useState<{ x: number; y: number; rotZ: number; scale: number; alpha: number; face: number } | null>(null);
  useEffect(() => {
    if (rollKey === lastKey.current || value < 1 || value > 6) return;
    lastKey.current = rollKey;
    const [r0, c0] = yardShown(fromColor, turns);
    const sx = c0 + 3;
    const sy = r0 + 3;
    const ex = 7.5 + Math.random() * 2.4 - 1.2;
    const ey = 7.5 + Math.random() * 2.4 - 1.2;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const t0 = performance.now();
    let face = value;
    let lastFace = 0;
    let raf = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const frame = (now: number) => {
      const el = now - t0;
      const p = Math.min(1, ease(Math.min(1, el / 950)));
      if (p < 0.82 && now - lastFace > 70) {
        face = 1 + Math.floor(Math.random() * 6);
        lastFace = now;
      } else if (p >= 0.82) face = value;
      const hop = Math.abs(Math.sin(p * Math.PI * 3)) * (1 - p) * 1.6;
      const alpha = el < 1650 ? 1 : Math.max(0, 1 - (el - 1650) / 250);
      setAnim({ x: sx + (ex - sx) * p, y: sy + (ey - sy) * p - hop, rotZ: dir * 720 * (1 - p) * (1 - p), scale: 1 + hop * 0.12, alpha, face });
      if (alpha > 0) raf = requestAnimationFrame(frame);
      else setAnim(null);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [rollKey, value, fromColor, turns]);
  if (!anim) return null;
  const size = (1.5 / 15) * 100;
  return (
    <span
      className="pointer-events-none absolute"
      style={{
        left: `${(anim.x / 15) * 100 - size / 2}%`,
        top: `${(anim.y / 15) * 100 - size / 2}%`,
        width: `${size}%`,
        aspectRatio: "1",
        transform: `rotate(${anim.rotZ}deg) scale(${anim.scale})`,
        opacity: anim.alpha,
        filter: "drop-shadow(0 4px 6px rgba(0,0,0,.45))",
      }}
    >
      <Die skin={skin} face={anim.face} size="100%" />
    </span>
  );
}

// ---------------- UI ----------------
function Avatar({ p, size, rounded = "50%" }: { p: { username: string; color: number; photoUrl?: string; isBot?: boolean }; size: number | string; rounded?: string }) {
  const c = Math.min(3, Math.max(0, p.color));
  const name = p.username.trim();
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden font-black text-white"
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        background: `radial-gradient(circle, ${COLORS_LIGHT[c]}, ${COLORS[c]}, ${COLORS_DARK[c]})`,
        border: "1.5px solid #FFFFFF",
        fontSize: typeof size === "number" ? size * 0.45 : undefined,
      }}
    >
      {p.isBot ? (
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

function AutoButton({ on, enabled, onClick }: { on: boolean; enabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className={`flex shrink-0 items-center rounded-full px-[7px] py-0.5 text-[10px] font-extrabold ${on ? "ludo-auto text-white" : ""}`}
      style={on ? { background: "linear-gradient(90deg, #2ECC71, #1E9B5A)", border: "1px solid #fff" } : { background: "rgba(59,74,107,.16)", border: "1px solid rgba(59,74,107,.4)", color: IVORY }}
    >
      <span className="mr-[3px] text-[11px]">🤖</span>
      {on ? "Auto ON" : "Auto"}
    </button>
  );
}

export function LudoTable({ state, myUsername = "", roomUsers = [] }: { state: LudoState; myUsername?: string; roomUsers?: string[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [styles, setStyles] = useState(false);
  const [inviting, setInviting] = useState(false);
  const mySeat = state.players.findIndex((p) => p.uid === state.myUid);
  const me = state.players[mySeat];
  const playing = state.phase === "PLAYING";
  const myTurn = playing && mySeat >= 0 && state.turnIndex === mySeat && me?.out === false;
  const canRoll = myTurn && !state.awaitingMove && !state.busy;
  const canMove = myTurn && state.awaitingMove && !state.busy;
  const dots = "●".repeat(state.tokenCount);
  const title = !state.running
    ? state.table > 0
      ? `Ludo · Table ${state.table}`
      : "Ludo"
    : state.isFree && state.phase === "JOINING"
      ? `Ludo ${dots} · Free · ${state.players.length}/${state.maxPlayers}`
      : state.isFree
        ? `Ludo ${dots} · Free`
        : state.phase === "JOINING"
          ? `Ludo ${dots} · Entry ${state.fee} · ${state.players.length}/${state.maxPlayers}`
          : `Ludo ${dots} · Pot ${state.pot.toLocaleString()}`;
  const iconBtn = "shrink-0 px-1 text-[15px] leading-none";

  return (
    <div className="px-1.5 py-0.5">
      <div
        className="overflow-hidden rounded-[18px] shadow-md"
        style={{ background: "linear-gradient(#F4F6FD, #E9ECFA, #F1E9FA) padding-box, linear-gradient(135deg, #F2B531, #E91E63, #3B82F6) border-box", border: "1px solid transparent" }}
      >
        {/* Header */}
        <div className="flex items-center px-2.5 py-1" style={{ background: "linear-gradient(90deg, #FFF1CC, #CEC0EC, #B9CDEE)" }}>
          <span
            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-xs shadow"
            style={{ background: "linear-gradient(135deg, #FFFFFF, #FFE9A8)", border: `1px solid ${BRASS}` }}
          >
            🎲
          </span>
          <span className="ml-2 min-w-0 flex-1 truncate text-[13px] font-extrabold" style={{ color: BRASS }}>
            {title}
          </span>
          {state.running && state.secondsLeft > 0 && (
            <span className="mr-1 shrink-0 rounded-[10px] px-[7px] py-0.5 text-[11px] font-bold text-white" style={{ background: state.secondsLeft <= 5 ? "#D64545" : "#6C8CC7" }}>
              ⏱ {state.secondsLeft}s
            </span>
          )}
          {state.running && mySeat >= 0 && me?.out === false && (
            <span className="mr-1">
              <AutoButton on={me.auto} enabled={!state.busy} onClick={() => state.act("auto", -1, !me.auto)} />
            </span>
          )}
          <button type="button" className={iconBtn} onClick={() => setStyles(true)} aria-label="Styles">
            🎨
          </button>
          <button type="button" className={iconBtn} onClick={() => state.setHideMessages(!state.hideMessages)} aria-label="Game messages">
            {state.hideMessages ? "🙈" : "💬"}
          </button>
          <button type="button" className={iconBtn} onClick={() => state.setSoundOn(!state.soundOn)} aria-label="Sound">
            {state.soundOn ? "🔊" : "🔇"}
          </button>
          <button type="button" className="shrink-0 px-1.5 text-lg font-bold" style={{ color: BRASS }} onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? "＋" : "－"}
          </button>
        </div>
        <div className="h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${BRASS}, #E91E63, ${BRASS}, transparent)` }} />

        {!collapsed && <TablesStrip state={state} />}
        {collapsed && playing && <MiniBar state={state} mySeat={mySeat} myTurn={myTurn} canRoll={canRoll} canMove={canMove} onOpen={() => setCollapsed(false)} />}
        {!collapsed &&
          (playing ? (
            <PlayingBody state={state} mySeat={mySeat} myTurn={myTurn} canRoll={canRoll} canMove={canMove} />
          ) : state.running && state.phase === "JOINING" ? (
            <JoiningBody state={state} mySeat={mySeat} onInvite={() => setInviting(true)} />
          ) : (
            <IdleBody state={state} />
          ))}
      </div>
      {styles && <LudoStyleDialog inv={state.inv} onClose={() => setStyles(false)} />}
      {inviting && <InviteDialog state={state} myUsername={myUsername} roomUsers={roomUsers} onClose={() => setInviting(false)} />}
    </div>
  );
}

/**
 * 🎲 Unlimited tables: a chip per running table + "＋ New table". Two people
 * play at Table 1 while two others play at Table 2 — each phone shows its own.
 */
function TablesStrip({ state }: { state: LudoState }) {
  const shown = state.tables.filter((t) => t.running || t.no === state.table);
  if (shown.length === 0 && state.table === 0) return null;
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-2 py-[5px] [scrollbar-width:none]">
      {shown.map((t) => {
        const on = t.no === state.table;
        const label = !t.running ? `T${t.no}` : t.phase === "JOINING" ? `T${t.no} · ${t.seats}/${t.maxPlayers} · join` : `T${t.no} · ${t.team ? "2v2" : `${t.seats}👤`} · live`;
        const dot = !t.running ? "#9E9E9E" : t.phase === "JOINING" ? "#FFC107" : "#2EE59D";
        return (
          <button
            key={t.no}
            type="button"
            onClick={() => state.showTable(t.no)}
            className="flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ background: on ? NEON : "rgba(59,74,107,.1)", border: `1px solid ${t.mine ? "#FFD54F" : "rgba(59,74,107,.2)"}`, color: on ? "#FFFFFF" : IVORY }}
          >
            <span className="mr-[5px] h-[7px] w-[7px] rounded-full" style={{ background: dot }} />
            {t.mine ? "⭐ " : ""}
            {label}
          </button>
        );
      })}
      {state.myTable === 0 && (
        <button
          type="button"
          onClick={() => state.showTable(0)}
          className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ background: state.table === 0 ? "#7C4DFF" : "rgba(59,74,107,.1)", border: "1px solid rgba(124,77,255,.33)", color: state.table === 0 ? "#FFFFFF" : "#5B3FD6" }}
        >
          ＋ New table
        </button>
      )}
    </div>
  );
}

/**
 * The framed board. Every phase shows it: before the game the setup (or the
 * seats) sits ON the board as an overlay; once the game starts the pieces appear.
 */
function BoardFrame({ state, mySeat, canMove, live, children }: { state: LudoState; mySeat: number; canMove: boolean; live: boolean; children?: ReactNode }) {
  const sk = boardSkinOf(boardNow(state));
  return (
    <div className="flex justify-center px-1.5">
      <div
        className="relative aspect-square w-full max-w-[460px] rounded-[14px] p-1 shadow-lg"
        style={{ background: `linear-gradient(135deg, ${sk.frame.join(", ")})`, border: "1.5px solid rgba(255,255,255,.55)" }}
      >
        <div className="relative h-full w-full overflow-hidden rounded">
          <Board state={state} mySeat={mySeat} canMove={canMove} live={live} turns={viewTurns(state, mySeat)} />
          {children}
        </div>
      </div>
    </div>
  );
}

/** Position a box on the board by cell units (0–15). */
const cellBox = (col: number, row: number, w: number, h: number = w): CSSProperties => ({
  position: "absolute",
  left: `${(col / 15) * 100}%`,
  top: `${(row / 15) * 100}%`,
  width: `${(w / 15) * 100}%`,
  height: `${(h / 15) * 100}%`,
});

/** Neon segmented control for the setup card: label on the left, glowing pills on the right. */
function NeonSegment<T extends number>({
  label,
  options,
  selected,
  text,
  onPick,
  enabled = () => true,
}: {
  label: string;
  options: T[];
  selected: T;
  text: (v: T) => string;
  onPick: (v: T) => void;
  enabled?: (v: T) => boolean;
}) {
  return (
    <div className="flex w-full items-center">
      {label && <span className="w-[46px] shrink-0 text-[10px] font-bold text-[#9FA8FF]">{label}</span>}
      <div className="flex h-[30px] flex-1 items-center rounded-full border border-white/20 bg-white/[0.12] p-0.5">
        {options.map((v) => {
          const on = v === selected;
          const ok = enabled(v);
          return (
            <button
              key={v}
              type="button"
              disabled={!ok}
              onClick={() => onPick(v)}
              className={`h-full flex-1 whitespace-nowrap rounded-full text-[11px] ${on ? "font-extrabold" : "font-semibold"}`}
              style={{ background: on ? NEON : "transparent", color: on ? "#FFFFFF" : ok ? "rgba(255,255,255,.75)" : "rgba(255,255,255,.25)" }}
            >
              {text(v)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const glassCard: CSSProperties = {
  background: "linear-gradient(rgba(42,31,92,.95), rgba(22,15,51,.95)) padding-box, linear-gradient(135deg, #00E5FF, #7C4DFF, #FF2D95) border-box",
  border: "1.5px solid transparent",
  boxShadow: "0 10px 28px rgba(124,77,255,.5)",
};

function IdleBody({ state }: { state: LudoState }) {
  const winner = state.players.find((p) => state.lastWinners.includes(p.uid));
  return (
    <div className="py-1.5">
      <BoardFrame state={state} mySeat={-1} canMove={false} live={false}>
        {/* the table setup sits on the board itself — a dark glass card */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex w-[92%] flex-col items-center gap-2 rounded-[22px] px-3 py-3" style={glassCard}>
            <div className="flex items-center">
              <span className="text-lg">🎲</span>
              <span
                className="ml-1.5 text-[17px] font-black tracking-[0.5px]"
                style={{ background: "linear-gradient(90deg, #00E5FF, #FFFFFF, #FF8AD8)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
              >
                {state.table > 0 && state.isFree ? `Table ${state.table} · Free` : state.table > 0 ? `Table ${state.table}` : state.isFree ? "New Table · Free" : "New Table"}
              </span>
            </div>
            {winner && state.lastPrize > 0 && (
              <span
                className="max-w-full truncate rounded-full px-2.5 py-0.5 text-[10px] font-bold text-[#FFE08A]"
                style={{ background: "linear-gradient(90deg, rgba(255,213,79,.2), rgba(255,45,149,.2))", border: "1px solid rgba(255,213,79,.4)" }}
              >
                🏆 {winner.username} won {state.lastPrize.toLocaleString()}
              </span>
            )}
            {!state.isFree && (
              <NeonSegment label="Entry" options={FEE_OPTIONS} selected={state.selectedFee} text={(f) => (f >= 1000 ? `${f / 1000}K` : `${f}`)} onPick={(f) => state.setSetup({ fee: f })} />
            )}
            <NeonSegment label="Pieces" options={TOKEN_MODES} selected={state.selectedTokens} text={(n) => `${n}`} onPick={(n) => state.setSetup({ tokens: n })} />
            <NeonSegment
              label="Players"
              options={TABLE_SIZES}
              selected={state.selectedPlayers}
              text={(n) => `${n} 👤`}
              onPick={(n) => state.setSetup(n === 2 ? { players: n, team: false } : { players: n })}
            />
            <NeonSegment
              label="Mode"
              options={[0, 1]}
              selected={state.selectedTeam && state.selectedPlayers === 4 ? 1 : 0}
              text={(v) => (v === 1 ? "👥 Team" : "👤 Single")}
              enabled={(v) => v === 0 || state.selectedPlayers === 4}
              onPick={(v) => state.setSetup({ team: v === 1 })}
            />
            <button
              type="button"
              disabled={state.busy}
              onClick={() => state.start()}
              className="h-10 w-3/4 rounded-full text-[15px] font-black tracking-[1.5px] text-white"
              style={{ background: state.busy ? "rgba(255,255,255,.2)" : NEON, border: "1px solid rgba(255,255,255,.5)", boxShadow: state.busy ? "none" : "0 0 14px rgba(255,45,149,.55)" }}
            >
              {"▶︎  PLAY"}
            </button>
            <span className="text-center text-[9px] text-white/50">
              {state.selectedPlayers === 4 && state.selectedTeam
                ? "2 vs 2 · empty seats get bots · both partners home wins"
                : state.isFree
                  ? `${state.selectedPlayers} players · play for fun · !help`
                  : `${state.selectedPlayers} players · winner takes 90% · !help`}
            </span>
          </div>
        </div>
      </BoardFrame>
    </div>
  );
}

/** Small pill button used on the joining table. */
function Chip({ label, enabled, primary, ok, onClick }: { label: string; enabled: boolean; primary: boolean; ok?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className="shrink-0 whitespace-nowrap rounded-full px-[11px] py-[5px] text-[11px] font-extrabold"
      style={{
        background: ok
          ? "linear-gradient(90deg, #2ED47A, #0E7A45)"
          : primary && enabled
            ? "linear-gradient(90deg, #F2B531, #E9801A, #E91E63)"
            : enabled
              ? "linear-gradient(90deg, rgba(255,255,255,.9), rgba(255,255,255,.65))"
              : "rgba(59,74,107,.1)",
        border: primary || ok ? "none" : "1px solid rgba(59,74,107,.29)",
        color: (primary && enabled) || ok ? "#FFFFFF" : IVORY,
        boxShadow: primary && enabled ? "0 2px 4px rgba(0,0,0,.2)" : "none",
      }}
    >
      {label}
    </button>
  );
}

function JoiningBody({ state, mySeat, onInvite }: { state: LudoState; mySeat: number; onInvite: () => void }) {
  // 🤖 Nobody sat down? The host's phone asks the server for a bot in the last
  // seconds of the join window (once per game) so the table never dies empty.
  const autoBotTried = useRef("");
  useEffect(() => {
    const key = `${state.table}:${state.round}`;
    if (mySeat === 0 && autoBotTried.current !== key && state.players.length < 2 && state.secondsLeft >= 1 && state.secondsLeft <= 4 && !state.busy) {
      autoBotTried.current = key;
      state.addBot();
    }
  });
  const turns = viewTurns(state, mySeat);
  return (
    <div className="space-y-1.5 py-1.5">
      {/* The seats sit in the yards. 4 seats: seat i = colour i. 2 seats: the
          two players face each other (red and yellow yards). */}
      <BoardFrame state={state} mySeat={mySeat} canMove={false} live={false}>
        {[0, 1, 2, 3].map((i) => {
          const seat = state.maxPlayers === 2 ? (i === 0 ? 0 : i === 2 ? 1 : -1) : i;
          const [r0, c0] = yardShown(i, turns);
          if (seat < 0) {
            return (
              <div key={i} className="flex items-center justify-center rounded-[6%] bg-black/35 text-lg" style={cellBox(c0 + 1, r0 + 1, 4)}>
                🔒
              </div>
            );
          }
          const p = state.players[seat];
          return (
            <button
              key={i}
              type="button"
              disabled={!!p || state.busy}
              onClick={() => (mySeat < 0 ? state.join() : onInvite())}
              className="flex flex-col items-center justify-center rounded-[8%] bg-white/90"
              style={cellBox(c0 + 1, r0 + 1, 4)}
            >
              <span
                className="flex items-center justify-center rounded-full"
                style={{
                  width: "57%",
                  aspectRatio: "1",
                  background: p ? `linear-gradient(135deg, ${COLORS[i]}, ${COLORS_DARK[i]})` : `linear-gradient(135deg, ${hexA(COLORS[i], 0.15)}, ${hexA(COLORS[i], 0.08)})`,
                  border: `2px solid ${p ? COLORS[i] : hexA(COLORS[i], 0.45)}`,
                }}
              >
                {p ? <Avatar p={{ ...p, color: i }} size="92%" /> : <span className="text-[22px] font-light" style={{ color: COLORS[i] }}>+</span>}
              </span>
              <span className="mt-[3px] max-w-[92%] truncate text-center text-[10px] font-bold" style={{ color: p ? IVORY : hexA("#2B3552", 0.45) }}>
                {!p ? (mySeat < 0 ? "Tap to sit" : "Tap to invite") : p.uid === state.myUid ? "You" : p.username}
              </span>
              {state.team && (
                <span className="text-[9px] font-extrabold" style={{ color: i % 2 === 0 ? "#E53935" : "#1E88E5" }}>
                  {i % 2 === 0 ? "Team A" : "Team B"}
                </span>
              )}
            </button>
          );
        })}
      </BoardFrame>
      {/* One slim action row: Sit / Invite / Bot / Leave. */}
      <div className="flex items-center gap-1.5 px-2 pb-1">
        {mySeat < 0 ? (
          <Chip
            label={state.isFree ? "Sit down · Free" : `Sit down · ${state.fee}`}
            enabled={!state.busy && state.players.length < state.maxPlayers}
            primary
            onClick={() => state.join()}
          />
        ) : (
          <>
            <Chip label="✓ You're in" enabled={false} primary={false} ok onClick={() => {}} />
            <Chip label="📨 Invite" enabled={!state.busy} primary={false} onClick={onInvite} />
          </>
        )}
        <Chip label="🤖 Bot" enabled={!state.busy && state.players.length >= 1 && state.players.length < state.maxPlayers} primary={false} onClick={state.addBot} />
        <span className="flex-1" />
        {mySeat >= 0 && <Chip label="Leave" enabled={!state.busy} primary={false} onClick={() => state.act("leave")} />}
      </div>
    </div>
  );
}

function PlayingBody({ state, mySeat, myTurn, canRoll, canMove }: { state: LudoState; mySeat: number; myTurn: boolean; canRoll: boolean; canMove: boolean }) {
  const turnPlayer = state.players[state.turnIndex];
  const turnColor = Math.min(3, Math.max(0, turnPlayer?.color ?? 0));
  const turns = viewTurns(state, mySeat);
  const roller = state.players[state.diceSeat] || turnPlayer;
  return (
    <div className="py-1">
      {/* each player's photo sits in the middle of their own yard */}
      <BoardFrame state={state} mySeat={mySeat} canMove={canMove} live>
        {state.players.map((p, seat) => {
          if (p.color < 0 || p.color > 3) return null;
          const [r0, c0] = yardShown(p.color, turns);
          const turn = seat === state.turnIndex && !p.out;
          return (
            <span
              key={p.uid}
              className={`pointer-events-none flex items-center justify-center rounded-full bg-white p-0.5 ${turn ? "ludo-turn" : ""}`}
              style={{
                ...cellBox(c0 + 3 - 0.68, r0 + 3 - 0.68, 1.36),
                opacity: p.out ? 0.35 : 1,
                border: `${turn ? 2.5 : 1.5}px solid ${turn ? COLORS[p.color] : hexA(COLORS[p.color], 0.6)}`,
                ["--lc" as string]: COLORS[p.color],
              }}
            >
              <Avatar p={p} size="100%" />
            </span>
          );
        })}
        {/* 🎲 after every roll a die tumbles across the board and lands */}
        <RollingDie
          rollKey={state.rollNo}
          value={state.dice}
          fromColor={Math.min(3, Math.max(0, roller?.color ?? turnColor))}
          turns={turns}
          skin={diceSkinOf(diceNow(roller?.dice))}
        />
      </BoardFrame>
      {/* Bottom bar: whose turn it is + the dice */}
      <div className="mx-2 mt-2 flex items-center rounded-[14px] bg-white/75 px-3 py-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLORS[turnColor] }} />
        <span className="ml-2 min-w-0 flex-1 truncate text-[13px] font-extrabold" style={{ color: myTurn ? COLORS_DARK[turnColor] : IVORY }}>
          {myTurn && canMove ? "Your turn — tap a glowing piece" : myTurn ? "Your turn — roll the dice" : turnPlayer ? `${turnPlayer.username}'s turn` : ""}
        </span>
        <button
          type="button"
          disabled={!canRoll}
          onClick={() => state.act("roll")}
          className={`shrink-0 rounded-[14px] ${canRoll ? "ludo-dice-glow" : ""}`}
          style={{ opacity: myTurn ? 1 : 0.55, ["--lc" as string]: diceSkinOf(diceNow(turnPlayer?.dice)).glow }}
        >
          <DiceFace value={state.dice} rollKey={state.rollNo} skin={diceSkinOf(diceNow(turnPlayer?.dice))} glow={canRoll} />
        </button>
      </div>
    </div>
  );
}

/** The roll button's die: shakes through random faces after each roll. */
function DiceFace({ value, rollKey, skin, glow }: { value: number; rollKey: number; skin: DiceSkin; glow: boolean }) {
  const [face, setFace] = useState(Math.min(6, Math.max(1, value || 1)));
  const [spin, setSpin] = useState(0);
  const lastKey = useRef(rollKey);
  useEffect(() => {
    if (rollKey !== lastKey.current && value >= 1 && value <= 6) {
      lastKey.current = rollKey;
      let k = 0;
      const t = setInterval(() => {
        setFace(1 + Math.floor(Math.random() * 6));
        setSpin(k % 2 === 0 ? 14 : -14);
        if (++k >= 8) {
          clearInterval(t);
          setSpin(0);
          setFace(value);
        }
      }, 55);
      return () => clearInterval(t);
    }
    if (value >= 1 && value <= 6) setFace(value);
  }, [rollKey, value]);
  return (
    <span className="block" style={{ transform: `rotate(${spin}deg)` }}>
      <Die skin={skin} face={face} size={56} glow={glow ? 1 : 0} />
    </span>
  );
}

// Collapsed ("－") during a game: one slim line instead of the whole board.
function MiniBar({ state, mySeat, myTurn, canRoll, canMove, onOpen }: { state: LudoState; mySeat: number; myTurn: boolean; canRoll: boolean; canMove: boolean; onOpen: () => void }) {
  const turnPlayer = state.players[state.turnIndex];
  return (
    <div className="flex items-center px-2 py-[5px]">
      {turnPlayer && <Avatar p={turnPlayer} size={24} />}
      <span className="ml-1.5 min-w-0 flex-1 truncate text-xs font-bold" style={{ color: myTurn ? BRASS : IVORY }}>
        {!turnPlayer
          ? "…"
          : myTurn && state.players[mySeat]?.auto
            ? "🤖 Auto playing for you"
            : myTurn
              ? `Your turn!${state.dice > 0 && canMove ? ` (rolled ${state.dice})` : ""}`
              : `${turnPlayer.username}'s turn`}
      </span>
      {canRoll ? (
        <button type="button" onClick={() => state.act("roll")} className="rounded-[14px] px-3.5 py-2 text-[13px] font-bold text-white" style={{ background: "linear-gradient(90deg, #F2B531, #E9801A, #E91E63)" }}>
          🎲 Roll
        </button>
      ) : canMove ? (
        <button type="button" onClick={onOpen} className="rounded-[14px] px-3.5 py-2 text-[13px] font-bold text-white" style={{ background: "linear-gradient(90deg, #F2B531, #E9801A, #E91E63)" }}>
          Move ▾
        </button>
      ) : null}
    </div>
  );
}

/** 📨 Invite sheet: people in this room + my friends (accepted friend_requests). */
function InviteDialog({ state, myUsername, roomUsers, onClose }: { state: LudoState; myUsername: string; roomUsers: string[]; onClose: () => void }) {
  const [tab, setTab] = useState(0);
  const [friends, setFriends] = useState<string[] | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!myUsername) return setFriends([]);
    const accepted = (field: string, other: string) =>
      getDocs(query(collection(db, "friend_requests"), where(field, "==", myUsername), where("status", "==", "accepted")))
        .then((q) => q.docs.map((d) => String(d.get(other) || "")).filter(Boolean))
        .catch(() => [] as string[]);
    Promise.all([accepted("fromUsername", "toUsername"), accepted("toUsername", "fromUsername")]).then(([a, b]) =>
      setFriends([...new Set([...a, ...b])].sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase())))
    );
  }, [myUsername]);
  const seated = new Set(state.players.map((p) => p.username.toLowerCase()));
  const inRoom = [...new Set(roomUsers.filter((u) => u.trim() && u.toLowerCase() !== myUsername.toLowerCase() && !seated.has(u.toLowerCase())))].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  const list = tab === 0 ? inRoom : (friends || []).filter((f) => !seated.has(f.toLowerCase()));
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-[22px]"
        style={{ background: "linear-gradient(#DCE6F6, #D8CFEE) padding-box, linear-gradient(135deg, #F2B531, #E91E63, #3B82F6) border-box", border: "1.5px solid transparent" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-3.5 py-2.5" style={{ background: "linear-gradient(90deg, #FFF1CC, #CEC0EC, #B9CDEE)" }}>
          <span className="flex-1 text-[15px] font-extrabold" style={{ color: BRASS }}>
            📨 Invite to Ludo
          </span>
          <button type="button" onClick={onClose} className="px-1 text-base" style={{ color: IVORY }}>
            ✕
          </button>
        </div>
        <div className="flex gap-1.5 p-2.5">
          {[`In room (${inRoom.length})`, `Friends (${(friends || []).length})`].map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setTab(i)}
              className="flex-1 rounded-full py-[7px] text-xs font-bold"
              style={tab === i ? { background: "linear-gradient(90deg, #F2B531, #E9801A)", color: "#FFFFFF" } : { background: "rgba(255,255,255,.75)", color: IVORY }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="max-h-[320px] min-h-[120px] space-y-1.5 overflow-y-auto px-2.5 pb-2.5">
          {tab === 1 && friends === null ? null : list.length === 0 ? (
            <p className="pt-10 text-center text-xs" style={{ color: hexA("#2B3552", 0.6) }}>
              {tab === 0 ? "No one else is in the room right now." : "No friends to invite."}
            </p>
          ) : (
            list.map((name) => {
              const done = sent.has(name);
              return (
                <div key={name} className="flex items-center rounded-[14px] bg-white/75 px-2 py-1.5">
                  <Avatar p={{ username: name, color: Math.abs([...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 0)) % 4 }} size={28} />
                  <span className="ml-2 min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: IVORY }}>
                    {name}
                  </span>
                  <button
                    type="button"
                    disabled={done}
                    onClick={async () => {
                      if (await state.invite(name)) setSent((s) => new Set(s).add(name));
                    }}
                    className="rounded-full px-3 py-[5px] text-xs font-bold text-white"
                    style={{ background: done ? "linear-gradient(90deg, #2ED47A, #0E7A45)" : "linear-gradient(90deg, #F2B531, #E91E63)" }}
                  >
                    {done ? "Sent ✓" : "Invite"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/** Small picture of a board style for the style picker. */
function BoardPreview({ sk }: { sk: BoardSkin }) {
  const fake = { preview: true, inv: { active: { board: sk.id, token: "coin", dice: "neon" } }, players: [], turnIndex: -1, legal: [], shown: {} } as unknown as LudoState;
  return (
    <span className="block aspect-square w-full overflow-hidden rounded-[10px]">
      <Board state={fake} mySeat={-1} canMove={false} live={false} turns={0} />
    </span>
  );
}

function LudoStyleDialog({ inv, onClose }: { inv: Inventory; onClose: () => void }) {
  return (
    <StyleShopDialog
      title="🎨 Ludo Style"
      subtitle="1 of each is free · the rest from 20,000 coins · your board and pieces are what you see, your dice is what your table sees"
      theme={{ bg: "linear-gradient(#2A1F5C, #160F33)", border: "#7C4DFF", title: "#FFFFFF", sub: "rgba(255,255,255,.55)", accent: NEON, accentInk: "#FFFFFF" }}
      tabs={[
        { label: "Board", kind: "board", items: BOARD_SKINS, noun: "board", perRow: 2, preview: (s: BoardSkin) => <BoardPreview sk={s} /> },
        {
          label: "Pieces",
          kind: "token",
          items: TOKEN_SKINS,
          noun: "piece style",
          perRow: 3,
          preview: (s: ShopItem) => (
            <svg viewBox="0 0 2.8 2" className="block w-full">
              <Piece style={s.id} x={0.84} y={1.8} s={0.72} c={0} movable={false} />
              <Piece style={s.id} x={1.96} y={1.8} s={0.72} c={3} movable={false} />
            </svg>
          ),
        },
        {
          label: "Dice",
          kind: "dice",
          items: DICE_SKINS,
          noun: "dice",
          perRow: 3,
          preview: (s: DiceSkin) => (
            <span className="flex justify-center p-2.5" style={{ filter: `drop-shadow(0 3px 6px ${s.glow}88)` }}>
              <Die skin={s} face={5} size={54} />
            </span>
          ),
        },
      ]}
      inv={inv}
      buyFn="buyLudoItem"
      setFn="setLudoStyle"
      opPrefix="ludo"
      onClose={onClose}
    />
  );
}
