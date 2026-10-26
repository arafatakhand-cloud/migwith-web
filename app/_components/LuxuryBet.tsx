"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { LbStyleDialog, lbBoxStyle, lbSkinNow, lbIsGlass, lbTileFace, lbChipFace, lbValueColor, lbHasShine } from "./LuxuryBot";
import { LB_KINDS, useInventory } from "./StyleShop";
import { useRememberedAmount } from "../../lib/amountMemory";
import { awardUserXp } from "../../lib/xp";

// 🎰 Luxury Bet — Luxury Bot's game with new characters, run ENTIRELY by the
// server (startLuxuryBet / placeLuxuryBet / tickLuxuryBet). The web only shows
// the round and sends !start / bets, same as the app's LuxuryBetGame.kt.
// Commands: !start · !b [k|q|p|f|w|a or name] [amount]   (e.g. !b k 1000)

export const LUXURY_BET_ROOM = "🎰 Luxury Bet";
const LB_BOT = "🎰 Luxury Bet";

export const LUXURY_BET_CHARACTERS = ["🫅 King", "👸 Queen", "🤴 Prince", "🧚‍♀️ Fairy", "🧙‍♂️ Wizard", "👼 Angel"];

// 🖼️ Picture cards for the tiles (miglife's own Royal Bet art — public/lb/).
const ART: Record<string, string> = {
  King: "/lb/king.webp",
  Queen: "/lb/queen.webp",
  Prince: "/lb/prince.webp",
  Fairy: "/lb/fairy.webp",
  Wizard: "/lb/wizard.webp",
  Angel: "/lb/angel.webp",
};

/** Each character's own colour (top, bottom) — its name plate and chat circle. */
export const LUXURY_BET_COLORS: Record<string, [string, string]> = {
  King: ["#F5C542", "#B07A06"],
  Queen: ["#F0405E", "#A3122E"],
  Prince: ["#3D7BFF", "#1438A8"],
  Fairy: ["#FF5FA8", "#C21E6E"],
  Wizard: ["#8B4DFF", "#4B1BA8"],
  Angel: ["#2FC46B", "#0E7A3E"],
};

/** Each character's emoji → its picture card (for the bot's chat lines). */
export const LUXURY_BET_ART_BY_EMOJI: Record<string, { src: string; col: [string, string] }> = Object.fromEntries(
  LUXURY_BET_CHARACTERS.flatMap((c) => {
    const [emoji, ...rest] = c.split(" ");
    const label = rest.join(" ");
    const src = ART[label];
    const art = src ? { src, col: LUXURY_BET_COLORS[label] ?? ["#8B4DFF", "#4B1BA8"] } : null;
    // also without the trailing U+FE0F, in case a line drops it
    return art ? [[emoji, art], [emoji.replace(/\uFE0F$/, ""), art]] : [];
  })
);

const CODES: Record<string, string> = {
  k: "🫅 King",
  q: "👸 Queen",
  p: "🤴 Prince",
  f: "🧚‍♀️ Fairy",
  w: "🧙‍♂️ Wizard",
  a: "👼 Angel",
};

const CHIPS = [500, 1000, 2000, 5000, 10000, 12000];

const startCall = httpsCallable(functions, "startLuxuryBet");
const betCall = httpsCallable<unknown, { bets?: Record<string, number> }>(functions, "placeLuxuryBet");
const tickCall = httpsCallable(functions, "tickLuxuryBet");

function totalLabel(total: number): string {
  if (total <= 0) return "0";
  if (total < 1000) return String(total);
  if (total % 1000 === 0) return `${total / 1000}k`;
  return `${(total / 1000).toFixed(1)}k`;
}

// 🔓 Luxury Bet is open for everyone now — no test list any more (the app's
// LuxuryBetAccess.canSee() is always true and the server no longer checks it).
export type LuxuryBetAccess = { canSee: boolean };
export function useLuxuryBetAccess(uid: string | undefined): LuxuryBetAccess {
  return { canSee: !!uid };
}

function characterFor(input: string): string | null {
  const key = input.trim().toLowerCase();
  if (!key) return null;
  if (CODES[key]) return CODES[key];
  return LUXURY_BET_CHARACTERS.find((c) => c.split(" ").slice(1).join(" ").toLowerCase() === key) ?? null;
}

