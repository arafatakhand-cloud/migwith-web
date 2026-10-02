"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";

// 🏏 Cricket Bot — all outcomes and coins are decided by the Cloud Functions
// (startCricketGame / joinCricketGame / batCricket / tickCricketGame). The web
// only shows the game and sends the commands, same as CricketGame.kt.

export const CRICKET_ROOM = "🏏 Cricket Official";
const ROUNDS = 6;
const ENTRY_OPTIONS = [100, 200, 500, 1000, 2000];

const startCall = httpsCallable(functions, "startCricketGame");
const joinCall = httpsCallable(functions, "joinCricketGame");
const batCall = httpsCallable(functions, "batCricket");
const tickCall = httpsCallable(functions, "tickCricketGame");

type Player = { uid: string; username: string; runs: number; out: boolean; outHow: string };

export type CricketState = {
  running: boolean;
  phase: string;
  round: number;
  ball: number;
  entryCost: number;
  pot: number;
  players: Player[];
  batted: Set<string>;
  superOver: boolean;
  superOverUids: string[];
  secondsLeft: number;
  busy: boolean;
  activeBatters: () => Player[];
  start: (entry: number) => void;
  join: () => void;
  bat: () => void;
};

function opId(kind: string): string {
  return `cricket_${kind}_` + crypto.randomUUID().replace(/-/g, "");
}

// roomId = the official Cricket room, or any room where Cricket Bot was
// switched on with /start cricket (null = no Cricket Bot here).
export function useCricket(roomId: string | null, uid: string | undefined, note: (t: string) => void): CricketState | null {
  const enabled = !!roomId;
  const [g, setG] = useState({
    running: false,
    phase: "IDLE",
    phaseEndsAt: 0,
    round: 0,
    ball: 0,
    entryCost: 200,
    pot: 0,
    players: [] as Player[],
    batted: new Set<string>(),
    superOver: false,
    superOverUids: [] as string[],
  });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const lastTick = useRef(0);
  const noteRef = useRef(note);
  noteRef.current = note;

  useEffect(() => {
    if (!roomId || !uid) return;
    return onSnapshot(doc(db, "room_game", roomId), (snap) => {
      if (!snap.exists()) {
        setG((prev) => ({ ...prev, running: false, phase: "IDLE" }));
        return;
      }
      const rawPlayers = snap.get("players");
      const so = (snap.get("superOver") || {}) as Record<string, any>;
      setG({
        running: snap.get("gameRunning") === true,
        phase: String(snap.get("phase") || "IDLE"),
        phaseEndsAt: Number(snap.get("phaseEndsAt") || 0),
        round: Number(snap.get("roundNumber") || 0),
        ball: Number(snap.get("ball") || 0),
        entryCost: Number(snap.get("entryCost") || 200),
        pot: Number(snap.get("totalPot") || 0),
        players: Array.isArray(rawPlayers)
          ? rawPlayers
              .filter((m: any) => m && m.uid)
              .map((m: any) => ({
                uid: String(m.uid),
                username: String(m.username || ""),
                runs: Number(m.runs || 0),
                out: m.out === true,
                outHow: String(m.outHow || ""),
              }))
          : [],
        batted: new Set(Object.keys((snap.get("bats") || {}) as Record<string, unknown>)),
        superOver: so.active === true,
        superOverUids: Array.isArray(so.candidateUids) ? so.candidateUids.map(String) : [],
      });
    });
  }, [roomId, uid]);

  // Countdown, and nudge the game on when a timer ends (the server does it once).
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (
        g.running &&
        g.phaseEndsAt > 0 &&
        document.visibilityState === "visible" &&
        n >= g.phaseEndsAt + 350 &&
        n - lastTick.current > 1500
      ) {
        lastTick.current = n;
        tickCall({ roomId }).catch(() => {});
      }
    }, 300);
    return () => clearInterval(t);
  }, [enabled, roomId, g.running, g.phaseEndsAt]);

  if (!enabled) return null;

  const run = (p: Promise<unknown>, fallback: string) => {
    setBusy(true);
    p.catch((err: any) => noteRef.current(`Cricket Bot: ${err?.message || fallback}`)).finally(() => setBusy(false));
  };

  const left = g.phaseEndsAt - now;

  return {
    ...g,
    secondsLeft: g.running && left > 0 ? Math.ceil(left / 1000) : 0,
    busy,
    activeBatters: () =>
      g.superOver ? g.players.filter((p) => g.superOverUids.includes(p.uid)) : g.players.filter((p) => !p.out),
    start: (entry: number) => {
      if (!busy) run(startCall({ entryCost: entry, operationId: opId("start"), roomId }), "Could not start.");
    },
    join: () => {
      if (!busy) run(joinCall({ operationId: opId("join"), roomId }), "Could not join.");
    },
    bat: () => {
      if (!busy) run(batCall({ roundNumber: g.round, roomId }), "Could not bat.");
    },
  };
}

