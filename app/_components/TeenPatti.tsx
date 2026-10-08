"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { gameInvitedMe, setTpHideGameMessages, setViewedTable } from "../../lib/gameTables";
import { StyleShopDialog, useInventory, type Inventory, type ShopItem } from "./StyleShop";
import { isClassicNow } from "../../lib/uiStyle";

// 🎴 Teen Patti — dealing, betting, coins and winners are decided by the Cloud
// Functions (startTeenPatti / joinTeenPatti / teenPattiAction / tickTeenPatti).
// Your own cards are only ever sent to you. Same flow as TeenPattiGame.kt:
// unlimited tables (table 1 = room_game/{room}, table N = "{room} #N", every
// table doc carries tpRoom), invites, and table / card styles from the shop.

export const TEEN_PATTI_ROOM = "🎴 Teen Patti Official";

const BOOT_OPTIONS = [100, 200, 500, 1000, 2000];

const startCall = httpsCallable<{ boot: number; table: number; operationId: string }, { table?: number }>(functions, "startTeenPatti");
const joinCall = httpsCallable<{ table: number; operationId: string }, { table?: number }>(functions, "joinTeenPatti");
const actionCall = httpsCallable<
  { action: string; table: number; roundNumber: number },
  { cards?: string[]; hand?: string }
>(functions, "teenPattiAction");
const tickCall = httpsCallable(functions, "tickTeenPatti");
const inviteCall = httpsCallable(functions, "inviteToTeenPatti");

const GOLD = "#E8B84A";
const GOLD_DARK = "#9C7420";

// ---------------- 🎨 Styles: table (ghor) + cards ----------------
// One of each is free, the rest are bought with coins (from 50,000).
// Same ids and prices as TP_SHOP in index.js. Styles are what YOU see.
type TpTableSkin = ShopItem & { bg: string[]; rim: string[]; ring: string[]; felt: string[]; line: string; glow: string; logo: string };
type TpCardSkin = ShopItem & {
  back: string[];
  backLine: string;
  mark: string;
  markColor: string;
  face: string[];
  border: string;
  red: string;
  black: string;
};

export const TP_TABLE_SKINS: TpTableSkin[] = [
  {"id": "royal", "name": "Royal", "price": 0, "bg": ["#1C0833", "#12052A", "#0A0318"], "rim": ["#5E3413", "#3A1D08", "#5E3413"], "ring": ["#FFE08A", "#E8B84A", "#B8862A", "#FFE9A6"], "felt": ["#B4246C", "#8E1A57", "#4E0B2E"], "line": "#E39A6A", "glow": "#B0246A", "logo": "#E8A3B8"},
  {"id": "emerald", "name": "Casino Green", "price": 50000, "bg": ["#062114", "#04160D", "#020B06"], "rim": ["#4E2A10", "#2C1606", "#4E2A10"], "ring": ["#FFE08A", "#E8B84A", "#B8862A", "#FFE9A6"], "felt": ["#2E9E5B", "#1B6E3C", "#0B3D1F"], "line": "#A5E1B8", "glow": "#1B6E3C", "logo": "#C8F5D6"},
  {"id": "ocean", "name": "Ocean Blue", "price": 60000, "bg": ["#061229", "#040B1C", "#02060F"], "rim": ["#1A2A44", "#0C1424", "#1A2A44"], "ring": ["#F5F7FA", "#B0BEC5", "#78909C", "#ECEFF1"], "felt": ["#1E88E5", "#1565C0", "#0B2E5E"], "line": "#90CAF9", "glow": "#1565C0", "logo": "#BBDEFB"},
  {"id": "midnight", "name": "Neon Midnight", "price": 75000, "bg": ["#05060F", "#0B1030", "#05060F"], "rim": ["#111111", "#000000", "#111111"], "ring": ["#00E5FF", "#7C4DFF", "#FF2D95", "#00E5FF"], "felt": ["#2A1F5C", "#160F33", "#0A0620"], "line": "#00E5FF", "glow": "#7C4DFF", "logo": "#9FE8FF"},
  {"id": "vip", "name": "VIP Gold", "price": 100000, "bg": ["#1A0A00", "#0F0500", "#050200"], "rim": ["#3E2723", "#1B0F0B", "#3E2723"], "ring": ["#FFF3C4", "#FFD54F", "#FFB300", "#FFF3C4"], "felt": ["#B71C1C", "#7F0000", "#3E0000"], "line": "#FFD54F", "glow": "#FFB300", "logo": "#FFE08A"},
];

export const TP_CARD_SKINS: TpCardSkin[] = [
  {"id": "royal", "name": "Royal", "price": 0, "back": ["#6A1B9A", "#3A0A4E", "#AD1457"], "backLine": "#E8B84A", "mark": "♦", "markColor": "#E8B84A", "face": ["#FFFFFF", "#F3ECE0"], "border": "#9C7420", "red": "#D32F2F", "black": "#111111"},
  {"id": "classic", "name": "Classic Red", "price": 50000, "back": ["#C62828", "#8E0000"], "backLine": "#FFFFFF", "mark": "♠", "markColor": "#FFFFFF", "face": ["#FFFFFF", "#FFFFFF"], "border": "#9E9E9E", "red": "#D32F2F", "black": "#111111"},
  {"id": "gold", "name": "Gold", "price": 60000, "back": ["#FFE57F", "#FFB300", "#B8860B"], "backLine": "#5D3A00", "mark": "♛", "markColor": "#5D3A00", "face": ["#FFFDF3", "#FFF1C9"], "border": "#B8860B", "red": "#C62828", "black": "#3E2500"},
  {"id": "neon", "name": "Neon", "price": 75000, "back": ["#120E2A", "#2A2350"], "backLine": "#00E5FF", "mark": "★", "markColor": "#FF2D95", "face": ["#1A1433", "#0E0A22"], "border": "#00E5FF", "red": "#FF4D8D", "black": "#00E5FF"},
  {"id": "diamond", "name": "Diamond", "price": 100000, "back": ["#E3F7FF", "#8FD8FF", "#3A8DDE"], "backLine": "#FFFFFF", "mark": "◆", "markColor": "#FFFFFF", "face": ["#FFFFFF", "#EAF6FF"], "border": "#3A8DDE", "red": "#E53935", "black": "#0D47A1"},
];

const TP_KINDS = [
  { kind: "table", ownedField: "ownedTables", free: "royal" },
  { kind: "card", ownedField: "ownedCards", free: "royal" },
];

const tableSkinOf = (id: string | undefined) => TP_TABLE_SKINS.find((s) => s.id === id) || TP_TABLE_SKINS[0];
const cardSkinOf = (id: string | undefined) => TP_CARD_SKINS.find((s) => s.id === id) || TP_CARD_SKINS[0];

// My card style — also used by the chat's little cards ("Teen Patti Bot: … [A♥]").
let myCardSkinId = "royal";
export function tpCardSkinNow(): TpCardSkin {
  return cardSkinOf(isClassicNow() ? "classic" : myCardSkinId);
}

