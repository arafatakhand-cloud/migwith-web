"use client";

import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { serverNow } from "../../lib/serverTime";
import { RulesButton } from "./GuessRace";

// 👑 ROYAL TREASURE — "👑 Royal Treasure Official", run entirely by the server
// (royalTreasureStart / royalTreasureBet / royalTreasureTick, guessRaceWatchdog),
// same as the app's RoyalTreasureGame.kt:
//   !start · !b [chest 1-9] [amount] · !help
// 9 chests: 💎 ×7 (one), 🪙 half back (two), 💀 empty (six). About once in 80
// rounds the 💎 is a 👑 CROWN CHEST: ×50. The treasure is hidden by the server
// only when betting closes.

export const ROYAL_TREASURE_ROOM = "👑 Royal Treasure Official";
const RT_BOT = "Royal Treasure Bot";
const RT_OPEN_MS = 6_500;
const RT_MIN_BET = 100;
const RT_MAX_PER_CHEST = 100_000;
const RT_MAX_CHESTS = 4;
const CHIPS = [100, 500, 1000, 5000, 10000, 50000];
export const RT_MULT: Record<string, number> = { crown: 50, diamond: 7, gold: 0.5, empty: 0 };
const PRIZE_ICON: Record<string, string> = { crown: "👑", diamond: "💎", gold: "🪙", empty: "💀" };

const rtStart = httpsCallable(functions, "royalTreasureStart");
const rtBet = httpsCallable<{ chest: number; amount: number; operationId: string }, { bets?: Record<string, number> }>(functions, "royalTreasureBet");
const rtTick = httpsCallable(functions, "royalTreasureTick");

