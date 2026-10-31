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
const RT_JACKPOT_SEED = 100_000;
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
  /** 👑 the Royal Jackpot now, and as it stood when betting closed */
  jackpot: number;
  jackpotAtClose: number;
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
    history: [] as RoyalTreasureState["history"], roundsSinceCrown: 0, jackpot: 0, jackpotAtClose: 0,
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
        jackpot: Number(d.get("jackpot") || 0),
        jackpotAtClose: Number(d.get("jackpotAtClose") || 0),
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
    jackpot: g.jackpot || RT_JACKPOT_SEED,
    jackpotAtClose: g.jackpotAtClose,
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
  ["💰 Royal Jackpot", "1% of every bet goes into the Royal Jackpot — you see it grow at the top. When the Crown Chest comes, everyone on it shares the whole Jackpot (by their bets on that chest) on top of the 50×. Nobody on it? The Jackpot keeps growing. After a win it starts again at 100,000."],
  ["💳 Payouts", "Winnings are added to your balance a few seconds after the chests open. Everything shows in your Activity."],
];

// 🧰 one treasure chest (wood, gold bands, keyhole); the lid swings open
function Chest({ open, prize, rays }: { open: boolean; prize: string; rays: "" | "dia" | "crown" }) {
  return (
    <span className="relative mx-auto block h-[50px] w-[62px]">
      {rays && <span className={`rt-rays ${rays === "crown" ? "rt-rays-gold" : ""}`} />}
      <svg viewBox="0 0 62 50" className="absolute inset-0 overflow-visible">
        <defs>
          <linearGradient id="rtw" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#B36A2C" />
            <stop offset="1" stopColor="#6A3410" />
          </linearGradient>
          <linearGradient id="rtg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#FFF1B0" />
            <stop offset=".5" stopColor="#F3C14B" />
            <stop offset="1" stopColor="#B9790E" />
          </linearGradient>
        </defs>
        <ellipse cx="31" cy="47" rx="24" ry="3" fill="rgba(0,0,0,.35)" />
        <rect x="6" y="21" width="50" height="25" rx="4" fill="url(#rtw)" stroke="url(#rtg)" strokeWidth="2.5" />
        <rect x="12" y="21" width="5" height="25" fill="url(#rtg)" />
        <rect x="45" y="21" width="5" height="25" fill="url(#rtg)" />
        <rect x="26" y="25" width="10" height="11" rx="2" fill="url(#rtg)" />
        <circle cx="31" cy="30" r="1.8" fill="#4A2600" />
        <rect x="30.3" y="30" width="1.4" height="3.5" fill="#4A2600" />
        <g className="rt-lid" style={{ transform: open ? "rotate(-32deg) translate(-6px,-10px)" : "none" }}>
          <path d="M6 21 Q6 6 31 6 Q56 6 56 21 Z" fill="url(#rtw)" stroke="url(#rtg)" strokeWidth="2.5" />
          <path d="M12 21 Q12 9 17 8 L17 21Z M45 8 Q50 9 50 21 L45 21Z" fill="url(#rtg)" />
          <path d="M14 13 Q31 4 48 13" stroke="rgba(255,255,255,.25)" strokeWidth="2" fill="none" />
        </g>
      </svg>
      <span
        className="absolute left-1/2 top-[14px] text-[26px] leading-none drop-shadow-[0_3px_6px_rgba(0,0,0,.45)] transition-all duration-500"
        style={{ transform: `translate(-50%, ${open ? -14 : 8}px) scale(${open ? 1 : 0.2})`, opacity: open ? 1 : 0 }}
      >
        {PRIZE_ICON[prize] || ""}
      </span>
    </span>
  );
}

const CHIP_COLORS = ["#5C6BC0", "#26A69A", "#E53935", "#8E24AA", "#FB8C00", "#212121"];