// Chat commands in the Cricket room. True = handled (not posted as chat).
export function cricketHandleCommand(
  state: CricketState,
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
    if (!Number.isInteger(amount) || amount < 100 || amount > 100000) {
      note("Cricket Bot: Custom entry must be a number from 100 to 100000. Example: !start 500");
    } else {
      state.start(amount);
    }
    return true;
  }
  if (lower === "!j" || lower === "!join") {
    state.join();
    return true;
  }
  if (lower === "!d" || lower === "!bat") {
    state.bat();
    return true;
  }
  if (lower === "!players") {
    note(
      state.players.length === 0
        ? "Cricket Bot: No players have joined."
        : `Cricket Bot: Players (${state.players.length}): ` +
            state.players.map((p) => `${p.username}${p.out ? " (OUT)" : ` (${p.runs})`}`).join(", ")
    );
    return true;
  }
  if (lower === "!help") {
    note("Cricket Bot: !start [entry] starts a game · !j joins · !d bats · !players lists the players");
    return true;
  }
  return false;
}

const GOLD_BTN = "linear-gradient(to bottom, #FFF59D, #FFC107, #FF8F00)";
const RED_BTN = "linear-gradient(to bottom, #FF8A80, #E53935, #B71C1C)";
const ACCENT = "#FFC83D";

// 3D button: darker base peeking out under the gradient face.
function CricketBtn({ label, face, base, ink, enabled, onClick }: { label: string; face: string; base: string; ink: string; enabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className="shrink-0 rounded-[11px] pb-[2.5px] active:translate-y-px"
      style={{ background: base, opacity: enabled ? 1 : 0.55 }}
    >
      <span className="block whitespace-nowrap rounded-[11px] px-3.5 py-1.5 text-xs font-black" style={{ background: face, color: ink }}>
        {label}
      </span>
    </button>
  );
}