export type LuxuryBetState = {
  canSee: boolean;
  running: boolean;
  phase: string;
  round: number;
  secondsLeft: number;
  myBets: Record<string, number>;
  starting: boolean;
  inFlight: number;
  lastBet: { character: string; amount: number } | null;
  start: () => void;
  /** typedTries > 0: a typed "!b" — waits its turn (that many tries) instead of being dropped. */
  bet: (character: string, amount: number, typedTries?: number) => void;
  /** 2x: places my bets of this round again, so every bet is doubled. */
  double: () => void;
  doubling: boolean;
};

export function useLuxuryBet(
  enabled: boolean,
  uid: string | undefined,
  note: (t: string) => void
): LuxuryBetState | null {
  const access = useLuxuryBetAccess(enabled ? uid : undefined);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("IDLE");
  const [phaseEndsAt, setPhaseEndsAt] = useState(0);
  const [round, setRound] = useState(0);
  const [myBets, setMyBets] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const [starting, setStarting] = useState(false);
  const [inFlight, setInFlight] = useState(0);
  const [lastBet, setLastBet] = useState<{ character: string; amount: number } | null>(null);
  const lastTick = useRef(0);
  const lastBetSentAt = useRef(0);
  const [doubling, setDoubling] = useState(false);
  const doublingRef = useRef(false);
  const doubleDoneAt = useRef(0);
  const betLatest = useRef<((character: string, amount: number, typedTries?: number) => void) | null>(null);
  const endsAtRef = useRef(0);
  endsAtRef.current = phaseEndsAt;
  const noteRef = useRef(note);
  noteRef.current = note;

  // Live game document (written only by the server).
  useEffect(() => {
    if (!enabled || !uid) return;
    return onSnapshot(doc(db, "room_game", LUXURY_BET_ROOM), (snap) => {
      setRunning(snap.get("gameRunning") === true);
      setPhase(String(snap.get("phase") || "IDLE"));
      setPhaseEndsAt(Number(snap.get("phaseEndsAt") || 0));
      setRound(Number(snap.get("roundNumber") || 0));
    });
  }, [enabled, uid]);

  // ⚡ Keep the server functions awake so ▶ / bets / the result never wait for
  // a cold start: between rounds the ▶ one, during a round the bet + result
  // ones ({ warm: true } does nothing else on the server).
  useEffect(() => {
    if (!enabled || !uid) return;
    const warm = (c: typeof startCall) => c({ warm: true }).catch(() => null);
    if (running) {
      warm(betCall as typeof startCall);
      warm(tickCall);
    } else {
      // The ▶ one only when the server already knows "warm" (the bet one answers
      // { warm: true }): an older server would START a round on that call.
      warm(betCall as typeof startCall).then((r) => {
        if ((r?.data as { warm?: boolean } | undefined)?.warm === true) warm(startCall);
      });
    }
  }, [enabled, uid, running]);

  // My own bets this round (lb_bets/{round}_{uid}); a new round starts clean.
  useEffect(() => {
    setMyBets({});
    setLastBet(null);
    if (!enabled || !uid || round <= 0) return;
    return onSnapshot(doc(db, "room_game", LUXURY_BET_ROOM, "lb_bets", `${round}_${uid}`), (snap) => {
      if (!snap.exists()) return;
      setMyBets(((snap.get("bets") || {}) as Record<string, number>) ?? {});
    });
  }, [enabled, uid, round]);

  // Countdown, and "the timer ran out → ask the server to close the round".
  // The server decides; asking twice (or from many phones) is harmless.
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      const due = running && ((phase === "BETTING" && n >= phaseEndsAt + 500) || phase === "SETTLING");
      if (due && n - lastTick.current > 4000) {
        lastTick.current = n;
        tickCall().catch(() => {});
      }
    }, 250);
    return () => clearInterval(t);
  }, [enabled, running, phase, phaseEndsAt]);

  if (!enabled) return null;

  const secondsLeft =
    running && phase === "BETTING" ? Math.max(0, Math.ceil((phaseEndsAt - now) / 1000)) : 0;

  const start = () => {
    if (running) return noteRef.current(`${LB_BOT}: A round is already running.`);
    if (starting) return;
    setStarting(true);
    startCall()
      .catch((e: any) => noteRef.current(`${LB_BOT}: Could not start — ${e?.message || "please try again."}`))
      .finally(() => setStarting(false));
  };

  const bet = (character: string, amount: number, typedTries = 0) => {
    if (!running || phase !== "BETTING" || secondsLeft <= 0) {
      noteRef.current(`${LB_BOT}: Betting is closed. Type !start to start a new round.`);
      return;
    }
    if (amount < 100 || amount > 12000) {
      noteRef.current(`${LB_BOT}: Bet amount must be 100-12000 coins.`);
      return;
    }
    // Fast taps are dropped silently (the server takes one bet per ~0.8 s).
    // A TYPED "!b f 12000" is never dropped: it waits its turn and is sent then.
    const t = Date.now();
    if (inFlight > 0 || doublingRef.current || t - lastBetSentAt.current < 850) {
      if (typedTries > 0) {
        const wait = Math.max(300, 900 - (t - lastBetSentAt.current));
        setTimeout(() => betLatest.current?.(character, amount, typedTries - 1), wait);
      }
      return;
    }
    lastBetSentAt.current = t;
    setInFlight((n) => n + 1);
    betCall({
      character,
      amount,
      roundNumber: round,
      operationId: crypto.randomUUID().replace(/-/g, ""),
    })
      .then(({ data }) => {
        if (data?.bets) setMyBets(data.bets);
        setLastBet({ character, amount });
        // ⭐ +3 XP for a successful bet (15 s cooldown), like the app's LuxuryBetGame.kt
        awardUserXp(uid, 3, "luxury_bot_bet", 15_000);
      })
      .catch((e: any) => {
        // "Betting too fast" is never shown: nothing was charged for that tap.
        if (String(e?.code || "").includes("resource-exhausted")) return;
        noteRef.current(`${LB_BOT}: ${e?.message || "Bet failed."}`);
      })
      .finally(() => setInFlight((n) => Math.max(0, n - 1)));
  };

  betLatest.current = bet;

  // 2x — every character I bet on this round gets the same amount again
  // (Prince 36k → 72k), in bids of up to 12,000, one after another (the server
  // takes one bid per ~0.8 s), never past 500,000 for the round.
  const double = () => {
    if (doublingRef.current || Date.now() - doubleDoneAt.current < 2000) return;
    if (!running || phase !== "BETTING" || secondsLeft <= 0) {
      noteRef.current(`${LB_BOT}: Betting is closed. Type !start to start a new round.`);
      return;
    }
    const mine = Object.entries(myBets).filter(([, v]) => Number(v) > 0);
    if (mine.length === 0) {
      noteRef.current(`${LB_BOT}: Place a bet first, then tap 2x to double it.`);
      return;
    }
    const total = mine.reduce((a, [, v]) => a + Number(v), 0);
    let room = Math.max(0, 500_000 - total);
    const queue: [string, number][] = [];
    for (const [character, v] of mine) {
      let left = Math.min(Number(v), room);
      room -= left;
      while (left >= 100) {
        const amount = Math.min(12_000, left);
        queue.push([character, amount]);
        left -= amount;
      }
    }
    if (queue.length === 0) {
      noteRef.current(`${LB_BOT}: You already reached 500,000 for this round.`);
      return;
    }
    doublingRef.current = true;
    setDoubling(true);
    setInFlight((n) => n + 1);
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
    const before: Record<string, number> = Object.fromEntries(mine.map(([c, v]) => [c, Number(v)]));
    let after: Record<string, number> = { ...before };
    (async () => {
      let stopped = false;
      try {
        for (const [character, amount] of queue) {
          if (Date.now() >= endsAtRef.current) { stopped = true; break; } // the round closed
          // one bid per ~1.2 s; "Betting too fast" (nothing charged) → wait and send the SAME bid again,
          // so a 2x never stops halfway (it used to: 40k → 52k instead of 80k)
          let sent = false;
          for (let attempt = 0; attempt < 4 && !sent; attempt++) {
            const wait = (attempt === 0 ? 1200 : 1600) - (Date.now() - lastBetSentAt.current);
            if (wait > 0) await sleep(wait);
            if (Date.now() >= endsAtRef.current) break;
            lastBetSentAt.current = Date.now();
            try {
              const { data } = await betCall({
                character,
                amount,
                roundNumber: round,
                operationId: crypto.randomUUID().replace(/-/g, ""),
              });
              if (data?.bets) {
                setMyBets(data.bets);
                after = { ...after, ...Object.fromEntries(Object.entries(data.bets).map(([c, v]) => [c, Number(v)])) };
              }
              setLastBet({ character, amount });
              sent = true;
            } catch (e: any) {
              if (!String(e?.code || "").includes("resource-exhausted")) throw e;
            }
          }
          if (!sent) { stopped = true; break; }
        }
        awardUserXp(uid, 3, "luxury_bot_bet", 15_000);
        const label = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);
        const fmt = (n: number) => n.toLocaleString("en-US");
        const parts = Object.keys(before).map((c) => `${label(c)} ${fmt(before[c])} → ${fmt(after[c] ?? before[c])}`);
        noteRef.current(`${LB_BOT}: ${stopped ? "2x stopped (time up)" : "✓ 2x done"}: ${parts.join(" · ")}`);
      } catch (e: any) {
        noteRef.current(`${LB_BOT}: ${e?.message || "Bet failed."}`);
      } finally {
        doublingRef.current = false;
        setDoubling(false);
        setInFlight((n) => Math.max(0, n - 1));
        // a fast second tap on 2x right after it finished must not double AGAIN by mistake
        doubleDoneAt.current = Date.now();
      }
    })();
  };

  return {
    canSee: access.canSee,
    running,
    phase,
    round,
    secondsLeft,
    myBets,
    starting,
    inFlight,
    lastBet,
    start,
    bet,
    double,
    doubling,
  };
}

