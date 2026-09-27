"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { CardBack, MiniCard } from "./Cards";

// 🎴 Teen Patti — dealing, betting, coins and winners are decided by the Cloud
// Functions (startTeenPatti / joinTeenPatti / teenPattiAction / tickTeenPatti).
// Your own cards are only ever sent to you. Same flow as TeenPattiGame.kt.

export const TEEN_PATTI_ROOM = "🎴 Teen Patti Official";

const BOOT_OPTIONS = [100, 200, 500, 1000, 2000];

const startCall = httpsCallable(functions, "startTeenPatti");
const joinCall = httpsCallable(functions, "joinTeenPatti");
const actionCall = httpsCallable<
  { action: string; roundNumber: number },
  { cards?: string[]; hand?: string }
>(functions, "teenPattiAction");
const tickCall = httpsCallable(functions, "tickTeenPatti");

type Player = { uid: string; username: string; seen: boolean; packed: boolean; invested: number };

export type TeenPattiState = {
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
  secondsLeft: number;
  myCards: string[];
  myHand: string;
  busy: boolean;
  start: (boot: number) => void;
  join: () => void;
  act: (action: string, silent?: boolean) => void;
};

function opId(kind: string): string {
  return `tp_${kind}_` + crypto.randomUUID().replace(/-/g, "");
}

export function useTeenPatti(
  enabled: boolean,
  uid: string | undefined,
  note: (t: string) => void
): TeenPattiState | null {
  const [g, setG] = useState({
    running: false,
    phase: "IDLE",
    phaseEndsAt: 0,
    round: 0,
    boot: 200,
    stake: 400,
    pot: 0,
    players: [] as Player[],
    turnIndex: -1,
    reveal: {} as Record<string, { cards: string[]; hand: string }>,
    lastWinners: [] as string[],
    lastPrize: 0,
  });
  const [mine, setMine] = useState({ round: -1, cards: [] as string[], hand: "" });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const lastTick = useRef(0);
  const announcedTurn = useRef("");
  const noteRef = useRef(note);
  noteRef.current = note;

  // The table document.
  useEffect(() => {
    if (!enabled || !uid) return;
    return onSnapshot(doc(db, "room_game", TEEN_PATTI_ROOM), (snap) => {
      if (!snap.exists()) {
        setG((prev) => ({ ...prev, running: false, phase: "IDLE" }));
        return;
      }
      const rawPlayers = snap.get("players");
      const rawReveal = (snap.get("reveal") || {}) as Record<string, any>;
      setG({
        running: snap.get("gameRunning") === true,
        phase: String(snap.get("phase") || "IDLE"),
        phaseEndsAt: Number(snap.get("phaseEndsAt") || 0),
        round: Number(snap.get("roundNumber") || 0),
        boot: Number(snap.get("boot") || 200),
        stake: Number(snap.get("stake") || 400),
        pot: Number(snap.get("pot") || 0),
        players: Array.isArray(rawPlayers)
          ? rawPlayers
              .filter((m: any) => m && m.uid)
              .map((m: any) => ({
                uid: String(m.uid),
                username: String(m.username || ""),
                seen: m.seen === true,
                packed: m.packed === true,
                invested: Number(m.invested || 0),
              }))
          : [],
        turnIndex: Number(snap.get("turnIndex") ?? -1),
        reveal: Object.fromEntries(
          Object.entries(rawReveal).map(([k, v]) => [
            k,
            {
              cards: Array.isArray(v?.cards) ? v.cards.map(String) : [],
              hand: String(v?.hand || ""),
            },
          ])
        ),
        lastWinners: Array.isArray(snap.get("lastWinners")) ? snap.get("lastWinners").map(String) : [],
        lastPrize: Number(snap.get("lastPrize") || 0),
      });
    });
  }, [enabled, uid]);

  const act = (action: string, silent = false) => {
    if (busy && !silent) return;
    if (!silent) setBusy(true);
    const round = g.round;
    actionCall({ action, roundNumber: round })
      .then(({ data }) => {
        if (action === "see" && data?.cards?.length) {
          setMine({ round, cards: data.cards.map(String), hand: String(data.hand || "") });
          if (!silent) {
            noteRef.current(
              `Teen Patti Bot: Your cards: ${data.cards.map((c) => `[${c}]`).join(" ")} — ${data.hand || ""}`
            );
          }
        }
      })
      .catch((err: any) => {
        if (!silent) noteRef.current(`Teen Patti Bot: ${err?.message || "Something went wrong. Try again."}`);
      })
      .finally(() => {
        if (!silent) setBusy(false);
      });
  };

  const me = g.players.find((p) => p.uid === uid);
  const myCards = mine.round === g.round ? mine.cards : [];

  // Already seen (page reopened mid-hand) → fetch my cards again, quietly.
  useEffect(() => {
    if (!enabled) return;
    if (g.phase === "PLAYING" && me && me.seen && !me.packed && myCards.length === 0) act("see", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, g.phase, g.round, me?.seen, me?.packed, myCards.length]);

  // A private hint when it becomes my turn.
  useEffect(() => {
    if (!enabled || g.phase !== "PLAYING") return;
    const turn = g.players[g.turnIndex];
    if (!turn || turn.uid !== uid || turn.packed) return;
    const key = `${g.round}:${g.turnIndex}:${g.stake}`;
    if (announcedTurn.current === key) return;
    announcedTurn.current = key;
    const call = turn.seen ? g.stake : g.stake / 2;
    const raise = turn.seen ? g.stake * 2 : g.stake;
    noteRef.current(
      `Teen Patti Bot: 🎯 YOUR turn — playing ${turn.seen ? "seen" : "blind"} · Call ${call} · Raise ${raise} · or Pack`
    );
  }, [enabled, g.phase, g.round, g.turnIndex, g.stake, g.players, uid]);

  // Countdown, and move the game on when a timer ends (the server does it once).
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
        tickCall({}).catch(() => {});
      }
    }, 300);
    return () => clearInterval(t);
  }, [enabled, g.running, g.phaseEndsAt]);

  if (!enabled) return null;

  const left = g.phaseEndsAt - now;

  return {
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
    secondsLeft: g.running && left > 0 ? Math.ceil(left / 1000) : 0,
    myCards,
    myHand: mine.round === g.round ? mine.hand : "",
    busy,
    start: (boot: number) => {
      if (busy) return;
      setBusy(true);
      startCall({ boot, operationId: opId("start") })
        .catch((err: any) => noteRef.current(`Teen Patti Bot: ${err?.message || "Could not start."}`))
        .finally(() => setBusy(false));
    },
    join: () => {
      if (busy) return;
      setBusy(true);
      joinCall({ operationId: opId("join") })
        .catch((err: any) => noteRef.current(`Teen Patti Bot: ${err?.message || "Could not sit down."}`))
        .finally(() => setBusy(false));
    },
    act,
  };
}