// 📟 Classic app style: a blue room with an orange rim and green felt for
// everyone (not sold in the shop); bought styles return in Modern.
const TP_CLASSIC_TABLE: TpTableSkin = {
  id: "classic_ui", name: "Classic", price: 0,
  bg: ["#3A74C2", "#2A5A9E", "#1D4378"],
  rim: ["#FF9D2E", "#E06A00", "#FF9D2E"],
  ring: ["#FFFFFF", "#FFD39A", "#F07A00", "#FFFFFF"],
  felt: ["#2E9E5B", "#1B6E3C", "#0B3D1F"],
  line: "#A5E1B8", glow: "#F07A00", logo: "#FFFFFF",
};

type Player = { uid: string; username: string; seen: boolean; packed: boolean; invested: number };

/** One table of the room (for the table strip). */
type TableInfo = {
  no: number;
  running: boolean;
  phase: string;
  seats: number;
  boot: number;
  phaseEndsAt: number;
  mine: boolean;
  /** 🎟 a seat at this table is kept for me (someone invited me) */
  invitedMe: boolean;
  round: number;
};

type ScoreRow = { username: string; hands: number; wins: number; net: number };

export type TeenPattiState = {
  /** Table on screen: 1, 2, 3 … · 0 = a new, empty table. */
  table: number;
  tables: TableInfo[];
  /** Table I'm playing at (0 = none) — the screen sticks to it. */
  myTable: number;
  running: boolean;
  phase: string;
  round: number;
  boot: number;
  stake: number;
  pot: number;
  players: Player[];
  turnIndex: number;
  reveal: Record<string, { cards: string[]; hand: string }>;
  lastWinners: string[];
  lastPrize: number;
  finishedAt: number;
  secondsLeft: number;
  myCards: string[];
  myHand: string;
  busy: boolean;
  revealing: boolean;
  selectedBoot: number;
  setSelectedBoot: (b: number) => void;
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
  autoBlind: boolean;
  setAutoBlind: (on: boolean) => void;
  autoCall: boolean;
  setAutoCall: (on: boolean) => void;
  hideMessages: boolean;
  setHideMessages: (on: boolean) => void;
  inv: Inventory;
  myUid: string | undefined;
  showTable: (table: number) => void;
  start: (boot?: number) => void;
  join: (table?: number) => void;
  act: (action: string, silent?: boolean) => void;
  invite: (username: string) => Promise<"sent" | "already" | string>;
};

function opId(kind: string): string {
  return `tp_${kind}_` + crypto.randomUUID().replace(/-/g, "");
}

function errText(err: any): string {
  return String(err?.message || "") || "Something went wrong. Try again.";
}

function readPref(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(`migwith.tp.${key}`);
    return v === null ? def : v === "1";
  } catch {
    return def;
  }
}
function writePref(key: string, on: boolean) {
  try {
    localStorage.setItem(`migwith.tp.${key}`, on ? "1" : "0");
  } catch {}
}