const errText = (e: any) => e?.message || "Something went wrong.";
const short = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(n >= 1e5 ? 0 : 1)}k` : String(Math.floor(n));
const fmt = (n: number) => Math.floor(n || 0).toLocaleString("en-US");
const opId = () => `rt_${crypto.randomUUID().replace(/-/g, "")}`;
function amountOf(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.replace(/,/g, "").toLowerCase();
  const n = s.endsWith("k") ? Number(s.slice(0, -1)) * 1000 : Number(s);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export type RoyalTreasureState = {
  running: boolean;
  phase: string;
  round: number;
  secondsLeft: number;
  now: number;
  /** what each chest holds once betting has closed ("" while hidden) */
  layout: string[];
  /** chest numbers in the order they open */
  openOrder: number[];
  openStartedAt: number;
  /** everyone's coins on each chest */
  totals: Record<number, number>;
  myBets: Record<number, number>;
  history: { round: number; big: number; crown: boolean }[];
  roundsSinceCrown: number;
  busy: boolean;
  amount: number;
  setAmount: (a: number) => void;
  start: () => void;
  bet: (chest: number, amount: number) => void;
};

export function useRoyalTreasure(roomId: string | null, uid: string | undefined, note: (t: string) => void): RoyalTreasureState | null {
  const [g, setG] = useState({
    running: false, phase: "IDLE", round: 0, phaseEndsAt: 0, openStartedAt: 0,
    layout: [] as string[], openOrder: [] as number[], totals: {} as Record<number, number>,
    history: [] as RoyalTreasureState["history"], roundsSinceCrown: 0,
  });
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<{ round: number; bets: Record<number, number> }>({ round: 0, bets: {} });
  const [myDoc, setMyDoc] = useState<{ round: number; bets: Record<number, number> }>({ round: 0, bets: {} });
  const [amount, setAmount] = useState(1000);
  const noteRef = useRef(note);
  noteRef.current = note;
  const on = roomId === ROYAL_TREASURE_ROOM;
  useEffect(() => {
    if (!on || !uid) return;
    return onSnapshot(doc(db, "room_game", ROYAL_TREASURE_ROOM), (d) => {
      if (!d.exists()) return;
      const totals: Record<number, number> = {};
      Object.entries((d.get("totals") || {}) as Record<string, unknown>).forEach(([k, v]) => (totals[Number(k)] = Number(v) || 0));
      setG({
        running: d.get("running") === true,
        phase: String(d.get("phase") || "IDLE"),
        round: Number(d.get("roundNumber") || 0),
        phaseEndsAt: Number(d.get("phaseEndsAt") || 0),
        openStartedAt: Number(d.get("openStartedAt") || 0),
        layout: Array.isArray(d.get("layout")) ? d.get("layout").map(String) : [],
        openOrder: Array.isArray(d.get("openOrder")) ? d.get("openOrder").map(Number) : [],
        totals,
        history: (Array.isArray(d.get("history")) ? d.get("history") : []).map((h: any) => ({
          round: Number(h?.round || 0),
          big: Number(h?.big || 0),
          crown: h?.crown === true,
        })),
        roundsSinceCrown: Number(d.get("roundsSinceCrown") || 0),
      });
    });
  }, [on, uid]);
  // my own bets this round (after a reload too)
  useEffect(() => {
    if (!on || !uid || !g.round) return;
    const round = g.round;
    return onSnapshot(
      query(collection(db, "room_game", ROYAL_TREASURE_ROOM, "rt_bets"), where("roundNumber", "==", round), where("uid", "==", uid)),
      (snap) => {
        const bets: Record<number, number> = {};
        snap.docs.forEach((d) => Object.entries((d.get("bets") || {}) as Record<string, unknown>).forEach(([k, v]) => (bets[Number(k)] = Number(v) || 0)));
        setMyDoc({ round, bets });
      },
      () => {}
    );
  }, [on, uid, g.round]);
  // ticks the server once a timer is up (the watchdog is the backup)
  const [now, setNow] = useState(() => serverNow());
  const last = useRef(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => {
      const n = serverNow();
      setNow(n);
      if (g.running && g.phaseEndsAt > 0 && n >= g.phaseEndsAt + 400 && Date.now() - last.current > 2000 && document.visibilityState === "visible") {
        last.current = Date.now();
        rtTick({}).catch(() => {});
      }
    }, g.phase === "OPENING" ? 60 : 250);
    return () => clearInterval(t);
  }, [on, g.running, g.phaseEndsAt, g.phase]);
  if (!on) return null;
  const myBets = mine.round === g.round ? mine.bets : myDoc.round === g.round ? myDoc.bets : {};
  return {
    running: g.running,
    phase: g.phase,
    round: g.round,
    secondsLeft: g.running && g.phase === "BETTING" ? Math.max(0, Math.ceil((g.phaseEndsAt - now) / 1000)) : 0,
    now,
    layout: g.layout,
    openOrder: g.openOrder,
    openStartedAt: g.openStartedAt,
    totals: g.totals,
    myBets,
    history: g.history,
    roundsSinceCrown: g.roundsSinceCrown,
    busy,
    amount,
    setAmount,
    start: () => {
      if (busy) return;
      setBusy(true);
      rtStart({})
        .catch((e) => noteRef.current(`${RT_BOT}: ${errText(e)}`))
        .finally(() => setBusy(false));
    },
    bet: (chest, amt) => {
      if (busy) return;
      setBusy(true);
      const round = g.round;
      rtBet({ chest, amount: amt, operationId: opId() })
        .then((r) => {
          const bets: Record<number, number> = {};
          Object.entries(r.data?.bets || {}).forEach(([k, v]) => (bets[Number(k)] = Number(v) || 0));
          setMine({ round, bets });
        })
        .catch((e) => noteRef.current(`${RT_BOT}: Bet rejected. ${errText(e)}`))
        .finally(() => setBusy(false));
    },
  };
}

/** Chat commands in the Royal Treasure room. True = handled (not posted as chat). */
export function royalTreasureHandleCommand(state: RoyalTreasureState, clean: string, note: (t: string) => void): boolean {
  const parts = clean.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  if (cmd === "!start") {
    state.start();
    return true;
  }
  if (cmd === "!b" || cmd === "!bet") {
    const chest = Number(parts[1]);
    const amount = amountOf(parts[2]) ?? state.amount;
    if (!Number.isInteger(chest) || chest < 1 || chest > 9) note(`${RT_BOT}: Use !b [chest 1-9] [amount] — e.g. !b 5 1000`);
    else state.bet(chest, amount);
    return true;
  }
  if (cmd === "!help") {
    note(`${RT_BOT}: !start · !b [chest 1-9] [amount] · 💎 ×7 · 🪙 half back · 👑 Crown Chest ×50`);
    return true;
  }
  return false;
}

const RT_RULES: [string, string][] = [
  ["▶ Start", "Anyone taps Start (or types !start). Then there are 20 seconds to bet."],
  ["💰 Betting", `Pick a coin amount, then tap a chest twice (or type !b 5 1000). Up to ${RT_MAX_CHESTS} chests per round, ${fmt(RT_MIN_BET)} – ${fmt(RT_MAX_PER_CHEST)} coins on each.`],
  ["🗝 The treasure", "When betting closes the server hides the treasure in the 9 chests — nobody can know it before. Then all the chests open."],
  ["💎 Diamond", "One chest holds the Diamond: it pays 7× the bet (1,000 → 7,000)."],
  ["🪙 Gold", "Two chests hold Gold: you get half of that bet back."],
  ["💀 Empty", "The other six chests are empty."],
  ["👑 Crown Chest", "About once in 80 rounds the Diamond becomes the CROWN: it pays 50× (1,000 → 50,000)!"],
  ["💳 Payouts", "Winnings are added to your balance a few seconds after the chests open. Everything shows in your Activity."],
];

function Chest({ open, prize, glow }: { open: boolean; prize: string; glow: boolean }) {
  return (
    <span className="relative mx-auto block h-[38px] w-[50px]" style={{ perspective: "200px" }}>
      <span
        className="absolute left-1/2 top-[6px] text-[22px] leading-none transition-all duration-500"
        style={{ transform: `translate(-50%, ${open ? -14 : 8}px) scale(${open ? 1 : 0.2})`, opacity: open ? 1 : 0 }}
      >
        {PRIZE_ICON[prize] || ""}
      </span>
      <span
        className="absolute bottom-0 left-0 h-[24px] w-[50px] rounded-[4px_4px_6px_6px] border-2"
        style={{ background: "linear-gradient(#9A5A24,#6B3612)", borderColor: "#E7B43A" }}
      >
        <span className="absolute left-[19px] top-[-2px] h-[11px] w-[8px] rounded-[2px] bg-[#FFD54A] shadow-[0_0_0_1px_#8A5A00]" />
      </span>
      <span
        className="absolute left-0 top-[1px] h-[15px] w-[50px] rounded-[14px_14px_3px_3px] border-2 transition-transform duration-500"
        style={{
          background: "linear-gradient(#B4702E,#83461A)",
          borderColor: "#E7B43A",
          transformOrigin: "50% 100%",
          transform: open ? "rotateX(115deg)" : "none",
          opacity: open ? 0.25 : 1,
        }}
      />
      {glow && <span className="rt-sparkle pointer-events-none absolute inset-[-10px]" />}
    </span>
  );
}

export function RoyalTreasurePanel({ state }: { state: RoyalTreasureState }) {
  const [armed, setArmed] = useState(0);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const betting = state.running && state.phase === "BETTING";
  const opening = state.phase === "OPENING" || state.phase === "SETTLING" || (!state.running && state.layout.length > 0);
  // how many chests are open by now (they open one by one over RT_OPEN_MS)
  const step = (RT_OPEN_MS - 1600) / 9;
  const openedCount =
    state.phase === "OPENING"
      ? Math.max(0, Math.min(9, Math.floor((state.now - state.openStartedAt - 500) / step) + 1))
      : opening
        ? 9
        : 0;
  const openSet = new Set(state.openOrder.slice(0, openedCount));
  const allOpen = openedCount >= 9 && state.layout.length === 9;
  const myWin = allOpen
    ? Object.entries(state.myBets).reduce((sum, [k, v]) => sum + Math.floor(Number(v) * (RT_MULT[state.layout[Number(k) - 1]] || 0)), 0)
    : 0;
  const myTotal = Object.values(state.myBets).reduce((a, b) => a + Number(b || 0), 0);
  const crownRound = state.layout.includes("crown");
  const bigChest = state.layout.findIndex((x) => x === "diamond" || x === "crown") + 1;
  // what I won with: 👑 / 💎 if I was on the big chest, else 🪙
  const wonBig = bigChest > 0 && Number(state.myBets[bigChest] || 0) > 0;
  // the win banner, shown once for 3 s after everything opened
  const [banner, setBanner] = useState<{ round: number; until: number } | null>(null);
  useEffect(() => {
    if (allOpen && (myWin > 0 || crownRound) && banner?.round !== state.round) setBanner({ round: state.round, until: Date.now() + 3200 });
  }, [allOpen, myWin, crownRound, state.round, banner?.round]);
  const showBanner = banner && banner.round === state.round && Date.now() < banner.until;

  const tap = (chest: number) => {
    if (!betting || state.busy) return;
    if (armed === chest) {
      setArmed(0);
      state.bet(chest, state.amount);
    } else {
      setArmed(chest);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(0), 700);
    }
  };

  const urgent = betting && state.secondsLeft <= 5;
  const title = betting
    ? state.busy
      ? "⏳ Sending bet…"
      : "👑 Royal Treasure · double-tap a chest"
    : state.phase === "OPENING"
      ? "🔒 Chests locked — opening…"
      : state.phase === "SETTLING"
        ? "💳 Paying the winners…"
        : "👑 Royal Treasure";

  return (
    <div
      className="relative m-1.5 rounded-[18px] border-[1.5px] px-2 pb-1.5 pt-2 shadow-[0_6px_18px_rgba(60,20,90,.35)]"
      style={{ background: "linear-gradient(160deg,#3B1660,#1E0B38 60%,#2A0F45)", borderColor: "#E7B43A" }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`min-w-[34px] rounded-xl px-2 py-0.5 text-center text-sm font-black ${urgent ? "animate-pulse" : ""}`}
          style={{ background: urgent ? "#E53935" : "#4A2370", color: urgent ? "#fff" : "#FFD86B" }}
        >
          {betting ? state.secondsLeft : "👑"}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-[#FFE7A3]">{title}</span>
        <RulesButton title="👑 Royal Treasure — how to play" rules={RT_RULES} />
      </div>
      <div className="mt-1.5 h-[2px] rounded-sm" style={{ background: "linear-gradient(90deg,transparent,#E7B43A,#FFF0B0,#E7B43A,transparent)" }} />

      <div className="mt-2 grid grid-cols-3 gap-[7px]">
        {Array.from({ length: 9 }, (_, i) => i + 1).map((c) => {
          const mineAmt = Number(state.myBets[c] || 0);
          const total = Number(state.totals[c] || 0);
          const isOpen = openSet.has(c);
          const prize = state.layout[c - 1] || "";
          const big = isOpen && (prize === "diamond" || prize === "crown");
          return (
            <button
              key={c}
              type="button"
              onClick={() => tap(c)}
              disabled={!betting}
              className={`relative flex h-[82px] select-none touch-manipulation flex-col items-center justify-end rounded-[14px] pb-1 transition-transform active:scale-95 ${
                armed === c ? "scale-105 ring-2 ring-[#FFF0B0]" : ""
              } ${big ? "rt-glow" : ""} ${isOpen && prize === "empty" ? "opacity-45" : ""}`}
              style={{
                background: mineAmt > 0 ? "radial-gradient(circle at 50% 30%,#FFF4C9,#F2C24D)" : "radial-gradient(circle at 50% 30%,#5A2A86,#2C1250)",
                border: `${mineAmt > 0 ? 2 : 1}px solid ${mineAmt > 0 ? "#D4A017" : big ? "#7FE7FF" : "#6B3F96"}`,
                filter: !betting && !isOpen && opening ? "saturate(.6) brightness(.85)" : undefined,
              }}
            >
              <span className={`absolute left-1.5 top-1 text-[10px] font-extrabold ${mineAmt > 0 ? "text-[#8A5A00]" : "text-[#C9A8F0]"}`}>{c}</span>
              {isOpen && prize !== "empty" && (
                <span className={`absolute right-1.5 top-1 text-[11px] font-black ${prize === "gold" ? "text-[#FFD54A]" : "text-[#7FE7FF]"}`}>
                  {prize === "gold" ? "½" : `×${RT_MULT[prize]}`}
                </span>
              )}
              <Chest open={isOpen} prize={prize} glow={big} />
              <span className={`mt-0.5 text-[11px] font-extrabold ${mineAmt > 0 ? "text-[#7A4E00]" : "text-[#FFE7A3]"}`}>
                {mineAmt > 0 ? `${short(mineAmt)} / ${short(total)}` : short(total)}
              </span>
            </button>
          );
        })}
      </div>

      {/* last rounds: where the 💎 / 👑 was */}
      <div className="mt-1.5 flex items-center gap-1 overflow-hidden text-[10px] text-[#E9D2FF]">
        <span className="shrink-0 opacity-80">Last:</span>
        {state.history.slice(0, 10).map((h) => (
          <span
            key={h.round}
            className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 font-black"
            style={{ background: h.crown ? "linear-gradient(#FFE9A6,#E7B43A)" : "#4A2370", color: h.crown ? "#5A3A00" : "#7FE7FF" }}
            title={`Round ${h.round}`}
          >
            {h.crown ? `👑${h.big}` : h.big}
          </span>
        ))}
        <span className="ml-auto shrink-0 opacity-80">
          👑 ×50{state.history.length === 0 ? "" : " · "}{state.history.length === 0 ? "" : state.roundsSinceCrown === 0 ? "last round" : `${state.roundsSinceCrown} round${state.roundsSinceCrown === 1 ? "" : "s"} ago`}
        </span>
      </div>

      {betting ? (
        <div className="mt-1.5 grid grid-cols-6 gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => state.setAmount(c)}
              className="h-[32px] rounded-xl border text-[13px] font-extrabold"
              style={
                state.amount === c
                  ? { background: "linear-gradient(#FFE9A6,#E7B43A)", color: "#5A3A00", borderColor: "#FFF0B0" }
                  : { background: "linear-gradient(#4A2370,#33185A)", color: "#FFE7A3", borderColor: "#6B3F96" }
              }
            >
              {c >= 1000 ? `${c / 1000}k` : c}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-[#FFE7A3]">
            {allOpen
              ? myTotal > 0
                ? myWin > 0
                  ? `🎉 You won ${fmt(myWin)} coins!`
                  : "No treasure for you this time."
                : crownRound
                  ? "👑 A Crown Chest round!"
                  : "Bet next round to win the treasure."
              : opening
                ? "🗝 Opening the chests…"
                : "💎 ×7 · 🪙 half back · 👑 ×50"}
          </span>
          {!state.running && (
            <button
              type="button"
              onClick={state.start}
              disabled={state.busy}
              className="shrink-0 rounded-xl px-4 py-[7px] text-[13px] font-black text-[#5A3A00] disabled:opacity-60"
              style={{ background: "linear-gradient(#FFE9A6,#E7B43A)" }}
            >
              ▶ Start
            </button>
          )}
        </div>
      )}

      {showBanner && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div
            className="rt-banner rounded-[20px] border-2 px-5 py-3 text-center shadow-2xl"
            style={{ background: "linear-gradient(135deg,#2A0F45,#5A2A86)", borderColor: "#FFD54A", color: "#FFE7A3" }}
          >
            <div className="text-[30px] leading-none">{wonBig ? (crownRound ? "👑" : "💎") : myWin > 0 ? "🪙" : "👑"}</div>
            {myWin > 0 ? (
              <div className="mt-1 text-[18px] font-black">YOU WON {fmt(myWin)}!</div>
            ) : (
              <div className="mt-1 text-[18px] font-black">CROWN CHEST!</div>
            )}
            {crownRound && (wonBig || myWin === 0) && <div className="text-[12px] font-bold">Chest {bigChest} pays ×50</div>}
          </div>
        </div>
      )}
    </div>
  );
}
