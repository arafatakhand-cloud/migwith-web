"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";

// 🃏 LowCard — every step is a server-side, idempotent Cloud Function
// (startLowCardRound / joinLowCardGame / drawOwnLowCardCard /
// advanceLowCardRound / drawLowCardRound / resolveLowCardTieBreak /
// cancelLowCardNotEnoughPlayers). Like every device in the app's room, the web
// moves the game on when a phase's deadline has passed; the server lets only
// one of those calls through. All chat lines come from the server.

export const LOWCARD_ROOM = "🃏 LowCard Official";
export const LOWCARD_ENTRY_OPTIONS = [100, 200, 500, 1000, 2000];

const call = (name: string) => httpsCallable(functions, name);
const startCall = call("startLowCardRound");
const joinCall = call("joinLowCardGame");
const drawOwnCall = call("drawOwnLowCardCard");
const advanceCall = call("advanceLowCardRound");
const drawRoundCall = call("drawLowCardRound");
const tieBreakCall = call("resolveLowCardTieBreak");
const cancelCall = call("cancelLowCardNotEnoughPlayers");

type Player = { uid: string; username: string };

export type LowCardState = {
  running: boolean;
  phase: string;
  round: number;
  gameRound: number;
  entryCost: number;
  pot: number;
  players: Player[];
  cards: Record<string, string>;
  tieBreakActive: boolean;
  tieCandidates: string[];
  tieDrawn: string[];
  secondsLeft: number;
  busy: boolean;
  start: (entry: number) => void;
  join: () => void;
  draw: () => void;
};