// Short beep (and a tiny buzz on phones that can) — like the app's tone.
let audioCtx: AudioContext | null = null;
function tpBeep(long: boolean) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = long ? 660 : 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (long ? 0.35 : 0.16));
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (long ? 0.36 : 0.17));
  } catch {}
}
function tpVibrate(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

function parsePlayers(raw: unknown): Player[] {
  return Array.isArray(raw)
    ? raw
        .filter((m: any) => m && m.uid)
        .map((m: any) => ({
          uid: String(m.uid),
          username: String(m.username || ""),
          seen: m.seen === true,
          packed: m.packed === true,
          invested: Number(m.invested || 0),
        }))
    : [];
}

export function useTeenPatti(enabled: boolean, uid: string | undefined, note: (t: string) => void): TeenPattiState | null {
  // Every table: table 1 = room_game/{room}, the others carry tpRoom = {room}.
  const [first, setFirst] = useState<Record<string, any> | null>(null);
  const [rest, setRest] = useState<Record<number, Record<string, any>>>({});
  const [table, setTable] = useState(0);
  const [mine, setMine] = useState({ key: "", cards: [] as string[], hand: "" });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [selectedBoot, setSelectedBoot] = useState(200);
  const [soundOn, setSoundOnRaw] = useState(true);
  const [autoBlind, setAutoBlindRaw] = useState(false);
  const [autoCall, setAutoCallRaw] = useState(false);
  const [hideMessages, setHideRaw] = useState(false);
  const autoPicked = useRef(false);
  const inviteJump = useRef("");
  const lastTick = useRef<Record<number, number>>({});
  const announcedTurn = useRef("");
  const lastBeep = useRef(-1);
  const noteRef = useRef(note);
  noteRef.current = note;
  const inv = useInventory("tp_inventory", enabled ? uid : undefined, TP_KINDS);
  myCardSkinId = inv.active.card;

  useEffect(() => {
    if (!enabled) return;
    setSoundOnRaw(readPref("sound", true));
    setAutoBlindRaw(readPref("autoBlind", false));
    setAutoCallRaw(readPref("autoCall", false));
    const h = readPref("hideMessages", false);
    setHideRaw(h);
    setTpHideGameMessages(h);
    return () => setTpHideGameMessages(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !uid) return;
    const a = onSnapshot(
      doc(db, "room_game", TEEN_PATTI_ROOM),
      (snap) => setFirst(snap.exists() ? snap.data() : null),
      () => {}
    );
    const b = onSnapshot(
      query(collection(db, "room_game"), where("tpRoom", "==", TEEN_PATTI_ROOM)),
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
  }, [enabled, uid]);

  const docs = useMemo(() => {
    const all: Record<number, Record<string, any>> = { ...rest };
    if (first) all[1] = first;
    return all;
  }, [first, rest]);

  const tables: TableInfo[] = useMemo(
    () =>
      Object.entries(docs)
        .map(([k, d]) => {
          const no = Number(k);
          const running = d.gameRunning === true;
          const players = parsePlayers(d.players);
          return {
            no,
            running,
            phase: String(d.phase || "IDLE"),
            seats: players.length,
            boot: Number(d.boot || 200),
            phaseEndsAt: Number(d.phaseEndsAt || 0),
            mine: running && !!uid && players.some((p) => p.uid === uid && !p.packed),
            invitedMe: gameInvitedMe(d, uid, running),
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
    setViewedTable("tp", table);
    return () => setViewedTable("tp", 0);
  }, [enabled, table]);

  const d = table > 0 ? docs[table] : undefined;
  const g = {
    running: d?.gameRunning === true,
    phase: String(d?.phase || "IDLE"),
    phaseEndsAt: Number(d?.phaseEndsAt || 0),
    round: Number(d?.roundNumber || 0),
    boot: Number(d?.boot || 200),
    stake: Number(d?.stake || 400),
    pot: Number(d?.pot || 0),
    players: parsePlayers(d?.players),
    turnIndex: Number(d?.turnIndex ?? -1),
    reveal: Object.fromEntries(
      Object.entries((d?.reveal || {}) as Record<string, any>).map(([k, v]) => [
        k,
        { cards: Array.isArray(v?.cards) ? v.cards.map(String) : [], hand: String(v?.hand || "") },
      ])
    ) as Record<string, { cards: string[]; hand: string }>,
    lastWinners: Array.isArray(d?.lastWinners) ? (d!.lastWinners as unknown[]).map(String) : [],
    lastPrize: Number(d?.lastPrize || 0),
    finishedAt: Number(d?.finishedAt || 0),
  };
  const cardsKey = `${table}:${g.round}`;
  const myCards = mine.key === cardsKey ? mine.cards : [];

  const act = (action: string, silent = false) => {
    if (busy && !silent) return;
    if (!silent) setBusy(true);
    if (action === "see" && !silent) setRevealing(true);
    const key = cardsKey;
    actionCall({ action, table, roundNumber: g.round })
      .then(({ data }) => {
        if (action === "see" && data?.cards?.length) {
          setMine({ key, cards: data.cards.map(String), hand: String(data.hand || "") });
          if (!silent && data.cards.length === 3) {
            noteRef.current(`Teen Patti Bot: Your cards: ${data.cards.map((c) => `[${c}]`).join(" ")} — ${data.hand || ""}`);
          }
        }
      })
      .catch((err: any) => {
        if (!silent) noteRef.current(`Teen Patti Bot: ${errText(err)}`);
      })
      .finally(() => {
        if (!silent) setBusy(false);
        setRevealing(false);
      });
  };

  const me = g.players.find((p) => p.uid === uid);

  // Already seen (page reopened mid-hand) → fetch my cards again, quietly.
  useEffect(() => {
    if (!enabled) return;
    if (g.phase === "PLAYING" && me && me.seen && !me.packed && myCards.length === 0) act("see", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, table, g.phase, g.round, me?.seen, me?.packed, myCards.length]);

  // When it becomes MY turn: a private hint, a buzz + beep, and Auto blind /
  // Auto call if switched on in the ⚙ menu.
  useEffect(() => {
    if (!enabled || g.phase !== "PLAYING") return;
    const turn = g.players[g.turnIndex];
    if (!turn || turn.uid !== uid || turn.packed) return;
    const key = `${table}:${g.round}:${g.turnIndex}:${g.stake}`;
    if (announcedTurn.current === key) return;
    announcedTurn.current = key;
    const call = turn.seen ? g.stake : g.stake / 2;
    const raise = turn.seen ? g.stake * 2 : g.stake;
    noteRef.current(
      `Teen Patti Bot: 🎯 YOUR turn — playing ${turn.seen ? "seen" : "blind"} · 15s\nCall ${call} → !bet · Raise ${raise} → !raise · Fold → !pack${turn.seen ? "" : " · See cards → !see"}`
    );
    if (soundOn) {
      tpVibrate([0, 150, 110, 150]);
      tpBeep(false);
    }
    if ((!turn.seen && autoBlind) || (turn.seen && autoCall)) {
      const t = setTimeout(() => act("call"), 900);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, table, g.phase, g.round, g.turnIndex, g.stake, g.players, uid]);

  // Countdown, and move every running table on when its timer ends (the
  // server does it exactly once). A watchdog covers an empty room.
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
        tickCall({ table: tb.no }).catch(() => {});
      }
    }, 300);
    return () => clearInterval(t);
  }, [enabled, tables]);

  const left = g.phaseEndsAt - now;
  const secondsLeft = g.running && left > 0 ? Math.ceil(left / 1000) : 0;

  // Beep (+ a tiny buzz) on the last 3 seconds of the join window and of MY turn.
  const myTurnNow = g.phase === "PLAYING" && g.players[g.turnIndex]?.uid === uid;
  useEffect(() => {
    if (!enabled) return;
    const relevant = g.running && (g.phase === "JOINING" || myTurnNow);
    if (!relevant || secondsLeft > 3 || secondsLeft <= 0) {
      if (secondsLeft > 3 || !relevant) lastBeep.current = -1;
      return;
    }
    if (secondsLeft !== lastBeep.current && soundOn) {
      lastBeep.current = secondsLeft;
      tpBeep(secondsLeft === 1);
      tpVibrate([0, secondsLeft === 1 ? 180 : 60]);
    }
  }, [enabled, g.running, g.phase, myTurnNow, secondsLeft, soundOn]);

  if (!enabled) return null;

  const toTable = (r: { data?: { table?: number } }) => {
    const t = Number(r?.data?.table || 0);
    if (t > 0) setTable(t);
  };

  return {
    table,
    tables,
    myTable,
    running: g.running,
    phase: g.phase,
    round: g.round,
    boot: g.boot,
    stake: g.stake,
    pot: g.pot,
    players: g.players,
    turnIndex: g.turnIndex,
    reveal: g.reveal,
    lastWinners: g.lastWinners,
    lastPrize: g.lastPrize,
    finishedAt: g.finishedAt,
    secondsLeft,
    myCards,
    myHand: mine.key === cardsKey ? mine.hand : "",
    busy,
    revealing,
    selectedBoot,
    setSelectedBoot,
    soundOn,
    setSoundOn: (on) => (setSoundOnRaw(on), writePref("sound", on)),
    autoBlind,
    setAutoBlind: (on) => (setAutoBlindRaw(on), writePref("autoBlind", on)),
    autoCall,
    setAutoCall: (on) => (setAutoCallRaw(on), writePref("autoCall", on)),
    hideMessages,
    setHideMessages: (on) => (setHideRaw(on), writePref("hideMessages", on), setTpHideGameMessages(on)),
    inv,
    myUid: uid,
    showTable: (t: number) => {
      if (myTable > 0 && t !== myTable) {
        noteRef.current(`Teen Patti Bot: Finish your hand at Table ${myTable} first (or pack).`);
        return;
      }
      setTable(t);
    },
    start: (boot?: number) => {
      if (busy) return;
      setBusy(true);
      // The table on screen if it's free, else the server opens the next free one.
      startCall({ boot: boot ?? selectedBoot, table: g.running ? 0 : table, operationId: opId("start") })
        .then(toTable)
        .catch((err: any) => noteRef.current(`Teen Patti Bot: ${errText(err)}`))
        .finally(() => setBusy(false));
    },
    // table = 0 → the table on screen if it's taking seats, else the first open one.
    join: (t = 0) => {
      if (busy) return;
      setBusy(true);
      const pick = t > 0 ? t : g.running && g.phase === "JOINING" ? table : 0;
      joinCall({ table: pick, operationId: opId("join") })
        .then(toTable)
        .catch((err: any) => noteRef.current(`Teen Patti Bot: ${errText(err)}`))
        .finally(() => setBusy(false));
    },
    act,
    invite: async (username: string) => {
      try {
        await inviteCall({ toUsername: username, table });
        return "sent";
      } catch (err: any) {
        const msg = errText(err);
        return /already invited/i.test(msg) ? "already" : msg;
      }
    },
  };
}

// Chat commands in the Teen Patti room. True = handled (not posted as chat).
export function teenPattiHandleCommand(state: TeenPattiState, clean: string, note: (t: string) => void): boolean {
  const lower = clean.trim().toLowerCase();
  if (lower === "!start") {
    state.start();
    return true;
  }
  if (lower.startsWith("!start ")) {
    const amount = Number(lower.slice(7).trim());
    if (!Number.isInteger(amount) || amount < 100 || amount > 50000) {
      note("Teen Patti Bot: Custom boot must be 100 – 50000. Example: !start 500");
    } else {
      state.start(amount);
    }
    return true;
  }
  if (lower === "!j" || lower === "!join") {
    state.join();
    return true;
  }
  if (lower.startsWith("!j ") || lower.startsWith("!join ")) {
    // !j 3 = sit at table 3
    const n = Number(lower.slice(lower.indexOf(" ") + 1).trim().replace(/^t/, ""));
    if (!Number.isInteger(n) || n < 1) note("Teen Patti Bot: Pick a table. Example: !j 2");
    else state.join(n);
    return true;
  }
  if (lower === "!tables" || lower === "!t") {
    const running = state.tables.filter((t) => t.running);
    note(
      running.length === 0
        ? "Teen Patti Bot: No tables running. !start opens one."
        : "Teen Patti Bot: " +
            running
              .map((t) => `T${t.no} ` + (t.phase === "JOINING" ? `${t.seats}/10 seats, boot ${t.boot} (!j ${t.no})` : `${t.seats} playing`))
              .join(" · ")
    );
    return true;
  }
  const actions: Record<string, string> = {
    "!see": "see",
    "!bet": "call",
    "!call": "call",
    "!chaal": "call",
    "!blind": "call",
    "!raise": "raise",
    "!pack": "pack",
    "!fold": "pack",
    "!show": "show",
    "!sideshow": "sideshow",
    "!ss": "sideshow",
  };
  if (actions[lower]) {
    state.act(actions[lower]);
    return true;
  }
  if (lower === "!help") {
    note(
      "Teen Patti Bot: !start [boot] · !j sit (!j 2 = table 2) · !tables · !see cards · !bet call/chaal · !raise · !pack fold · !show (2 left) · !sideshow (seen players)"
    );
    return true;
  }
  return false;
}

// ---------------- Cards (in my style) ----------------
export function TpCardBack({ width, skin = tpCardSkinNow() }: { width: number; skin?: TpCardSkin }) {
  const h = width * 1.38;
  const step = width / 3;
  const lines = [];
  for (let x = -h; x < width + h; x += step) lines.push(x);
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[3px] shadow-sm"
      style={{ width, height: h, background: `linear-gradient(135deg, ${skin.back.join(", ")})`, border: `1px solid ${skin.backLine}` }}
    >
      <svg className="absolute inset-0" width={width} height={h} aria-hidden>
        {lines.map((x) => (
          <g key={x} stroke={skin.backLine} strokeOpacity={0.28} strokeWidth={1}>
            <line x1={x} y1={0} x2={x + h} y2={h} />
            <line x1={x + h} y1={0} x2={x} y2={h} />
          </g>
        ))}
      </svg>
      <span className="relative leading-none" style={{ color: skin.markColor, fontSize: width * 0.45 }}>
        {skin.mark}
      </span>
    </span>
  );
}