/** a number that rolls up to its new value */
function useRolling(target: number) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 700);
      const v = Math.round(a + (target - a) * (1 - Math.pow(1 - p, 3)));
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
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
  const crownRound = state.layout.includes("crown");
  const bigChest = state.layout.findIndex((x) => x === "diamond" || x === "crown") + 1;
  const myOnBig = bigChest > 0 ? Number(state.myBets[bigChest] || 0) : 0;
  const wonBig = myOnBig > 0;
  // 👑 my share of the jackpot (by my bet on the Crown Chest)
  const jackpotShare =
    allOpen && crownRound && myOnBig > 0 && Number(state.totals[bigChest] || 0) > 0
      ? Math.floor((state.jackpotAtClose * myOnBig) / Number(state.totals[bigChest]))
      : 0;
  const myGot = allOpen
    ? Object.entries(state.myBets).reduce((sum, [k, v]) => sum + Math.floor(Number(v) * (RT_MULT[state.layout[Number(k) - 1]] || 0)), 0) + jackpotShare
    : 0;
  const myTotal = Object.values(state.myBets).reduce((a, b) => a + Number(b || 0), 0);
  const net = myGot - myTotal;
  const jackpotShown = useRolling(state.jackpot);
  const bannerWin = useRolling(allOpen ? myGot : 0);

  // the big banner: a win on 💎 / 👑, or a Crown round — once, for 3.5 s
  const [banner, setBanner] = useState<{ round: number; until: number } | null>(null);
  useEffect(() => {
    if (allOpen && (wonBig || crownRound) && banner?.round !== state.round) setBanner({ round: state.round, until: Date.now() + 3500 });
  }, [allOpen, wonBig, crownRound, state.round, banner?.round]);
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
  const ring = betting ? Math.max(0, Math.min(1, state.secondsLeft / 20)) : 0;
  const sub = betting
    ? state.busy
      ? "⏳ Sending bet…"
      : `Double-tap a chest to bet · Round #${state.round}`
    : state.phase === "OPENING"
      ? "🔒 Chests locked — opening…"
      : state.phase === "SETTLING"
        ? "💳 Paying the winners…"
        : "Tap ▶ Start to play";

  return (
    <div
      className="relative m-1.5 overflow-hidden rounded-[22px] border-[1.5px] px-2.5 pb-2 pt-2.5 shadow-[0_10px_26px_rgba(40,10,80,.45)]"
      style={{ background: "radial-gradient(120% 80% at 50% 0%,#5B1E8C 0%,#2A0C4E 45%,#14062A 100%)", borderColor: "#F3C14B" }}
    >
      <span className="rt-beams pointer-events-none absolute inset-x-[-10%] top-[-40%] h-[120%]" />
      {/* header: countdown ring · name · rules */}
      <div className="relative flex items-center gap-2">
        <span className="relative h-[38px] w-[38px] shrink-0">
          <svg viewBox="0 0 38 38" className="absolute inset-0 -rotate-90">
            <circle cx="19" cy="19" r="16" fill="rgba(0,0,0,.35)" stroke="rgba(255,255,255,.15)" strokeWidth="3" />
            <circle
              cx="19"
              cy="19"
              r="16"
              fill="none"
              stroke={urgent ? "#FF6B6B" : "#FFD25A"}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="100.5"
              strokeDashoffset={100.5 * (1 - ring)}
              style={{ transition: "stroke-dashoffset .3s linear" }}
            />
          </svg>
          <b className={`absolute inset-0 flex items-center justify-center text-[14px] font-black ${urgent ? "text-[#FF6B6B]" : "text-[#FFE08A]"}`}>
            {betting ? state.secondsLeft : "👑"}
          </b>
        </span>
        <span className="min-w-0 flex-1 leading-none">
          <span className="rt-gold-text block truncate text-[17px] font-black tracking-[.5px]">👑 ROYAL TREASURE</span>
          <span className="mt-[3px] block truncate text-[10px] font-bold text-[#D9C2FF]">{sub}</span>
        </span>
        <RulesButton title="👑 Royal Treasure — how to play" rules={RT_RULES} />
      </div>

      {/* 👑 the jackpot */}
      <div
        className="rt-jack relative mt-2.5 flex items-center gap-2 overflow-hidden rounded-[14px] border-[1.5px] px-2.5 py-[7px]"
        style={{ background: "linear-gradient(90deg,#2B1300,#5A3300 50%,#2B1300)", borderColor: "#FFD25A" }}
      >
        <span className="text-[10px] font-black leading-[1.1] tracking-[1px] text-[#FFE08A]">
          👑 ROYAL
          <br />
          JACKPOT
        </span>
        <span className="rt-gold-text ml-auto text-[22px] font-black tabular-nums tracking-[.5px]">{fmt(jackpotShown)}</span>
      </div>

      <div className="relative mt-[7px] flex justify-center gap-[5px]">
        {[
          ["💎", "×7"],
          ["🪙", "½ back"],
          ["👑", "×50 + JACKPOT"],
        ].map(([i, t]) => (
          <span key={t} className="rounded-full border border-white/20 bg-white/[0.07] px-[9px] py-[3px] text-[10.5px] font-extrabold text-[#F3E6FF]">
            {i} <b className="text-[#FFE08A]">{t}</b>
          </span>
        ))}
      </div>

      {/* the 9 chests */}
      <div className="relative mt-2 grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }, (_, i) => i + 1).map((c) => {
          const mineAmt = Number(state.myBets[c] || 0);
          const total = Number(state.totals[c] || 0);
          const isOpen = openSet.has(c);
          const prize = state.layout[c - 1] || "";
          const rays = isOpen && prize === "crown" ? "crown" : isOpen && prize === "diamond" ? "dia" : "";
          return (
            <button
              key={c}
              type="button"
              onClick={() => tap(c)}
              disabled={!betting}
              className={`relative flex h-[96px] select-none touch-manipulation flex-col items-center justify-end rounded-[16px] border pb-[5px] transition-transform active:scale-95 ${
                armed === c ? "scale-105" : ""
              } ${rays === "crown" ? "rt-crown" : rays === "dia" ? "rt-dia" : ""} ${isOpen && prize === "empty" ? "opacity-40 grayscale-[.5]" : ""}`}
              style={{
                background: "linear-gradient(160deg,rgba(255,255,255,.10),rgba(255,255,255,.02)),radial-gradient(circle at 50% 35%,#4D1E7A,#22093F)",
                borderColor: mineAmt > 0 || prize === "gold" ? "#F3C14B" : "rgba(201,160,255,.35)",
                boxShadow: mineAmt > 0 && !rays ? "0 0 0 1px rgba(243,193,75,.4),0 0 16px rgba(243,193,75,.35)" : undefined,
                filter: !betting && !isOpen && opening ? "brightness(.8) saturate(.7)" : undefined,
              }}
            >
              <span className="absolute left-[7px] top-[5px] text-[10px] font-black text-[#BFA2EC]">{c}</span>
              {mineAmt > 0 && (
                <span className="rt-mybet absolute right-[5px] top-1 rounded-[9px] px-1.5 text-[10px] font-black text-[#3A2400] shadow-[0_2px_6px_rgba(0,0,0,.35)]">
                  {short(mineAmt)}
                </span>
              )}
              <Chest open={isOpen} prize={prize} rays={rays} />
              <span className="text-[11px] font-extrabold tabular-nums" style={{ color: isOpen && prize !== "empty" ? "#FFE08A" : "#F3E6FF" }}>
                {isOpen && prize === "crown" ? "×50 + JACKPOT" : isOpen && prize === "diamond" ? "×7" : isOpen && prize === "gold" ? "½ back" : short(total)}
              </span>
            </button>
          );
        })}
      </div>

      {/* last rounds: where the 💎 / 👑 was */}
      <div className="relative mt-2 flex items-center gap-1 overflow-hidden text-[10px] text-[#E9D2FF]">
        <span className="shrink-0 opacity-80">Last:</span>
        {state.history.slice(0, 10).map((h) => (
          <span
            key={h.round}
            className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 font-black"
            style={{ background: h.crown ? "linear-gradient(#FFE9A6,#E7B43A)" : "rgba(255,255,255,.1)", color: h.crown ? "#5A3A00" : "#8FF0FF" }}
            title={`Round ${h.round}`}
          >
            {h.crown ? `👑${h.big}` : h.big}
          </span>
        ))}
        <span className="ml-auto shrink-0 opacity-80">
          {state.history.length === 0
            ? ""
            : `👑 ${state.roundsSinceCrown === 0 ? "last round" : `${state.roundsSinceCrown} round${state.roundsSinceCrown === 1 ? "" : "s"} ago`}`}
        </span>
      </div>

      {betting ? (
        <>
          {/* casino chips */}
          <div className="relative mt-2 grid grid-cols-6 gap-1.5">
            {CHIPS.map((c, i) => {
              const sel = state.amount === c;
              const col = CHIP_COLORS[i];
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => state.setAmount(c)}
                  className={`mx-auto flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-dashed border-white/55 text-[11px] font-black text-white transition-transform ${
                    sel ? "-translate-y-1 scale-110 shadow-[0_0_0_2px_#FFF1B8,0_0_14px_rgba(255,220,120,.9)]" : "shadow-[0_3px_0_rgba(0,0,0,.35)]"
                  }`}
                  style={{ background: `radial-gradient(circle,${col} 55%,#fff 56%,#fff 60%,${col} 61%)` }}
                >
                  {c >= 1000 ? `${c / 1000}k` : c}
                </button>
              );
            })}
          </div>
          <p className="relative mt-1.5 text-center text-[11px] font-extrabold text-[#E9D7FF]">
            On one chest: 💎 wins <b className="text-[#8FF0FF]">{fmt(state.amount * 7)}</b> · 👑 wins{" "}
            <b className="text-[#FFE08A]">{fmt(state.amount * 50)} + Jackpot</b>
          </p>
        </>
      ) : (
        <div className="relative mt-2 flex items-center gap-2 rounded-[14px] border border-white/10 bg-black/25 px-2.5 py-[7px]">
          <span className="min-w-0 flex-1 text-[12px] font-extrabold leading-tight text-[#F3E6FF]">
            {allOpen && myTotal > 0
              ? `🧾 You bet ${fmt(myTotal)} · got ${fmt(myGot)}`
              : allOpen && crownRound
                ? "👑 A Crown Chest round!"
                : opening
                  ? "🗝 Opening the chests…"
                  : "💎 ×7 · 🪙 half back · 👑 ×50 + Jackpot"}
          </span>
          {allOpen && myTotal > 0 && (
            <span className={`shrink-0 text-[14px] font-black tabular-nums ${net >= 0 ? "text-[#7CFF8A]" : "text-[#FF8A8A]"}`}>
              {net >= 0 ? "+" : "−"}
              {fmt(Math.abs(net))}
            </span>
          )}
          {!state.running && (
            <button
              type="button"
              onClick={state.start}
              disabled={state.busy}
              className="shrink-0 rounded-xl px-3.5 py-[7px] text-[12px] font-black text-[#3A2400] disabled:opacity-60"
              style={{ background: "linear-gradient(#FFF1B8,#F3C14B)" }}
            >
              ▶ Start
            </button>
          )}
        </div>
      )}

      {showBanner && (
        <>
          {crownRound && <span className="rt-confetti pointer-events-none absolute inset-0 z-10" />}
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div
              className="rt-banner w-[290px] rounded-[22px] border-2 px-4 py-3.5 text-center text-[#FFF6D5] shadow-[0_0_40px_rgba(255,210,90,.6),0_14px_40px_rgba(0,0,0,.5)]"
              style={{ background: "radial-gradient(120% 120% at 50% 0%,#7A2BB5,#2A0C4E)", borderColor: "#FFD25A" }}
            >
              <div className="text-[38px] leading-none">{crownRound ? "👑" : "💎"}</div>
              <div className="mt-1 text-[13px] font-black tracking-[2px] text-[#FFE08A]">
                {crownRound ? (jackpotShare > 0 ? "CROWN CHEST · JACKPOT!" : "CROWN CHEST!") : "DIAMOND!"}
              </div>
              {wonBig ? (
                <>
                  <div className="rt-gold-text text-[30px] font-black tabular-nums">+{fmt(bannerWin)}</div>
                  <div className="text-[12px] font-extrabold opacity-90">
                    Chest {bigChest} · {fmt(myOnBig)} × {crownRound ? 50 : 7} = {fmt(myOnBig * (crownRound ? 50 : 7))}
                    {jackpotShare > 0 && (
                      <>
                        <br />+ 👑 Jackpot {fmt(jackpotShare)}
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="mt-1 text-[12px] font-extrabold opacity-90">
                  Chest {bigChest} pays ×{crownRound ? 50 : 7}
                  {crownRound ? " + the Jackpot" : ""}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