// roomId = the official LowCard room, or any room where LowCard Bot was
// switched on with /start lowcard (null = no LowCard here).
export function useLowCard(roomId: string | null, uid: string | undefined, note: (t: string) => void): LowCardState | null {
  const enabled = !!roomId;
  const [g, setG] = useState({
    running: false,
    phase: "IDLE",
    phaseEndsAt: 0,
    round: 0,
    gameRound: 1,
    entryCost: 200,
    pot: 0,
    players: [] as Player[],
    cards: {} as Record<string, string>,
    tieBreakActive: false,
    tieCandidates: [] as string[],
    tieDrawn: [] as string[],
  });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const lastDrive = useRef(0);
  const noteRef = useRef(note);
  noteRef.current = note;

  // The game document.
  useEffect(() => {
    if (!roomId || !uid) return;
    return onSnapshot(doc(db, "room_game", roomId), (d) => {
      if (!d.exists()) {
        setG((prev) => ({ ...prev, running: false, phase: "IDLE" }));
        return;
      }
      const phase = String(d.get("phase") || "IDLE");
      const rawPlayers = d.get("players");
      const seen = new Set<string>();
      const players: Player[] = Array.isArray(rawPlayers)
        ? rawPlayers
            .filter((m: any) => m && m.uid && !seen.has(m.uid) && seen.add(m.uid))
            .map((m: any) => ({ uid: String(m.uid), username: String(m.username || "") }))
        : [];
      const rawCards = (d.get("cards") || {}) as Record<string, any>;
      const tb = (d.get("tieBreak") || {}) as Record<string, any>;
      setG((prev) => ({
        running: d.get("gameRunning") === true,
        phase,
        phaseEndsAt: Number(d.get("phaseEndsAt") || 0),
        round: Number(d.get("roundNumber") || 0),
        gameRound: phase === "JOINING" ? 1 : Number(d.get("gameRound") || prev.gameRound),
        entryCost: Number(d.get("entryCost") || 200),
        pot: Number(d.get("totalPot") || 0),
        players,
        cards: Object.fromEntries(
          Object.entries(rawCards)
            .filter(([, v]) => v && v.rank && v.suit)
            .map(([k, v]) => [k, `${v.rank}${v.suit}`])
        ),
        tieBreakActive: tb.active === true,
        tieCandidates: Array.isArray(tb.candidateUids) ? tb.candidateUids.map(String) : [],
        tieDrawn: Object.keys((tb.cards || {}) as Record<string, unknown>),
      }));
    });
  }, [roomId, uid]);

  // Countdown + move the game on once a deadline has passed (same checks as
  // the app's rescue watcher; the server accepts each step only once).
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (!g.running || g.round <= 0 || g.phaseEndsAt <= 0 || document.visibilityState !== "visible") return;
      if (n - lastDrive.current < 1500) return;
      const stuck = n - g.phaseEndsAt;
      const args = { roomId, roundNumber: g.round };

      if (g.phase === "JOINING" && stuck >= 1000 && stuck <= 150_000 && g.players.length < 2) {
        lastDrive.current = n;
        cancelCall(args).catch(() => {});
      } else if (
        ((g.phase === "JOINING" && g.players.length >= 2) || g.phase === "COUNTDOWN") &&
        stuck >= 0 &&
        stuck <= 150_000
      ) {
        lastDrive.current = n;
        advanceCall(args).catch(() => {});
      } else if (g.phase === "DRAWING" && stuck >= 3500 && stuck <= 150_000) {
        lastDrive.current = n;
        (g.tieBreakActive ? tieBreakCall : drawRoundCall)({ ...args, gameRound: g.gameRound }).catch(() => {});
      }
    }, 500);
    return () => clearInterval(t);
  }, [enabled, roomId, g]);

  if (!enabled) return null;

  const run = (p: Promise<unknown>, fallback: string) => {
    setBusy(true);
    p.catch((err: any) => noteRef.current(`LowCard Bot: ${err?.message || fallback}`)).finally(() => setBusy(false));
  };

  const left = g.phaseEndsAt - now;
  const joined = g.players.some((p) => p.uid === uid);

  return {
    ...g,
    secondsLeft: g.running && left > 0 ? Math.ceil(left / 1000) : 0,
    busy,
    start: (entry: number) => {
      if (busy) return;
      setBusy(true);
      startCall({ entryCost: entry, roomId })
        .then(({ data }: any) => {
          if (data?.claimed !== true) noteRef.current("LowCard Bot: A game is already running.");
        })
        .catch((err: any) =>
          noteRef.current(`LowCard Bot: Could not start the game. ${err?.message || "Please try again."}`)
        )
        .finally(() => setBusy(false));
    },
    join: () => {
      if (busy || !g.running || g.phase !== "JOINING" || joined) return;
      run(joinCall({ roomId, operationId: crypto.randomUUID() }), "Could not join. Please try again.");
    },
    draw: () => {
      if (!uid || !g.running || g.phase !== "DRAWING") return;
      if (g.tieBreakActive) {
        if (!g.tieCandidates.includes(uid) || g.tieDrawn.includes(uid)) return;
      } else if (g.cards[uid] || !joined) {
        return;
      }
      drawOwnCall({ roomId, roundNumber: g.round, gameRound: g.gameRound }).catch(() => {});
    },
  };
}

// Chat commands in the LowCard room. True = handled (not posted as chat).
export function lowCardHandleCommand(
  state: LowCardState,
  clean: string,
  note: (t: string) => void,
  defaultEntry: number
): boolean {
  const lower = clean.trim().toLowerCase();
  if (lower === "!start") {
    state.start(defaultEntry);
    return true;
  }
  if (lower.startsWith("!start ")) {
    const amount = Number(lower.slice(7).trim());
    if (LOWCARD_ENTRY_OPTIONS.includes(amount)) state.start(amount);
    else note("LowCard Bot: Custom entry options: 100, 200, 500, 1000, 2000 credits.");
    return true;
  }
  if (lower === "!j" || lower === "!join") {
    state.join();
    return true;
  }
  if (lower === "!d" || lower === "!draw") {
    state.draw();
    return true;
  }
  if (lower === "!help") {
    note("LowCard Bot: !start [100|200|500|1000|2000] · !j join · !d draw your card · lowest card each round is out");
    return true;
  }
  return false;
}