export function TpCardFace({ card, width, skin = tpCardSkinNow() }: { card: string; width: number; skin?: TpCardSkin }) {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  const ink = suit === "♥" || suit === "♦" ? skin.red : skin.black;
  return (
    <span
      className="inline-flex shrink-0 flex-col items-center justify-center rounded-[3px] font-extrabold shadow-sm"
      style={{ width, height: width * 1.38, background: `linear-gradient(${skin.face.join(", ")})`, border: `1px solid ${skin.border}`, color: ink }}
    >
      <span style={{ fontSize: width * 0.42, lineHeight: `${width * 0.46}px` }}>{rank}</span>
      <span style={{ fontSize: width * 0.38, lineHeight: `${width * 0.42}px` }}>{suit}</span>
    </span>
  );
}

// 3D button: a lit gradient face, glowing gold edge on my turn.
function TpButton({
  children,
  bg,
  ink = "#FFFFFF",
  disabled,
  glow,
  onClick,
}: {
  children: ReactNode;
  bg: string;
  ink?: string;
  disabled?: boolean;
  glow?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 whitespace-nowrap rounded-[14px] px-[11px] py-1.5 text-[11px] font-extrabold transition active:scale-95 ${glow && !disabled ? "tp-glow" : ""}`}
      style={{
        background: disabled ? `${bg}59` : `linear-gradient(color-mix(in srgb, ${bg}, #fff 22%), color-mix(in srgb, ${bg}, #000 18%))`,
        border: `1px solid ${glow && !disabled ? GOLD : "rgba(255,255,255,.2)"}`,
        color: ink,
        opacity: disabled ? 0.6 : 1,
        boxShadow: disabled ? "none" : "0 2px 4px rgba(0,0,0,.35)",
        ["--tp-glow" as string]: bg,
      }}
    >
      {children}
    </button>
  );
}

// Seat position on the rim: evenly spaced by distance round the oval,
// starting at the bottom (me), like the app's tpSeatOffset.
function seatOffset(rel: number, n: number, rx: number, ry: number): [number, number] {
  if (n <= 1) return [0, ry];
  const steps = 720;
  const lengths = new Float64Array(steps + 1);
  let px = 0;
  let py = ry;
  for (let k = 1; k <= steps; k++) {
    const a = Math.PI / 2 + (2 * Math.PI * k) / steps;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    lengths[k] = lengths[k - 1] + Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  const target = (lengths[steps] * (((rel % n) + n) % n)) / n;
  let k = 0;
  while (k < steps && lengths[k + 1] < target) k++;
  const a = Math.PI / 2 + (2 * Math.PI * k) / steps;
  return [rx * Math.cos(a), ry * Math.sin(a)];
}

const AVATAR_COLORS = ["#3B8BE8", "#E0507C", "#2FAE85", "#8E6CE0", "#E08A2E", "#3FA7C9", "#C2185B"];
const hashOf = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h & 0x7fffffff;
};