/** "12000", "12,000", "12k", "1.5k" → coins (null when it isn't a whole number). */
function parseBetAmount(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/,/g, "");
  const m = /^(\d+(?:\.\d+)?)(k?)$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] ? 1000 : 1);
  return Number.isInteger(n) ? n : null;
}

/** Room commands. Returns true when the text was a Luxury Bet command. */
export function luxuryBetHandleCommand(state: LuxuryBetState, text: string, note: (t: string) => void): boolean {
  const parts = text.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  if (cmd !== "!start" && cmd !== "!b" && cmd !== "!bet") return false;
  if (!state.canSee) {
    note(`${LB_BOT}: This room is not open yet.`);
    return true;
  }
  if (cmd === "!start") {
    state.start();
    return true;
  }
  const character = parts[1] ? characterFor(parts[1]) : null;
  const amount = parseBetAmount(parts[2] || "");
  if (!character || amount === null) {
    note(`${LB_BOT}: Usage: !b [k/q/p/f/w/a] [amount] — e.g. !b k 1000 or !b f 12k (King, Queen, Prince, Fairy, Wizard, Angel)`);
  } else {
    state.bet(character, amount, 20);
  }
  return true;
}

// Flips every 0.5 s while active (the blinking timer of the last 10 s).
function useBlink(active: boolean): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!active) {
      setOn(true);
      return;
    }
    const t = setInterval(() => setOn((v) => !v), 500);
    return () => clearInterval(t);
  }, [active]);
  return on;
}