const LC_GOLD = "linear-gradient(to bottom, #FFF59D, #FFC107, #FF8F00)";
const LC_PINK = "linear-gradient(to bottom, #FF9ED8, #FF4FB4, #C2185B)";
const LC_SLANT = "polygon(var(--k) 0, 100% 0, calc(100% - var(--k)) 100%, 0 100%)";
const LC_AVATARS = [
  ["#E1BEE7", "#AB47BC"],
  ["#BBDEFB", "#5C6BC0"],
  ["#F8BBD0", "#EC407A"],
  ["#B2EBF2", "#26A69A"],
];
const RANK_VALUE: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14 };
const cardValue = (card: string) => RANK_VALUE[card.slice(0, -1)] ?? Number(card.slice(0, -1));

// Glossy 3D button with a darker base and a shine streak.
function LcButton({ label, face, base, ink, glow, onClick, disabled }: { label: string; face: string; base: string; ink: string; glow: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 rounded-xl pb-[3px] active:translate-y-px disabled:opacity-55"
      style={{ background: base, boxShadow: `0 0 8px ${glow}99` }}
    >
      <span
        className="relative block overflow-hidden whitespace-nowrap rounded-xl px-[15px] py-1.5 text-[12.5px] font-black tracking-[0.5px]"
        style={{ background: `linear-gradient(to bottom, rgba(255,255,255,.33), rgba(255,255,255,0) 50%), ${face}`, color: ink }}
      >
        <span className="pointer-events-none absolute inset-y-0 left-[70%] w-[7px] -skew-x-[22deg] bg-white/35" />
        <span className="relative">{label}</span>
      </span>
    </button>
  );
}

function LcTimerRing({ secondsLeft, total }: { secondsLeft: number; total: number }) {
  const urgent = secondsLeft >= 1 && secondsLeft <= 10;
  const r = 12;
  const c = 2 * Math.PI * r;
  const progress = Math.min(1, Math.max(0, secondsLeft / Math.max(total, secondsLeft)));
  return (
    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
      <svg viewBox="0 0 32 32" className="absolute inset-0 h-8 w-8 -rotate-90">
        <circle cx="16" cy="16" r={r} fill="#1A0F45" stroke="rgba(255,255,255,.2)" strokeWidth="3.5" />
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke={urgent ? "#FF5252" : "#FFC107"}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          style={{ transition: "stroke-dashoffset .45s" }}
        />
      </svg>
      <span className="relative text-xs font-extrabold" style={{ color: urgent ? "#FF8A80" : "#FFFFFF" }}>
        {secondsLeft}
      </span>
    </span>
  );
}