// Glowing countdown ring (green → gold, red for the last 5 seconds).
function CricketTimerRing({ secondsLeft, total }: { secondsLeft: number; total: number }) {
  const urgent = secondsLeft >= 1 && secondsLeft <= 5;
  const progress = Math.min(1, Math.max(0, secondsLeft / Math.max(total, secondsLeft)));
  const r = 12;
  const c = 2 * Math.PI * r;
  const start = urgent ? "#FF5252" : "#2FBF71";
  const end = urgent ? "#FF8A65" : ACCENT;
  return (
    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
      {secondsLeft > 0 && (
        <span className={`absolute inset-0 rounded-full ${urgent ? "cr-glow-fast" : "cr-glow"}`} style={{ background: end, opacity: 0.35 }} />
      )}
      <svg viewBox="0 0 32 32" className="absolute inset-0 h-8 w-8 -rotate-90">
        <defs>
          <linearGradient id={`crRing${urgent ? "u" : ""}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={start} />
            <stop offset="1" stopColor={end} />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r={r} fill="#08261C" stroke="rgba(255,255,255,.2)" strokeWidth="3.5" />
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke={`url(#crRing${urgent ? "u" : ""})`}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          style={{ transition: "stroke-dashoffset .45s" }}
        />
      </svg>
      <span className="relative text-[11px] font-extrabold" style={{ color: urgent ? "#FF8A80" : "#FFFFFF" }}>
        {secondsLeft}
      </span>
    </span>
  );
}

function CricketPlayerChip({ p, isMe, batted, inSuperOver, battingNow }: { p: Player; isMe: boolean; batted: boolean; inSuperOver: boolean; battingNow: boolean }) {
  // waiting to bat this round → gold edge
  const waiting = battingNow && !batted && !p.out;
  const edge = inSuperOver || waiting ? "#FFD54F" : isMe ? "#FFFFFF" : "rgba(255,255,255,.2)";
  return (
    <span
      className="flex shrink-0 items-center rounded-full py-0.5 pl-0.5 pr-[7px]"
      style={{ background: p.out ? "rgba(85,17,17,.6)" : "rgba(0,0,0,.4)", border: `${waiting || inSuperOver ? 1.5 : 1}px solid ${edge}`, opacity: p.out ? 0.8 : 1 }}
    >
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-black text-[#0B2E13]"
        style={{ background: p.out ? "linear-gradient(#FFCDD2, #E57373)" : "linear-gradient(#FFFFFF, #B9F6CA)" }}
      >
        {battingNow && batted && !p.out ? "✓" : p.username.slice(0, 1).toUpperCase()}
      </span>
      <span className="ml-1 max-w-[80px] truncate text-[10px] font-bold text-white">
        {p.username}
        {waiting ? " 🏏" : ""}
      </span>
      {p.out ? (
        <span className="ml-1 text-[9.5px] font-black text-[#FF8A80]">OUT {p.runs}</span>
      ) : (
        <span className="ml-1 text-[11px] font-black italic" style={{ color: ACCENT }}>
          {p.runs}
        </span>
      )}
    </span>
  );
}

export function CricketBox({ state, uid }: { state: CricketState; uid: string }) {
  const [entry, setEntry] = useState(200);
  const [collapsed, setCollapsed] = useState(false);

  const me = state.players.find((p) => p.uid === uid);
  const batters = state.activeBatters();
  const iAmBatter = !!me && batters.some((p) => p.uid === uid);
  const iBatted = state.batted.has(uid);
  const canBat = state.phase === "BATTING" && iAmBatter && !iBatted;
  const top = state.players.reduce<Player | null>((best, p) => (!best || p.runs > best.runs ? p : best), null);
  const sorted = [...state.players].sort((a, b) => Number(a.out) - Number(b.out) || b.runs - a.runs);

  // ✨ compact "stadium" box: gold-green frame, striped grass, gold pills
  return (
    <div className="px-[7px] py-[3px]">
      <div className="rounded-2xl p-[1.5px]" style={{ background: "linear-gradient(135deg, #FFE082, #2E7D32, #00C853, #FFE082)" }}>
        <div
          className="rounded-[15px] px-2 py-[7px]"
          style={{
            background:
              "linear-gradient(to bottom, rgba(255,255,255,.13), rgba(255,255,255,0) 50%, rgba(0,0,0,.2)), repeating-linear-gradient(to right, #1E7B34 0 22px, #22883A 22px 44px)",
          }}
        >
          {/* Header */}
          <div className="flex items-center">
            {state.running && state.phase !== "IDLE" && (
              <span className="mr-1.5">
                <CricketTimerRing secondsLeft={state.secondsLeft} total={state.phase === "JOINING" ? 40 : state.phase === "COUNTDOWN" ? 5 : 17} />
              </span>
            )}
            <span className="whitespace-nowrap rounded-full px-[9px] py-0.5 text-[11px] font-black italic text-[#3E2723]" style={{ background: "linear-gradient(135deg, #FFE082, #FFB300)" }}>
              🏏 CRICKET
            </span>
            {state.running && (
              <span className="ml-[5px] flex items-center rounded-[4px] bg-[#D50000] px-[5px] py-px">
                <span className="cr-live h-[5px] w-[5px] rounded-full bg-white" />
                <span className="ml-[3px] text-[8.5px] font-black tracking-[1px] text-white">
                  {state.phase === "JOINING" ? "JOIN" : state.superOver ? "SUPER" : "LIVE"}
                </span>
              </span>
            )}
            <span className="flex-1" />
            {!state.running ? (
              <CricketBtn label="🏏 START" face={GOLD_BTN} base="#B26A00" ink="#3E2723" enabled={!state.busy} onClick={() => state.start(entry)} />
            ) : state.phase === "JOINING" && !me ? (
              <CricketBtn label="✋ JOIN" face={GOLD_BTN} base="#B26A00" ink="#3E2723" enabled={!state.busy} onClick={state.join} />
            ) : canBat ? (
              <CricketBtn label="🏏 BAT" face={RED_BTN} base="#7F0000" ink="#FFFFFF" enabled={!state.busy} onClick={state.bat} />
            ) : null}
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "Expand" : "Collapse"}
              className="ml-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/35 text-sm font-bold text-white"
              style={{ border: "1px solid rgba(255,200,61,.7)" }}
            >
              {collapsed ? "+" : "−"}
            </button>
          </div>

          {/* Scoreboard strip (one line, TV style) */}
          {state.running && (
            <div className="mt-[5px] flex items-center whitespace-nowrap rounded-lg bg-black/65 px-2 py-[3px]" style={{ border: "1px solid rgba(255,193,7,.6)" }}>
              <span className="text-[10px] font-bold text-white">
                {state.phase === "JOINING" ? "Joining" : state.superOver ? "Super Over" : `Round ${Math.max(1, state.ball)}/${ROUNDS}`}
              </span>
              {top && top.runs > 0 && (
                <>
                  <span className="text-[10px] text-[#B9F6CA]">&nbsp; · &nbsp;Top&nbsp;</span>
                  <span className="text-xs font-black italic" style={{ color: ACCENT }}>
                    {top.runs}
                  </span>
                  <span className="ml-1 max-w-[70px] truncate text-[10px] text-white">{top.username}</span>
                </>
              )}
              <span className="flex-1" />
              {state.phase === "BATTING" && (
                <span className="mr-1.5 text-[9.5px] text-[#B9F6CA]">
                  {state.batted.size}/{batters.length} batted
                </span>
              )}
              <span className="text-[10px]">🏆&nbsp;</span>
              <span className="text-[11px] font-black" style={{ color: ACCENT }}>
                {state.pot.toLocaleString()}
              </span>
            </div>
          )}

          {/* Body */}
          {!collapsed &&
            (!state.running ? (
              <>
                <div className="mt-1.5 flex gap-1">
                  {ENTRY_OPTIONS.map((e) => {
                    const sel = entry === e;
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setEntry(e)}
                        className="flex-1 rounded-lg py-[5px] text-[11px] font-black"
                        style={{
                          background: sel ? GOLD_BTN : "linear-gradient(to bottom, rgba(255,255,255,.2), rgba(255,255,255,.08))",
                          border: `1px solid ${sel ? "#FFF8E1" : "rgba(255,255,255,.25)"}`,
                          color: sel ? "#3E2723" : "#FFFFFF",
                        }}
                      >
                        {e >= 1000 ? `${e / 1000}K` : e}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[9.5px] text-white/75">6 rounds • highest runs wins 90% of the pot • OUT = out of the game</p>
              </>
            ) : (
              sorted.length > 0 && (
                <div className="mt-[5px] flex gap-1 overflow-x-auto [scrollbar-width:none]">
                  {sorted.map((p) => (
                    <CricketPlayerChip
                      key={p.uid}
                      p={p}
                      isMe={p.uid === uid}
                      batted={state.batted.has(p.uid)}
                      inSuperOver={state.superOver && state.superOverUids.includes(p.uid)}
                      battingNow={state.phase === "BATTING"}
                    />
                  ))}
                </div>
              )
            ))}
        </div>
      </div>
    </div>
  );
}