/** The gold ▶ START button in the input row. */
export function LuxuryBetStartButton({ state }: { state: LuxuryBetState }) {
  // While a round runs it just shows ⏳ — the timer is only in the bet box (like the app).
  if (!state.canSee) return null;
  return (
    <button
      type="button"
      onClick={state.start}
      disabled={state.running || state.starting}
      title={state.running ? "Round running" : "Start a round"}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
      style={{ background: state.running ? "#0B2A5B" : "#D4AE3A", boxShadow: "0 2px 6px rgba(212,174,58,.4)" }}
    >
      {/* "…" only until the round is really on (the live game doc can say so
          before the server's answer arrives) */}
      {state.starting && !state.running ? (
        "…"
      ) : state.running ? (
        "⏳"
      ) : (
        // white ▶, like the app's gold play button
        <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
          <path d="M7 4.5 L20 12 L7 19.5 Z" fill="#FFFFFF" />
        </svg>
      )}
    </button>
  );
}

/** The Luxury Bet line at the top of the room; follows the live round. */
export function LuxuryBetWelcomeLine({ state }: { state: LuxuryBetState | null }) {
  const body =
    state && state.running && state.phase === "BETTING" && state.secondsLeft > 0
      ? `: 🎰 Round in progress — ${state.secondsLeft}s left to bid!`
      : state && state.running
        ? ": 🎰 Calculating result… Please wait!"
        : ": Luxury Bet is here! Type !start to begin. Min: 100 | Max: 12000 coins";
  return (
    <p className="px-1 py-1 text-[14px] leading-[19px]">
      <span className="font-bold text-[#E6731E]">🎰 Luxury Bet</span>
      <span className="text-[#1565E8]">{body}</span>
    </p>
  );
}