// ✨ NEON CASINO LOOK (like the app): shining gold→pink→violet frame with
// glow, velvet table with spotlights and a ♠♥♦♣ watermark, slanted gold
// LOWCARD plate, poker-chip entry buttons, real cards with gold edges — the
// lowest card glows red with a LOW tag.
export function LowCardBox({ state, uid }: { state: LowCardState; uid: string }) {
  const [entry, setEntry] = useState(200);
  const [collapsed, setCollapsed] = useState(false);

  const joined = state.players.some((p) => p.uid === uid);
  const inTie = state.tieBreakActive && state.tieCandidates.includes(uid);
  const canDraw =
    state.running &&
    state.phase === "DRAWING" &&
    (state.tieBreakActive ? inTie && !state.tieDrawn.includes(uid) : joined && !state.cards[uid]);

  const drawn = state.players.map((p) => state.cards[p.uid]).filter(Boolean).map(cardValue);
  const lowest = drawn.length >= 2 ? Math.min(...drawn) : null;
  const highest = drawn.length >= 2 ? Math.max(...drawn) : null;

  return (
    <div className="px-[7px] py-1">
      <div
        className="rounded-[18px] p-[2px]"
        style={{
          background: "conic-gradient(#FFF59D, #FFB300, #FF4FB4, #7C4DFF, #FFB300, #FFF59D)",
          boxShadow: "0 0 12px rgba(124,77,255,.55)",
        }}
      >
        <div
          className="relative max-h-[205px] overflow-y-auto overflow-x-hidden rounded-2xl px-2 py-[7px]"
          style={{
            background:
              "radial-gradient(circle at 18% 0, rgba(255,255,255,.15), transparent 35%), radial-gradient(circle at 85% 0, rgba(255,79,180,.15), transparent 40%), repeating-linear-gradient(45deg, rgba(255,255,255,.05) 0 1px, transparent 1px 16px), repeating-linear-gradient(-45deg, rgba(255,255,255,.05) 0 1px, transparent 1px 16px), radial-gradient(circle, #5B34B8, #2E1B6B 60%, #14093A)",
          }}
        >
          {/* ♠♥♦♣ watermark */}
          <span className="pointer-events-none absolute bottom-0 right-1.5 select-none text-[62px] font-black leading-none tracking-[-4px] text-white/5">
            ♠♥♦♣
          </span>

          {/* Header */}
          <div className="relative flex items-center">
            {state.running && state.secondsLeft > 0 && (
              <span className="mr-1.5">
                <LcTimerRing secondsLeft={state.secondsLeft} total={30} />
              </span>
            )}
            <span
              className="relative shrink-0 overflow-hidden whitespace-nowrap px-3 py-[3px] text-xs font-black italic text-[#3E2723]"
              style={{ ["--k" as string]: "6px", clipPath: LC_SLANT, background: LC_GOLD, filter: "drop-shadow(0 0 4px #FFC107)" }}
            >
              <span className="pointer-events-none absolute inset-y-0 left-[66%] w-[6px] -skew-x-[22deg] bg-white/40" />
              <span className="relative">🃏 LOWCARD</span>
            </span>
            {state.running && (
              <span className="ml-[5px] whitespace-nowrap rounded-full border border-[#FFD54F]/55 bg-black/55 px-2 py-0.5 text-[10px] font-extrabold text-[#FFE082]">
                {state.tieBreakActive ? "Tie-break" : `R#${state.gameRound}`} ·{" "}
                {state.phase === "JOINING" ? "joining" : `${state.players.length} left`}
              </span>
            )}
            <span className="flex-1" />
            {!state.running ? (
              <LcButton label={"▶\uFE0E START"} face={LC_GOLD} base="#B26A00" ink="#3E2723" glow="#FFC107" disabled={state.busy} onClick={() => state.start(entry)} />
            ) : state.phase === "JOINING" && !joined ? (
              <LcButton label="✋ JOIN" face={LC_GOLD} base="#B26A00" ink="#3E2723" glow="#FFC107" disabled={state.busy} onClick={state.join} />
            ) : canDraw ? (
              <LcButton label="🂠 DRAW" face={LC_PINK} base="#880E4F" ink="#FFFFFF" glow="#FF4FB4" onClick={state.draw} />
            ) : null}
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "Expand" : "Collapse"}
              className="ml-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/55 text-sm font-bold text-white"
              style={{ border: "1px solid rgba(255,213,79,.7)" }}
            >
              {collapsed ? "+" : "−"}
            </button>
          </div>

          {!collapsed &&
            (!state.running ? (
              <div className="relative">
                {/* Entry picker (poker chips) */}
                <div className="mt-2 flex justify-between">
                  {LOWCARD_ENTRY_OPTIONS.map((e) => {
                    const sel = entry === e;
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setEntry(e)}
                        className="flex h-[42px] w-[42px] items-center justify-center rounded-full p-[2px]"
                        style={{ background: sel ? "#FFB300" : "#2A1760", boxShadow: sel ? "0 0 10px #FFC107" : "0 1px 3px rgba(0,0,0,.5)" }}
                      >
                        <span
                          className="flex h-full w-full items-center justify-center rounded-full"
                          style={{ border: `3px dashed ${sel ? "#FFFFFF" : "rgba(255,255,255,.4)"}` }}
                        >
                          <span
                            className="flex h-[28px] w-[28px] items-center justify-center rounded-full text-[11px] font-black"
                            style={{ background: sel ? "#FFE082" : "#3B2580", color: sel ? "#3E2723" : "#FFFFFF" }}
                          >
                            {e >= 1000 ? `${e / 1000}K` : e}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-[5px] text-center text-[9.5px] text-white/75">♠ Lowest card is out each round · last one standing wins ♥</p>
              </div>
            ) : (
              state.players.length > 0 && (
                // the "felt" panel the cards lie on
                <div className="relative mt-[7px] flex gap-[9px] overflow-x-auto rounded-xl border border-white/10 bg-black/20 px-2 py-[7px] [scrollbar-width:none]">
                  {state.players.map((p, i) => {
                    const card = state.cards[p.uid];
                    const isMe = p.uid === uid;
                    const v = card ? cardValue(card) : null;
                    const isLow = v !== null && lowest !== null && v === lowest && lowest !== highest;
                    const isHigh = v !== null && highest !== null && v === highest && lowest !== highest;
                    const red = card && (card.endsWith("♥") || card.endsWith("♦"));
                    const ink = red ? "#D32F2F" : "#1B1B1B";
                    const [a, b] = LC_AVATARS[i % LC_AVATARS.length];
                    const initials = p.username.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
                    return (
                      <div key={p.uid} className="flex shrink-0 flex-col items-center gap-[3px]">
                        <span className="relative">
                          <span className="block h-[30px] w-[30px] rounded-full p-[1.5px]" style={{ background: LC_GOLD, boxShadow: "0 0 5px #FFC107" }}>
                            <span
                              className="flex h-full w-full items-center justify-center rounded-full text-[10px] font-black text-[#1A0F45]"
                              style={{ background: `linear-gradient(${a}, ${b})` }}
                            >
                              {initials}
                            </span>
                          </span>
                          {card && (
                            <span className="absolute -bottom-0.5 -right-[3px] flex h-3 w-3 items-center justify-center rounded-full border border-white bg-[#00C853] text-[7px] font-black text-white">
                              ✓
                            </span>
                          )}
                        </span>
                        <span className="relative flex flex-col items-center">
                          {card ? (
                            <span
                              className="relative mt-[5px] block h-[43px] w-[31px] rounded-[5px]"
                              style={{
                                background: "linear-gradient(#FFFFFF, #F3F0FA)",
                                border: `1.5px solid ${isLow ? "#FF1744" : "#FFD54F"}`,
                                boxShadow: isLow ? "0 0 9px #FF1744" : isHigh ? "0 0 9px #FFC107" : "0 2px 4px rgba(0,0,0,.45)",
                                color: ink,
                              }}
                            >
                              <span className="absolute left-[3px] top-px text-[10px] font-black leading-[10px]">{card.slice(0, -1)}</span>
                              <span className="absolute inset-0 flex items-center justify-center text-[17px] leading-none">{card.slice(-1)}</span>
                              <span className="absolute bottom-px right-[3px] rotate-180 text-[10px] font-black leading-[10px]">{card.slice(0, -1)}</span>
                            </span>
                          ) : (
                            // face-down card back (striped, gold rim)
                            <span
                              className="mt-[5px] flex h-[43px] w-[31px] items-center justify-center rounded-[5px] p-[3px]"
                              style={{
                                border: "1.5px solid #FFD54F",
                                background: "repeating-linear-gradient(-45deg, #6A3FC8 0 2.5px, #5530B0 2.5px 5px)",
                                boxShadow: "0 2px 4px rgba(0,0,0,.45)",
                              }}
                            >
                              <span className="flex h-full w-full items-center justify-center rounded-[3px] border-[0.8px] border-[#FFD54F]/60 text-xs text-[#FFD54F]">♠</span>
                            </span>
                          )}
                          {isLow && (
                            <span className="absolute top-0 rounded-[4px] bg-[#FF1744] px-1 text-[7px] font-black leading-[9px] tracking-[0.5px] text-white">LOW</span>
                          )}
                        </span>
                        <span
                          className={`max-w-[54px] truncate rounded-full px-1.5 py-px text-[9px] ${isMe ? "font-extrabold text-[#3E2723]" : "font-medium text-white"}`}
                          style={{ background: isMe ? "linear-gradient(#FFE082, #FFB300)" : "rgba(0,0,0,.4)" }}
                        >
                          {p.username}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )
            ))}
        </div>
      </div>
    </div>
  );
}