// Chat commands in the Teen Patti room. True = handled (not posted as chat).
export function teenPattiHandleCommand(
  state: TeenPattiState,
  clean: string,
  note: (t: string) => void,
  defaultBoot: number
): boolean {
  const lower = clean.trim().toLowerCase();
  if (lower === "!start") {
    state.start(defaultBoot);
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
  if (lower === "!j" || lower === "!join") {
    state.join();
    return true;
  }
  if (actions[lower]) {
    state.act(actions[lower]);
    return true;
  }
  if (lower === "!help") {
    note(
      "Teen Patti Bot: !start [boot] · !j sit · !see cards · !bet call/chaal · !raise · !pack fold · !show (2 left) · !sideshow (seen players)"
    );
    return true;
  }
  return false;
}

export function TeenPattiTable({ state, uid }: { state: TeenPattiState; uid: string }) {
  const [boot, setBoot] = useState(200);
  const [raise, setRaise] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const meIdx = state.players.findIndex((p) => p.uid === uid);
  const me = state.players[meIdx];
  const myTurn = state.phase === "PLAYING" && meIdx >= 0 && state.turnIndex === meIdx;
  const active = state.players.filter((p) => !p.packed);
  const winners = new Set(state.lastWinners);

  // A new turn resets the raise toggle.
  useEffect(() => setRaise(false), [state.round, state.turnIndex]);

  const call = me ? (me.seen ? state.stake : state.stake / 2) : 0;
  const raiseAmt = me ? (me.seen ? state.stake * 2 : state.stake) : 0;
  const canRaise = state.stake < state.boot * 128;
  const amount = raise && canRaise ? raiseAmt : call;

  const title = !state.running
    ? "Teen Patti"
    : state.phase === "JOINING"
      ? `Sit down (${state.players.length}/10)`
      : `Pot 🪙 ${state.pot.toLocaleString()} · Stake ${state.stake.toLocaleString()}`;

  return (
    <div className="border-t border-amber-300/20 bg-gradient-to-b from-rose-900/30 to-transparent px-2 py-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-black text-amber-200">🎴 {title}</span>
        {state.running && state.secondsLeft > 0 && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              state.secondsLeft <= 3 ? "bg-red-500/80" : "bg-purple-700/80"
            }`}
          >
            ⏱ {state.secondsLeft}s
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="ml-auto rounded-lg border border-white/10 px-2 text-sm text-white/60 hover:bg-white/10"
        >
          {collapsed ? "+" : "−"}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* The table: oval felt with the seats on the rim, like the app */}
          <TpOvalTable state={state} uid={uid} meIdx={meIdx} winners={winners} />

          {!state.running && state.lastPrize > 0 && (
            <p className="mt-1 text-center text-xs text-emerald-300">
              ✅ Hand complete · prize 🪙 {state.lastPrize.toLocaleString()}
            </p>
          )}

          {/* Action bar */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {!state.running ? (
              <>
                <span className="text-xs text-white/50">Boot</span>
                {BOOT_OPTIONS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBoot(b)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                      boot === b
                        ? "border-amber-300 bg-amber-300 text-neutral-900"
                        : "border-white/10 text-white/70 hover:bg-white/5"
                    }`}
                  >
                    {b}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => state.start(boot)}
                  disabled={state.busy}
                  className="ml-auto rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black disabled:opacity-50"
                >
                  ▶ Start
                </button>
              </>
            ) : state.phase === "JOINING" && !me ? (
              <button
                type="button"
                onClick={state.join}
                disabled={state.busy}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-black disabled:opacity-50"
              >
                🪑 Sit down · 🪙 {state.boot.toLocaleString()}
              </button>
            ) : state.phase === "JOINING" ? (
              <span className="text-xs text-white/70">✅ Seated — waiting for the deal…</span>
            ) : !me ? (
              <span className="text-xs text-white/60">👀 Watching this hand</span>
            ) : me.packed ? (
              <span className="text-xs text-white/60">🚫 You packed · watching this hand</span>
            ) : (
              <div className="w-full space-y-2">
                {/* My cards */}
                {state.myCards.length === 3 && (
                  <div className="flex items-center justify-center gap-1">
                    {state.myCards.map((c, k) => (
                      <MiniCard key={k} card={c} size="md" />
                    ))}
                    <span className="ml-2 text-sm font-black text-amber-300">{state.myHand}</span>
                  </div>
                )}
                {/* Stake: − amount + */}
                <div className="flex items-center justify-center gap-2">
                  <TpButton color="bg-white/10 px-4" disabled={!raise} onClick={() => setRaise(false)}>
                    −
                  </TpButton>
                  <span className="min-w-[96px] rounded-lg border border-amber-300 px-3 py-1.5 text-center text-sm font-black text-amber-300">
                    🪙 {amount.toLocaleString()}
                  </span>
                  <TpButton color="bg-white/10 px-4" disabled={raise || !canRaise} onClick={() => setRaise(true)}>
                    +
                  </TpButton>
                </div>
                {/* Moves */}
                <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:justify-center [&>*:last-child:nth-child(odd)]:col-span-2">
                  <TpButton color="bg-red-700" disabled={state.busy} onClick={() => state.act("pack")}>
                    ✖ Pack
                  </TpButton>
                  {!me.seen && (
                    <TpButton color="bg-blue-700" disabled={state.busy} onClick={() => state.act("see")}>
                      👁 See cards
                    </TpButton>
                  )}
                  <TpButton
                    color={myTurn ? "bg-emerald-600 ring-2 ring-amber-300" : "bg-emerald-800"}
                    disabled={!myTurn || state.busy}
                    onClick={() => state.act(raise && canRaise ? "raise" : "call")}
                  >
                    {!myTurn
                      ? "Waiting…"
                      : me.seen
                        ? raise
                          ? "Raise"
                          : "Chaal"
                        : raise
                          ? "Raise blind"
                          : "Blind"}
                  </TpButton>
                  {active.length === 2 ? (
                    <TpButton color="bg-purple-700" disabled={!myTurn || state.busy} onClick={() => state.act("show")}>
                      🃏 Show
                    </TpButton>
                  ) : me.seen ? (
                    <TpButton
                      color="bg-purple-700"
                      disabled={!myTurn || state.busy}
                      onClick={() => state.act("sideshow")}
                    >
                      🤝 Side show
                    </TpButton>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TpButton({
  children,
  color,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  color: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-3 py-2.5 text-sm font-bold text-white transition active:scale-95 disabled:opacity-40 ${color}`}
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

function TpOvalTable({
  state,
  uid,
  meIdx,
  winners,
}: {
  state: TeenPattiState;
  uid: string;
  meIdx: number;
  winners: Set<string>;
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

  const justFinished = !state.running && state.lastWinners.length > 0 && state.players.length > 0;
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

  return (
    <div
      ref={boxRef}
      className="relative mx-1.5 my-1 overflow-hidden rounded-[20px] bg-gradient-to-b from-[#1C0833] via-[#12052A] to-[#0A0318]"
      style={{ aspectRatio: String(aspect) }}
    >
      {[
        [7, 9], [43, 5], [86, 12], [95, 40], [4, 55], [13, 90], [80, 88], [62, 95], [30, 97],
      ].map(([x, y]) => (
        <span key={`${x}${y}`} className="absolute h-1 w-1 rounded-full bg-[#B48CC8]/35" style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
      {w > 0 && (
        <>
          {/* wood rim → gold ring → felt */}
          <div
            className="absolute rounded-[50%] bg-gradient-to-b from-[#5E3413] via-[#3A1D08] to-[#5E3413] p-1.5 shadow-[0_8px_24px_rgba(176,36,106,.45)]"
            style={{ left: padX, top: padTop, width: ow, height: oh }}
          >
            <div className="h-full w-full rounded-[50%] bg-gradient-to-br from-[#FFE08A] via-[#D4A437] to-[#FFE9A6] p-[3px]">
              <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[50%] bg-[radial-gradient(ellipse,_#B4246C,_#8E1A57_60%,_#4E0B2E)]">
                <span className="absolute left-[17%] top-[20%] h-[60%] w-[66%] rounded-[50%] border-2 border-dashed border-[#E39A6A]/55" />
                <span className="absolute left-[14%] top-[8%] h-[42%] w-[72%] rounded-[50%] bg-gradient-to-b from-white/20 to-white/[0.04]" />
                <span className="relative text-[13px] font-bold tracking-[5px] text-[#E8A3B8]/85">MIGLIFE</span>
                <span className="relative my-0.5 text-lg leading-none">🪙</span>
                <span className="relative rounded-full border-[1.5px] border-[#E6BE5A] bg-[#2A0A1E] px-3.5 py-0.5 text-sm font-extrabold text-[#FFD166]">
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
              const canSit = meIdx < 0;
              return (
                <button
                  key={`e${slot}`}
                  type="button"
                  disabled={!canSit || state.busy}
                  onClick={() => canSit && state.join()}
                  className="absolute flex h-11 w-[52px] flex-col items-center justify-center"
                  style={{ left: w / 2 + dx - 26, top: centerY + dy - 22 }}
                >
                  <span className="flex h-6 w-6 animate-pulse items-center justify-center rounded-full border-[1.5px] border-[#D4A437] bg-white/20 text-[15px] font-bold leading-none text-white">
                    +
                  </span>
                  <span className="text-[8px] text-[#D4A437]">{canSit ? "Sit" : "Invite"}</span>
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
                      className={`absolute left-1/2 top-0 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full ${yellow ? "shadow-[0_0_16px_rgba(255,200,61,.6)]" : ""}`}
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
                      <div className="absolute -right-2.5 top-0 h-[26px] w-[30px]">
                        {[-12, 0, 12].map((angle, k) => (
                          <span key={k} className="absolute" style={{ left: k * 7, top: k === 1 ? -1 : 1, transform: `rotate(${angle}deg)` }}>
                            {cards.length === 3 ? <MiniCard card={cards[k]} size="xs" /> : <CardBack size="xs" />}
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