/** Little stack of casino chips above the pot. */
function TpChipStack() {
  const chip = (cx: number, top: number, base: string, side: string) => (
    <g>
      <rect x={cx - 11.3} y={top + 2} width={22.7} height={6.4} fill={side} />
      <ellipse cx={cx} cy={top + 6.4 + 4.3} rx={11.3} ry={4.3} fill={side} />
      <ellipse cx={cx} cy={top + 4.3} rx={11.3} ry={4.3} fill={base} />
      <ellipse cx={cx} cy={top + 4.3} rx={10} ry={3.4} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth={1} strokeDasharray="3 2" />
    </g>
  );
  return (
    <svg width={54} height={36} viewBox="0 0 54 36" aria-hidden>
      <ellipse cx={27} cy={31} rx={22.7} ry={4.3} fill="rgba(0,0,0,.33)" />
      {chip(15, 15, "#E53935", "#AC2B28")}
      {chip(39, 14.4, "#1E88E5", "#1766AC")}
      {chip(27, 3.6, "#E8B21E", "#AE8516")}
    </svg>
  );
}

export function TeenPattiTable({
  state,
  uid,
  myUsername,
  roomUsers,
}: {
  state: TeenPattiState;
  uid: string;
  myUsername: string;
  roomUsers: string[];
}) {
  const [raise, setRaise] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<"" | "style" | "invite" | "howto" | "score">("");

  const meIdx = state.players.findIndex((p) => p.uid === uid);
  const me = state.players[meIdx];
  const myTurn = state.phase === "PLAYING" && meIdx >= 0 && state.turnIndex === meIdx;
  const active = state.players.filter((p) => !p.packed);

  // A new turn resets the raise toggle.
  useEffect(() => setRaise(false), [state.table, state.round, state.turnIndex]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (state.running || !state.finishedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state.running, state.finishedAt]);
  // Winner banner for ~15s after a hand ends.
  const justFinished = !state.running && state.lastWinners.length > 0 && state.finishedAt > 0 && now - state.finishedAt < 15000;
  const winnerNames = state.lastWinners.map((w) => state.players.find((p) => p.uid === w)?.username).filter(Boolean);

  const title = !state.running
    ? state.table > 0
      ? `Teen Patti • Table ${state.table}`
      : "Teen Patti"
    : state.phase === "JOINING"
      ? `T${state.table} • Sit down (${state.players.length}/10)`
      : `T${state.table} • Boot ${state.boot} • Chaal ${state.stake}`;

  const iconBtn = "shrink-0 px-1 text-[15px] leading-none";

  return (
    <div className="px-1.5 py-[3px]">
      <div className="overflow-hidden rounded-[18px] bg-[#12052A]">
        {/* Header */}
        <div
          className="relative flex items-center px-2.5 py-[5px]"
          style={{ background: "linear-gradient(90deg, #1A0730, #4A0E4E, #1A0730)" }}
        >
          <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
          <span className="text-base">🎴</span>
          <span className="ml-1.5 min-w-0 flex-1 truncate text-[13px] font-extrabold [text-shadow:1px_2px_4px_rgba(0,0,0,.67)]" style={{ color: GOLD }}>
            {title}
          </span>
          {state.running && state.secondsLeft > 0 && (
            <span
              className="mr-1.5 shrink-0 rounded-[10px] px-[7px] py-0.5 text-[11px] font-bold text-white"
              style={{ background: state.secondsLeft <= 5 ? "#B71C1C" : "rgba(255,255,255,.2)" }}
            >
              ⏱ {state.secondsLeft}s
            </span>
          )}
          <button type="button" className={iconBtn} onClick={() => setDialog("style")} aria-label="Styles">
            🎨
          </button>
          <button type="button" className={iconBtn} onClick={() => state.setSoundOn(!state.soundOn)} aria-label="Sound">
            {state.soundOn ? "🔊" : "🔇"}
          </button>
          <span className="relative">
            <button type="button" className={iconBtn} onClick={() => setMenu((v) => !v)} aria-label="Menu">
              ⚙️
            </button>
            {menu && (
              <>
                <span className="fixed inset-0 z-[60]" onClick={() => setMenu(false)} />
                <span className="absolute right-0 top-7 z-[61] flex w-52 flex-col overflow-hidden rounded-xl bg-white py-1 text-left text-sm text-[#1b1b1f] shadow-xl">
                  {(
                    [
                      ["🏆 Scoreboard", () => (setMenu(false), setDialog("score"))],
                      ["📖 How to play", () => (setMenu(false), setDialog("howto"))],
                      [`${state.hideMessages ? "✓ " : ""}Hide game messages`, () => state.setHideMessages(!state.hideMessages)],
                      [`Sound & vibration ${state.soundOn ? "on" : "off"}`, () => state.setSoundOn(!state.soundOn)],
                      [`${state.autoBlind ? "✓ " : ""}Auto blind`, () => state.setAutoBlind(!state.autoBlind)],
                      [`${state.autoCall ? "✓ " : ""}Auto call`, () => state.setAutoCall(!state.autoCall)],
                    ] as [string, () => void][]
                  ).map(([label, fn]) => (
                    <button key={label} type="button" onClick={fn} className="px-4 py-2.5 text-left hover:bg-black/5">
                      {label}
                    </button>
                  ))}
                </span>
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="ml-1 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-white/15 text-[15px] font-bold text-white"
            style={{ border: `1px solid ${GOLD}b3` }}
          >
            {collapsed ? "+" : "−"}
          </button>
        </div>

        {!collapsed && <TpTablesStrip state={state} />}

        {justFinished && (
          <div className="tp-banner mx-2 my-1 rounded-xl py-1.5 text-center text-xs font-extrabold text-[#221100] shadow-[0_0_12px_rgba(232,184,74,.6)]">
            🏆 {winnerNames.join(", ")} won {state.lastPrize.toLocaleString()} coins! 🎉
          </div>
        )}

        {!collapsed && (
          <>
            <TpOvalTable state={state} uid={uid} meIdx={meIdx} justFinished={justFinished} onInvite={() => setDialog("invite")} />

            {/* Action bar */}
            <div className="flex items-center gap-[5px] overflow-x-auto px-2 py-1 [scrollbar-width:none]">
              {!state.running ? (
                <>
                  {justFinished && <span className="shrink-0 text-[11px] text-white/85">✅ Hand complete · </span>}
                  {BOOT_OPTIONS.map((b) => (
                    <TpButton key={b} bg={state.selectedBoot === b ? GOLD : "#3A2356"} ink={state.selectedBoot === b ? "#221100" : "#FFFFFF"} onClick={() => state.setSelectedBoot(b)}>
                      {b}
                    </TpButton>
                  ))}
                  <TpButton bg="#2E9E5B" disabled={state.busy} onClick={() => state.start()}>
                    {"▶︎ Start"}
                  </TpButton>
                </>
              ) : state.phase === "JOINING" && !me ? (
                <TpButton bg="#2E9E5B" disabled={state.busy} onClick={() => state.join()}>
                  🪑 Sit down • {state.boot}
                </TpButton>
              ) : state.phase === "JOINING" ? (
                <>
                  <span className="shrink-0 text-xs text-white">✅ Seated — waiting for the deal…</span>
                  <TpButton bg="#6A1B9A" onClick={() => setDialog("invite")}>
                    ✉ Invite
                  </TpButton>
                </>
              ) : !me ? (
                <span className="text-xs text-white/80">👀 Watching this hand</span>
              ) : me.packed ? (
                <span className="text-xs text-white/80">🚫 You packed · watching this hand</span>
              ) : (
                (() => {
                  const call = me.seen ? state.stake : state.stake / 2;
                  const raiseAmt = me.seen ? state.stake * 2 : state.stake;
                  const canRaise = state.stake < state.boot * 128;
                  const amount = raise && canRaise ? raiseAmt : call;
                  return (
                    <>
                      {/* My cards sit here (not in the middle of the table) once seen. */}
                      {state.myCards.length === 3 && (
                        <span className="flex shrink-0 items-center gap-0.5">
                          {state.myCards.map((c, k) => (
                            <TpCardFace key={k} card={c} width={20} />
                          ))}
                          <span className="ml-0.5 text-[9px] font-bold" style={{ color: GOLD }}>
                            {state.myHand}
                          </span>
                        </span>
                      )}
                      <TpButton bg="#C62828" disabled={state.busy} onClick={() => state.act("pack")}>
                        ✖ Pack
                      </TpButton>
                      {!me.seen && (
                        <TpButton bg="#1565C0" disabled={state.busy} onClick={() => state.act("see")}>
                          {state.revealing ? "Revealing…" : "👁 See"}
                        </TpButton>
                      )}
                      <TpButton bg="#3A2356" disabled={!raise} onClick={() => setRaise(false)}>
                        −
                      </TpButton>
                      <span className="shrink-0 rounded-xl bg-white/20 px-2.5 py-[5px] text-[11px] font-extrabold" style={{ border: `1px solid ${GOLD}`, color: GOLD }}>
                        🪙 {amount}
                      </span>
                      <TpButton bg="#3A2356" disabled={raise || !canRaise} onClick={() => setRaise(true)}>
                        +
                      </TpButton>
                      <TpButton bg="#2E9E5B" disabled={!myTurn || state.busy} glow={myTurn} onClick={() => state.act(raise && canRaise ? "raise" : "call")}>
                        {!myTurn ? "Waiting" : me.seen ? (raise ? "Raise" : "Chaal") : raise ? "Raise blind" : "Blind"}
                      </TpButton>
                      {active.length === 2 ? (
                        <TpButton bg="#6A1B9A" disabled={!myTurn || state.busy} onClick={() => state.act("show")}>
                          🃏 Show
                        </TpButton>
                      ) : me.seen ? (
                        <TpButton bg="#6A1B9A" disabled={!myTurn || state.busy} onClick={() => state.act("sideshow")}>
                          🤝 Side show
                        </TpButton>
                      ) : null}
                    </>
                  );
                })()
              )}
            </div>
          </>
        )}
      </div>

      {dialog === "style" && <TpStyleDialog inv={state.inv} onClose={() => setDialog("")} />}
      {dialog === "invite" && <TpInviteDialog state={state} myUsername={myUsername} roomUsers={roomUsers} onClose={() => setDialog("")} />}
      {dialog === "howto" && (
        <TpInfoDialog title="📖 How to play Teen Patti" onClose={() => setDialog("")} button="Got it">
          <p className="whitespace-pre-line text-[13px] leading-5">
            {"• !start [boot] opens a table, !j (or tap a + seat) to sit. 2–10 players, each pays the boot.\n" +
              "• Everyone starts BLIND — blind bets cost half. Tap 👁 See (or !see) to look at your cards; only you see them.\n" +
              "• On your turn (15s): Chaal/Blind = call, + then Raise = double, Pack = fold.\n" +
              "• Show (2 players left): both hands are compared. Side show (3+ left, both seen): you and the previous player compare, the loser packs.\n" +
              "• Hands, best first: Trail (three of a kind) › Pure Sequence › Sequence › Color › Pair › High Card. A-K-Q is the top sequence, A-2-3 the second.\n" +
              "• Last player in — or the better hand at a Show — wins 90% of the pot."}
          </p>
        </TpInfoDialog>
      )}
      {dialog === "score" && <TpScoreboard onClose={() => setDialog("")} />}
    </div>
  );
}

/**
 * 🎴 Unlimited tables: a chip per running table + "＋ New table". One group
 * plays at Table 1 while others play at Table 2, 3 … — each phone shows its own.
 */
function TpTablesStrip({ state }: { state: TeenPattiState }) {
  const shown = state.tables.filter((t) => t.running || t.no === state.table);
  if (shown.length === 0 && state.table === 0) return null;
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-2 py-[5px] [scrollbar-width:none]">
      {shown.map((t) => {
        const on = t.no === state.table;
        const label = !t.running ? `T${t.no}` : t.phase === "JOINING" ? `T${t.no} · ${t.seats}/10 · join` : `T${t.no} · ${t.seats}👤 · live`;
        const dot = !t.running ? "#9E9E9E" : t.phase === "JOINING" ? "#FFC107" : "#2EE59D";
        return (
          <button
            key={t.no}
            type="button"
            onClick={() => state.showTable(t.no)}
            className="flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{
              background: on ? `linear-gradient(90deg, ${GOLD_DARK}, ${GOLD}, ${GOLD_DARK})` : "rgba(255,255,255,.13)",
              border: `1px solid ${t.mine ? "#FFE08A" : "rgba(255,255,255,.2)"}`,
              color: on ? "#221100" : "#FFFFFF",
            }}
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
          style={{
            background: state.table === 0 ? GOLD : "rgba(255,255,255,.13)",
            border: `1px solid ${GOLD}99`,
            color: state.table === 0 ? "#221100" : GOLD,
          }}
        >
          ＋ New table
        </button>
      )}
    </div>
  );
}

function TpOvalTable({
  state,
  uid,
  meIdx,
  justFinished,
  onInvite,
}: {
  state: TeenPattiState;
  uid: string;
  meIdx: number;
  justFinished: boolean;
  onInvite: () => void;
}) {
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

  const sk = isClassicNow() ? TP_CLASSIC_TABLE : tableSkinOf(state.inv.active.table);
  const winners = new Set(state.lastWinners);
  const busy = state.running || justFinished;
  const aspect = busy ? 1.7 : 2.8;
  const h = w / aspect;
  const padX = busy ? 26 : 40;
  const padTop = busy ? 22 : 10;
  const padBottom = busy ? 36 : 10;
  const ow = Math.max(0, w - padX * 2);
  const oh = Math.max(0, h - padTop - padBottom);
  const centerY = padTop + oh / 2;
  const rx = ow / 2 - 4;
  const ry = oh / 2 - 2;
  const n = state.phase === "JOINING" ? 10 : busy ? state.players.length : 0;
  const rel = (i: number) => (meIdx >= 0 ? (i - meIdx + n) % n : i);
  const showEmpty = state.phase === "JOINING" && meIdx < 0;

  return (
    <div
      ref={boxRef}
      className="relative mx-1.5 my-1 overflow-hidden rounded-[20px]"
      style={{ aspectRatio: String(aspect), background: `linear-gradient(${sk.bg.join(", ")})` }}
    >
      {[
        [7, 9], [43, 5], [86, 12], [95, 40], [4, 55], [13, 90], [80, 88], [62, 95], [30, 97],
      ].map(([x, y]) => (
        <span key={`${x}${y}`} className="absolute h-1 w-1 rounded-full bg-[#B48CC8]/35" style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
      {w > 0 && (
        <>
          {/* wood rim → ring → felt */}
          <div
            className="absolute rounded-[50%] p-1.5"
            style={{ left: padX, top: padTop, width: ow, height: oh, background: `linear-gradient(${sk.rim.join(", ")})`, boxShadow: `0 8px 24px ${sk.glow}73` }}
          >
            <div className="h-full w-full rounded-[50%] p-[3px]" style={{ background: `linear-gradient(135deg, ${sk.ring.join(", ")})` }}>
              <div
                className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[50%]"
                style={{ background: `radial-gradient(ellipse, ${sk.felt[0]}, ${sk.felt[1]} 60%, ${sk.felt[2]})` }}
              >
                <span className="absolute left-[17%] top-[20%] h-[60%] w-[66%] rounded-[50%] border-2 border-dashed" style={{ borderColor: `${sk.line}8c` }} />
                <span className="absolute left-[14%] top-[8%] h-[42%] w-[72%] rounded-[50%] bg-gradient-to-b from-white/20 to-white/[0.04]" />
                <span className="relative text-[13px] font-bold tracking-[5px]" style={{ color: `${sk.logo}d9` }}>
                  miGlife
                </span>
                <span className="relative">
                  <TpChipStack />
                </span>
                <span
                  className="relative rounded-full px-3.5 py-0.5 text-sm font-extrabold text-[#FFD166]"
                  style={{ background: "#2A0A1E", border: "1.5px solid #E6BE5A" }}
                >
                  {state.running ? `POT ${state.pot.toLocaleString()}` : "Type !start"}
                </span>
                {state.phase === "JOINING" && (
                  <span className="relative text-[9px] text-white/80">
                    boot {state.boot} · {state.players.length}/10 seats
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* empty seats while people sit down */}
          {state.phase === "JOINING" &&
            Array.from({ length: n - state.players.length }, (_, j) => state.players.length + j).map((slot) => {
              const [dx, dy] = seatOffset(rel(slot), n, rx, ry);
              return (
                <button
                  key={`e${slot}`}
                  type="button"
                  disabled={state.busy}
                  onClick={() => (showEmpty ? state.join() : onInvite())}
                  className="absolute flex h-11 w-[52px] flex-col items-center justify-center"
                  style={{ left: w / 2 + dx - 26, top: centerY + dy - 22 }}
                >
                  <span
                    className="tp-seat flex h-6 w-6 items-center justify-center rounded-full text-[15px] font-bold leading-none text-white"
                    style={{ background: "radial-gradient(rgba(255,255,255,.33), rgba(0,0,0,.13))", border: `1.5px solid ${GOLD}` }}
                  >
                    +
                  </span>
                  <span className="text-[8px] font-extrabold" style={{ color: GOLD }}>
                    {showEmpty ? "Sit" : "Invite"}
                  </span>
                </button>
              );
            })}

          {/* players */}
          {n > 0 &&
            state.players.map((p, i) => {
              const [dx, dy] = seatOffset(rel(i), n, rx, ry);
              const isMe = p.uid === uid;
              const isTurn = state.phase === "PLAYING" && state.turnIndex === i;
              const won = !state.running && (winners.has(p.uid) || winners.has(p.username));
              const cards = isMe && state.myCards.length === 3 ? state.myCards : state.reveal[p.uid]?.cards || [];
              const showCards = state.phase !== "JOINING";
              const yellow = isTurn || won;
              const frac = won ? 1 : isTurn ? Math.min(1, Math.max(0, state.secondsLeft / 15)) : 0;
              const color = AVATAR_COLORS[hashOf(p.uid) % AVATAR_COLORS.length];
              return (
                <div
                  key={p.uid}
                  className={`absolute flex w-[74px] flex-col items-center ${p.packed ? "opacity-55" : ""}`}
                  style={{ left: w / 2 + dx - 37, top: centerY + dy - 24 }}
                >
                  <div className="relative h-12 w-[74px]">
                    <div
                      className={`absolute left-1/2 top-0 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full ${yellow ? "shadow-[0_0_16px_rgba(255,200,61,.6)]" : ""} ${isTurn ? "tp-turn" : ""}`}
                      style={{ background: `conic-gradient(#FFC83D ${frac * 360}deg, #2A1E3A 0)` }}
                    >
                      <span
                        className="flex h-[38px] w-[38px] items-center justify-center rounded-full text-[17px] font-bold text-white ring-[1px] ring-[#12052A]"
                        style={{ background: `radial-gradient(circle, ${color}BF, ${color})` }}
                      >
                        {(p.username[0] || "?").toUpperCase()}
                      </span>
                      {won && <span className="absolute -top-3 text-[13px]">👑</span>}
                    </div>
                    {showCards && !p.packed && (
                      <div className="absolute -right-2.5 -top-1 h-[26px] w-[30px]">
                        {[-12, 0, 12].map((angle, k) => (
                          <span key={k} className="absolute" style={{ left: k * 7, top: k === 1 ? -1 : 1, transform: `rotate(${angle}deg)` }}>
                            {cards.length === 3 ? <TpCardFace card={cards[k]} width={15} /> : <TpCardBack width={15} />}
                          </span>
                        ))}
                      </div>
                    )}
                    {showCards && !won && (
                      <span
                        className={`absolute left-0 top-0 rounded-[5px] px-[3px] text-[6px] font-extrabold ${
                          p.packed ? "bg-[#8E2424] text-white" : p.seen ? "bg-[#E0A800] text-[#1B1200]" : "bg-[#37294A] text-white"
                        }`}
                      >
                        {p.packed ? "PACK" : p.seen ? "SEEN" : "BLIND"}
                      </span>
                    )}
                  </div>
                  <span
                    className={`mt-0.5 max-w-[74px] truncate rounded-full px-[7px] text-center text-[10px] font-bold ${
                      yellow
                        ? "bg-gradient-to-b from-[#FFE07A] to-[#FFC83D] text-[#221400]"
                        : `bg-gradient-to-b from-[#2A1740]/90 to-[#160A26]/90 text-white ${isMe ? "ring-1 ring-white/80" : ""}`
                    }`}
                  >
                    {isMe ? "You" : p.username}
                    {isTurn && state.secondsLeft > 0 ? ` · ${state.secondsLeft}s` : ""}
                  </span>
                </div>
              );
            })}
        </>
      )}
    </div>
  );
}

function TpTablePreview({ sk }: { sk: TpTableSkin }) {
  return (
    <div className="relative aspect-[1.6] w-full overflow-hidden rounded-[10px]" style={{ background: `linear-gradient(${sk.bg.join(", ")})` }}>
      <div className="absolute inset-[8%_5%] rounded-[50%] p-[3%]" style={{ background: `linear-gradient(${sk.rim.join(", ")})` }}>
        <div className="h-full w-full rounded-[50%] p-[2px]" style={{ background: `linear-gradient(135deg, ${sk.ring.join(", ")})` }}>
          <div className="relative h-full w-full rounded-[50%]" style={{ background: `radial-gradient(ellipse, ${sk.felt.join(", ")})` }}>
            <span className="absolute left-[24%] top-[25%] h-1/2 w-[52%] rounded-[50%] border border-dashed" style={{ borderColor: `${sk.line}8c` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TpStyleDialog({ inv, onClose }: { inv: Inventory; onClose: () => void }) {
  return (
    <StyleShopDialog
      title="🎨 Teen Patti Style"
      subtitle="1 of each is free · the rest from 50,000 coins · bought styles are saved to your account"
      theme={{ bg: "linear-gradient(#2A0A3E, #12052A)", border: GOLD, title: GOLD, sub: "rgba(255,255,255,.55)", accent: `linear-gradient(90deg, ${GOLD_DARK}, ${GOLD}, ${GOLD_DARK})`, accentInk: "#221100" }}
      tabs={[
        { label: "Table", kind: "table", items: TP_TABLE_SKINS, noun: "table", perRow: 2, preview: (s: TpTableSkin) => <TpTablePreview sk={s} /> },
        {
          label: "Cards",
          kind: "card",
          items: TP_CARD_SKINS,
          noun: "card style",
          perRow: 3,
          preview: (s: TpCardSkin) => (
            <span className="flex justify-center gap-[3px] py-2">
              <TpCardBack width={22} skin={s} />
              <TpCardFace card="A♥" width={22} skin={s} />
              <TpCardFace card="K♠" width={22} skin={s} />
            </span>
          ),
        },
      ]}
      inv={inv}
      buyFn="buyTeenPattiItem"
      setFn="setTeenPattiStyle"
      opPrefix="tp"
      onClose={onClose}
    />
  );
}

function TpInfoDialog({ title, button, onClose, children }: { title: string; button: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 text-[#1b1b1f]" onClick={(e) => e.stopPropagation()}>
        <p className="mb-3 text-lg font-bold">{title}</p>
        {children}
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="px-2 text-sm font-bold text-[#6750A4]">
            {button}
          </button>
        </div>
      </div>
    </div>
  );
}

function TpScoreboard({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<ScoreRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    getDocs(query(collection(db, "tp_scores"), orderBy("wins", "desc"), limit(20)))
      .then((qs) =>
        setRows(
          qs.docs.map((d) => ({
            username: String(d.get("username") || ""),
            hands: Number(d.get("hands") || 0),
            wins: Number(d.get("wins") || 0),
            net: Number(d.get("net") || 0),
          }))
        )
      )
      .catch(() => setFailed(true));
  }, []);
  return (
    <TpInfoDialog title="🏆 Teen Patti Scoreboard" button="Close" onClose={onClose}>
      {failed ? (
        <p className="text-xs">Could not load the scoreboard. Please try again.</p>
      ) : rows === null ? (
        <p className="text-xs text-black/50">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs">No hands played yet.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center text-xs">
              <span className="min-w-0 flex-1 truncate font-bold">
                {i + 1}. {r.username}
              </span>
              <span className="text-[11px] text-[#555]">
                {r.wins}W / {r.hands}
              </span>
              <span className={`ml-2 text-[11px] font-bold ${r.net >= 0 ? "text-[#1E7A34]" : "text-[#C62828]"}`}>
                {r.net >= 0 ? "+" : ""}
                {r.net.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </TpInfoDialog>
  );
}

/** ✉ Invite people in the room and friends (accepted friend requests, both directions). */
function TpInviteDialog({ state, myUsername, roomUsers, onClose }: { state: TeenPattiState; myUsername: string; roomUsers: string[]; onClose: () => void }) {
  const [friends, setFriends] = useState<string[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!myUsername) return;
    const accepted = (field: string, other: string) =>
      getDocs(query(collection(db, "friend_requests"), where("status", "==", "accepted"), where(field, "==", myUsername)))
        .then((q) => q.docs.map((d) => String(d.get(other) || "").trim()).filter(Boolean))
        .catch(() => [] as string[]);
    Promise.all([accepted("fromUsername", "toUsername"), accepted("toUsername", "fromUsername")]).then(([a, b]) => setFriends([...a, ...b]));
  }, [myUsername]);
  const seated = new Set(state.players.map((p) => p.username.toLowerCase()));
  const me = myUsername.toLowerCase();
  const uniq = (list: string[]) => {
    const seen = new Set<string>();
    return list.filter((n) => {
      const k = n.toLowerCase();
      if (!n.trim() || seated.has(k) || k === me || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const inRoom = uniq(roomUsers).sort((a, b) => a.localeCompare(b));
  const roomSet = new Set(inRoom);
  const friendList = uniq(friends)
    .filter((n) => !roomSet.has(n))
    .sort((a, b) => a.localeCompare(b));

  const row = (name: string) => {
    const done = sent.has(name);
    return (
      <div key={name} className="flex items-center">
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#7B1FA2] text-[10px] font-bold text-white">
          {name.slice(0, 2).toUpperCase()}
        </span>
        <span className="ml-2 min-w-0 flex-1 truncate text-[13px]">{name}</span>
        <button
          type="button"
          disabled={done || sending === name}
          onClick={async () => {
            setSending(name);
            const r = await state.invite(name);
            setSending(null);
            if (r === "sent" || r === "already") setSent((s) => new Set(s).add(name));
            else setError(r);
          }}
          className="px-2 py-1 text-sm font-bold text-[#6750A4] disabled:text-black/35"
        >
          {done ? "✓ Sent" : sending === name ? "…" : "Invite"}
        </button>
      </div>
    );
  };

  return (
    <TpInfoDialog title="✉ Invite to the table" button="Done" onClose={onClose}>
      {error && <p className="mb-2 text-xs font-bold text-[#C62828]">{error}</p>}
      <div className="space-y-1">
        <p className="text-xs font-bold text-[#6A1B9A]">In this room</p>
        {inRoom.length === 0 ? <p className="text-[11px] text-black/45">Nobody else here right now.</p> : inRoom.map(row)}
        <p className="pt-1.5 text-xs font-bold text-[#6A1B9A]">Friends</p>
        {friendList.length === 0 ? <p className="text-[11px] text-black/45">No other friends to invite.</p> : friendList.map(row)}
        <p className="pt-1 text-[10px] text-black/45">They get an alert + notification. Joining closes when the cards are dealt.</p>
      </div>
    </TpInfoDialog>
  );
}