/** Eye drawn with lines: open = everyone's bets shown; slashed = only mine. */
function EyeIcon({ slashed, color }: { slashed: boolean; color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12 Q12 0.5 23 12 Q12 23.5 1 12 Z" />
      <circle cx="12" cy="12" r="3.4" fill={color} stroke="none" />
      {slashed && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

/** The bet box under the chat (the app's LuxuryBetBox, in your 🎨 bet box colour). */
export function LuxuryBetTable({
  state,
  uid,
  onlyMine,
  onToggleOnlyMine,
}: {
  state: LuxuryBetState;
  uid: string;
  onlyMine: boolean;
  onToggleOnlyMine: () => void;
}) {
  const [amount, setAmount] = useRememberedAmount("bet", 500);
  const [collapsed, setCollapsed] = useState(false);
  // 🎨 the same bet box colour as Luxury Bot (lb_inventory/{uid}.box), like the app
  const inv = useInventory("lb_inventory", uid, LB_KINDS);
  const [showStyles, setShowStyles] = useState(false);
  const skin = lbSkinNow(inv.active.box);
  const lastTap = useRef<{ character: string; at: number }>({ character: "", at: 0 });
  // ✨ smooth feel: the first tap lights the tile up, a placed bet makes it bounce
  const [armed, setArmed] = useState("");
  const [popped, setPopped] = useState<{ c: string; n: number }>({ c: "", n: 0 });
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urgent = state.secondsLeft >= 1 && state.secondsLeft <= 10;
  const blinkOn = useBlink(urgent);

  // New round opens the box; no round running folds it.
  useEffect(() => setCollapsed(false), [state.round]);
  useEffect(() => {
    if (!state.running) setCollapsed(true);
  }, [state.running]);

  if (!state.canSee) {
    return <p className="p-3 text-[13px] font-bold text-[#D62F72]">🎰 Luxury Bet is not open yet.</p>;
  }

  const open = state.secondsLeft > 0;
  const tap = (character: string) => {
    const t = Date.now();
    const prev = lastTap.current;
    if (armTimer.current) clearTimeout(armTimer.current);
    if (prev.character === character && t - prev.at <= 600) {
      lastTap.current = { character: "", at: 0 };
      setArmed("");
      setPopped((p) => ({ c: character, n: p.n + 1 }));
      state.bet(character, amount);
    } else {
      lastTap.current = { character, at: t };
      setArmed(character);
      armTimer.current = setTimeout(() => setArmed(""), 600);
    }
  };
  const title = state.inFlight > 0 ? "⏳ Sending bet…" : state.phase === "SETTLING" ? "Calculating result…" : "Luxury Bet · tap 2x to bid";
  const circle = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold";

  return (
    <div
      className={`m-1.5 rounded-2xl px-2 py-1.5${lbIsGlass(skin) ? " lb-glass" : ""}`}
      style={lbBoxStyle(skin, 1.5)}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="min-w-[34px] rounded-xl px-2 py-0.5 text-center text-sm font-black"
          style={{ background: urgent && blinkOn ? "#E53935" : skin.chip, color: urgent ? (blinkOn ? "#fff" : "#E53935") : skin.accentText }}
        >
          {state.secondsLeft}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold" style={{ color: skin.accentText }}>
          {title}
        </span>
        {open && (state.lastBet || Object.values(state.myBets).some((v) => Number(v) > 0)) && (
          <>
            <button
              type="button"
              title="Repeat last bet"
              onClick={() => state.lastBet && state.bet(state.lastBet.character, state.lastBet.amount)}
              disabled={!state.lastBet || state.doubling}
              className={circle}
              style={{ background: skin.chip, borderColor: skin.accent, color: skin.accent }}
            >
              ↻
            </button>
            <button
              type="button"
              title="Double all my bets this round"
              onClick={() => state.double()}
              disabled={state.doubling}
              className={circle}
              style={{ background: skin.chip, borderColor: skin.accent, color: skin.accent }}
            >
              2x
            </button>
          </>
        )}
        <button
          type="button"
          title="Bet box colours"
          onClick={() => setShowStyles(true)}
          className={`${circle} border-0 text-[13px]`}
          style={{ background: `linear-gradient(135deg, ${skin.accent}, ${skin.accent2})` }}
        >
          🎨
        </button>
        <button
          type="button"
          title={onlyMine ? "Showing only my bets" : "Showing everyone's bets"}
          onClick={onToggleOnlyMine}
          className={circle}
          style={{ background: onlyMine ? skin.accent : skin.chip, borderColor: skin.accent }}
        >
          <EyeIcon slashed={onlyMine} color={onlyMine ? skin.bgTop : skin.accent} />
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded-lg border px-2 text-sm font-bold"
          style={{ background: skin.chip, borderColor: skin.accent, color: skin.accent }}
        >
          {collapsed ? "+" : "−"}
        </button>
      </div>

      {!collapsed && (
        <>
          <div
            className="mt-1 h-[2px] rounded-sm"
            style={{ background: `linear-gradient(90deg, transparent, ${skin.accent}, ${skin.accent2}, ${skin.accent}, transparent)` }}
          />
          <div className="mt-1.5 grid grid-cols-6 gap-1.5">
            {LUXURY_BET_CHARACTERS.map((c) => {
              const total = Number(state.myBets[c] || 0);
              const mine = total > 0;
              const [emoji, ...rest] = c.split(" ");
              return (
                <button
                  key={c}
                  type="button"
                  disabled={!open}
                  onClick={() => tap(c)}
                  className={`lb-press relative select-none touch-manipulation rounded-xl pb-[3px] ${armed === c ? "lb-armed" : ""}`}
                  style={{ background: !open ? "#15131C" : mine ? "#C8901A" : skin.tileBase }}
                >
                  <span
                    key={popped.c === c ? popped.n : 0}
                    className={`flex h-full min-h-[62px] flex-col items-center justify-center rounded-xl ${ART[rest.join(" ")] ? "py-1" : "py-1.5"} ${popped.c === c && popped.n ? "lb-pop" : ""}${open && !mine && lbHasShine(skin) ? " lb-shine" : ""}`}
                    style={
                      open && !mine
                        ? lbTileFace(skin, LUXURY_BET_CHARACTERS.indexOf(c))
                        : {
                            background: !open ? "linear-gradient(#2E2A3C,#24212F)" : "linear-gradient(#FFF8DC,#FCD97A)",
                            border: `${mine ? 2 : 1}px solid ${!open ? "#3A3648" : "#D4A017"}`,
                          }
                    }
                  >
                    {ART[rest.join(" ")] ? (
                      // 🖼️ the character's small cut-out picture
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ART[rest.join(" ")]}
                        alt={emoji}
                        draggable={false}
                        className={`h-[34px] w-[34px] object-contain object-bottom drop-shadow-[0_1px_2px_rgba(0,0,0,.25)] ${open ? "" : "opacity-45 grayscale"}`}
                      />
                    ) : (
                      <span className={`text-[18px] leading-5 ${open ? "" : "opacity-50"}`}>{emoji}</span>
                    )}
                    <span
                      className="w-full truncate text-[9px] font-bold leading-[10px]"
                      style={{ color: !open ? "#6E6880" : mine ? "#7A4E00" : skin.cream }}
                    >
                      {rest.join(" ")}
                    </span>
                    <span
                      className="text-[11px] font-extrabold leading-3"
                      style={{ color: !open ? "#6E6880" : mine ? "#B8790A" : lbValueColor(skin), opacity: !open || mine || lbValueColor(skin) !== skin.cream ? 1 : 0.7 }}
                    >
                      {totalLabel(total)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="py-0.5 text-center text-[9px]" style={{ color: skin.accentText, opacity: 0.75 }}>
            👆 Tap twice on a character to bid instantly
          </p>
          <div className="grid grid-cols-6 gap-1.5 pb-1">
            {CHIPS.map((c) => {
              const selected = amount === c;
              return (
                <button
                  key={c}
                  type="button"
                  disabled={!open}
                  onClick={() => setAmount(c)}
                  className={`lb-press lb-chip h-[34px] rounded-xl border text-[13px] font-bold shadow${open && !selected && lbHasShine(skin) ? " lb-shine" : ""}`}
                  style={
                    !open
                      ? { background: "linear-gradient(#2E2A3C,#24212F)", borderColor: "#3A3648", color: "#6E6880" }
                      : lbChipFace(skin, selected)
                  }
                >
                  {c >= 1000 ? `${c / 1000}k` : c}
                </button>
              );
            })}
          </div>
        </>
      )}
      {showStyles && <LbStyleDialog inv={inv} onClose={() => setShowStyles(false)} />}
    </div>
  );
}
