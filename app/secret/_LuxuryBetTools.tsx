"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import { input } from "./_Shell";

// miGlife secret → 🎰 Luxury Bet (LuxuryBetControl.kt) and 🔍 Payout Check
// (LuxuryBetAudit.kt). Same server API as the app: founderLuxuryBetLevel /
// founderLuxuryBetAudit. Changes apply from the next round.

type Schedule = { id: string; level: number; daily: boolean; date: string; from: string; to: string };
type LevelInfo = {
  level?: number;
  activeLevel?: number;
  activeSource?: string;
  activeScheduleId?: string;
  dhokaOn?: boolean;
  dhokaNext?: number[];
  dhokaRound?: number;
  dhokaPayout?: number;
  schedules?: Schedule[];
};
const levelCall = httpsCallable<Record<string, unknown>, LevelInfo>(functions, "founderLuxuryBetLevel");

const LEVELS = [
  { n: 1, name: "Easy", rtp: "RTP ~135%", win: "win ~38%", color: "#2EC27E" },
  { n: 2, name: "Medium Easy", rtp: "RTP ~119%", win: "win ~35%", color: "#7BC74D" },
  { n: 3, name: "Normal Medium", rtp: "RTP ~110%", win: "win ~31%", color: "#B7C33A" },
  { n: 4, name: "Medium", rtp: "RTP ~99%", win: "win ~27%", color: "#F2B705" },
  { n: 5, name: "Medium Hard", rtp: "RTP ~90%", win: "win ~22%", color: "#F28C28" },
  { n: 6, name: "Hard", rtp: "RTP ~74%", win: "win ~22%", color: "#E8572A" },
  { n: 7, name: "Very Hard", rtp: "RTP ~60%", win: "win ~17%", color: "#C62828" },
];
const lv = (n: number | undefined) => LEVELS.find((l) => l.n === n);
const RTP: Record<number, number> = { 1: 135, 2: 119, 3: 110, 4: 99, 5: 90, 6: 74, 7: 60 };

type Plan = { icon: string; name: string; hint: string; items: [number, string, string][] };
// 📋 whole-day plans, easiest (players win most) → hardest (house wins most)
const PLANS: Plan[] = [
  { icon: "🎁", name: "Gift day", hint: "Almost all day Easy — a big thank-you to players", items: [[2, "00:00", "06:00"], [1, "06:00", "23:59"]] },
  { icon: "🌟", name: "Super Friday", hint: "Easy almost all day, Medium Easy after midnight", items: [[3, "00:00", "06:00"], [2, "06:00", "10:00"], [1, "10:00", "23:59"]] },
  { icon: "🥳", name: "Happy weekend", hint: "Easy afternoon & night, soft morning", items: [[2, "00:00", "03:00"], [3, "03:00", "08:00"], [2, "08:00", "12:00"], [2, "12:00", "16:00"], [1, "16:00", "20:00"], [1, "20:00", "23:59"]] },
  { icon: "🌅", name: "Early bird", hint: "Easy 5–10 AM, light the rest of the day", items: [[3, "00:00", "05:00"], [1, "05:00", "10:00"], [2, "10:00", "14:00"], [3, "14:00", "19:00"], [2, "19:00", "23:59"]] },
  { icon: "🌙", name: "Easy nights", hint: "Easy late night, light daytime", items: [[1, "00:00", "06:00"], [3, "06:00", "10:00"], [3, "10:00", "14:00"], [3, "14:00", "18:00"], [2, "18:00", "21:00"], [2, "21:00", "23:59"]] },
  { icon: "☕", name: "Coffee & chill", hint: "Easy breakfast & tea time, Normal Medium between", items: [[4, "00:00", "06:00"], [1, "06:00", "09:00"], [3, "09:00", "16:00"], [1, "16:00", "18:00"], [3, "18:00", "23:59"]] },
  { icon: "🎉", name: "Happy hours", hint: "Medium base, Easy 8–10 PM, light lunch", items: [[4, "00:00", "06:00"], [3, "06:00", "12:00"], [2, "12:00", "14:00"], [3, "14:00", "18:00"], [2, "18:00", "20:00"], [1, "20:00", "22:00"], [2, "22:00", "23:59"]] },
  { icon: "🎓", name: "After office", hint: "Easy 5–9 PM when people come home", items: [[4, "00:00", "07:00"], [3, "07:00", "12:00"], [4, "12:00", "17:00"], [1, "17:00", "21:00"], [3, "21:00", "23:59"]] },
  { icon: "🌤", name: "Gentle day", hint: "Light all day, Medium overnight", items: [[4, "00:00", "06:00"], [3, "06:00", "12:00"], [3, "12:00", "18:00"], [2, "18:00", "21:00"], [3, "21:00", "23:59"]] },
  { icon: "🌓", name: "Half & half", hint: "Easy until noon, Medium Hard after", items: [[2, "00:00", "06:00"], [2, "06:00", "12:00"], [5, "12:00", "18:00"], [5, "18:00", "23:59"]] },
  { icon: "⚖️", name: "Balanced day", hint: "Even for players and house", items: [[5, "00:00", "06:00"], [3, "06:00", "12:00"], [4, "12:00", "18:00"], [3, "18:00", "20:00"], [1, "20:00", "22:00"], [4, "22:00", "23:59"]] },
  { icon: "🍱", name: "Lunch & evening boost", hint: "Easy at 12–2 PM and 8–10 PM, harder in between", items: [[5, "00:00", "06:00"], [4, "06:00", "12:00"], [2, "12:00", "14:00"], [5, "14:00", "18:00"], [4, "18:00", "20:00"], [2, "20:00", "22:00"], [5, "22:00", "23:59"]] },
  { icon: "🧭", name: "Steady medium", hint: "Medium all day, a bit harder at night", items: [[5, "00:00", "06:00"], [4, "06:00", "12:00"], [4, "12:00", "18:00"], [4, "18:00", "23:59"]] },
  { icon: "🎢", name: "Roller coaster", hint: "Swings Easy ↔ Hard every few hours", items: [[6, "00:00", "04:00"], [2, "04:00", "08:00"], [5, "08:00", "12:00"], [1, "12:00", "14:00"], [6, "14:00", "18:00"], [2, "18:00", "20:00"], [5, "20:00", "23:59"]] },
  { icon: "🧊", name: "Cool down", hint: "Hard morning, gets easier toward night", items: [[5, "00:00", "06:00"], [6, "06:00", "12:00"], [5, "12:00", "16:00"], [4, "16:00", "20:00"], [3, "20:00", "23:59"]] },
  { icon: "🔥", name: "Busy evening", hint: "Medium evening keeps players in, harder elsewhere", items: [[6, "00:00", "06:00"], [4, "06:00", "12:00"], [5, "12:00", "18:00"], [4, "18:00", "21:00"], [5, "21:00", "23:59"]] },
  { icon: "🎯", name: "Peak squeeze", hint: "Hard at busy hours 8–11 PM, Medium elsewhere", items: [[5, "00:00", "06:00"], [4, "06:00", "12:00"], [5, "12:00", "18:00"], [5, "18:00", "20:00"], [7, "20:00", "23:00"], [5, "23:00", "23:59"]] },
  { icon: "🌃", name: "Night owl tax", hint: "Medium day, Hard late night", items: [[7, "00:00", "05:00"], [6, "05:00", "08:00"], [4, "08:00", "18:00"], [4, "18:00", "22:00"], [6, "22:00", "23:59"]] },
  { icon: "💰", name: "Profit day", hint: "Hard daytime, Very Hard late night, Medium evening", items: [[7, "00:00", "06:00"], [5, "06:00", "12:00"], [6, "12:00", "18:00"], [4, "18:00", "23:59"]] },
  { icon: "🧱", name: "Tight day", hint: "Hard most of the day, Medium Hard evening", items: [[7, "00:00", "06:00"], [6, "06:00", "12:00"], [6, "12:00", "18:00"], [5, "18:00", "21:00"], [6, "21:00", "23:59"]] },
  { icon: "🏰", name: "Fortress", hint: "Hard all day, Very Hard after midnight", items: [[7, "00:00", "06:00"], [6, "06:00", "23:59"]] },
  { icon: "🏦", name: "Max profit", hint: "Very Hard nights & afternoon, short break 8–10 PM", items: [[7, "00:00", "06:00"], [6, "06:00", "12:00"], [7, "12:00", "18:00"], [6, "18:00", "20:00"], [5, "20:00", "22:00"], [7, "22:00", "23:59"]] },
];

const GOLD = "#D4AF37";
const NIGHT = "#1E1A2E";
const CREAM = "#F2E6C2";
const MUTED = "#5B6B8C";

function hmToMin(hm: string): number | null {
  const [h, m = "0"] = hm.split(":");
  const hh = Number(h);
  const mm = Number(m);
  return Number.isInteger(hh) && Number.isInteger(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 ? hh * 60 + mm : null;
}
const minToHm = (min: number) => {
  const v = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};
function hm12(hm: string): string {
  const v = hmToMin(hm);
  if (v === null) return hm;
  const h = Math.floor(v / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(v % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** Bangladesh date key, `days` from today. */
function dhakaDate(days = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + days * 86_400_000)
  );
}
function dhakaNowMin(): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = Number(p.find((x) => x.type === "hour")?.value || 0) % 24;
  return h * 60 + Number(p.find((x) => x.type === "minute")?.value || 0);
}
const prettyDate = (k: string) => (k === dhakaDate(0) ? "Today" : k === dhakaDate(1) ? "Tomorrow" : k);

function planRtp(p: Plan): number {
  let mins = 0;
  let sum = 0;
  for (const [l, f, t] of p.items) {
    const a = hmToMin(f);
    const b = hmToMin(t);
    if (a === null || b === null) continue;
    const d = b > a ? b - a : b + 1440 - a;
    mins += d;
    sum += d * (RTP[l] ?? 100);
  }
  return mins === 0 ? 100 : Math.floor((sum + mins / 2) / mins);
}
const GROUPS = [
  { key: "player", label: "🟢 Player friendly", color: "#2EC27E" },
  { key: "balanced", label: "🟡 Balanced", color: "#F2B705" },
  { key: "profit", label: "🔴 House profit", color: "#E5484D" },
] as const;
const planGroup = (p: Plan) => {
  const r = planRtp(p);
  return r > 105 ? GROUPS[0] : r >= 95 ? GROUPS[1] : GROUPS[2];
};

// do two time ranges (each may run past midnight) share any minute?
function overlap(f1: string, t1: string, f2: string, t2: string): boolean {
  const ranges = (f: string, t: string): [number, number][] => {
    const a = hmToMin(f);
    const b = hmToMin(t);
    if (a === null || b === null) return [];
    return a < b ? [[a, b]] : [[a, 1440], [0, b]];
  };
  return ranges(f1, t1).some(([a1, b1]) => ranges(f2, t2).some(([a2, b2]) => a1 < b2 && a2 < b1));
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2 rounded-[18px] border bg-white p-3.5" style={{ borderColor: `${GOLD}73` }}>
      <p className="text-base font-extrabold">{title}</p>
      {hint && <p className="text-xs" style={{ color: MUTED }}>{hint}</p>}
      {children}
    </div>
  );
}

function Highlight({ title, badge, hint, children }: { title: string; badge: string; hint?: string; children: ReactNode }) {
  return (
    <div
      className="space-y-2 rounded-[20px] p-3.5 shadow-md"
      style={{
        background: `linear-gradient(#fff, #fff) padding-box, linear-gradient(135deg, ${GOLD}, #FF8A3D, #FFE08A, ${GOLD}) border-box`,
        border: "2px solid transparent",
      }}
    >
      <div className="flex items-center">
        <p className="flex-1 text-[17px] font-black">{title}</p>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-black tracking-[0.8px]"
          style={{ color: NIGHT, background: `linear-gradient(90deg, ${GOLD}, #FFE08A)` }}
        >
          ★ {badge}
        </span>
      </div>
      {hint && <p className="text-xs" style={{ color: MUTED }}>{hint}</p>}
      {children}
    </div>
  );
}

function Chip({ text, selected, color = NIGHT, onClick }: { text: string; selected: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 whitespace-nowrap rounded-full px-3 py-[7px] text-xs font-semibold"
      style={selected ? { background: color, color: "#fff" } : { background: "rgba(11,31,58,0.07)" }}
    >
      {text}
    </button>
  );
}

function Step({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black" style={{ background: NIGHT, color: GOLD }}>
        {n}
      </span>
      <span className="text-[13px] font-bold">{label}</span>
    </div>
  );
}

/** 24-hour bar: normal level as a faint base, schedules on top, a needle at "now". */
function Timeline({ schedules, normal, showNow = true, compact = false }: { schedules: Pick<Schedule, "level" | "daily" | "date" | "from" | "to">[]; normal: number; showNow?: boolean; compact?: boolean }) {
  const today = dhakaDate(0);
  const yesterday = dhakaDate(-1);
  const blocks: { a: number; b: number; c: string }[] = [];
  for (const sc of schedules) {
    const c = lv(sc.level)?.color;
    const f = hmToMin(sc.from);
    const t = hmToMin(sc.to);
    if (!c || f === null || t === null) continue;
    if (f < t) {
      if (sc.daily || sc.date === today) blocks.push({ a: f, b: t, c });
    } else {
      if (sc.daily || sc.date === today) blocks.push({ a: f, b: 1440, c });
      if (sc.daily || sc.date === yesterday) blocks.push({ a: 0, b: t, c });
    }
  }
  const now = dhakaNowMin();
  return (
    <div>
      <div className={`relative w-full rounded-lg ${compact ? "h-3" : "h-7"}`} style={{ background: `${lv(normal)?.color || "#888888"}38` }}>
        {blocks.map((x, i) => (
          <span
            key={i}
            className="absolute inset-y-0 rounded-md"
            style={{ left: `${(x.a / 1440) * 100}%`, width: `max(3px, ${((x.b - x.a) / 1440) * 100}%)`, background: x.c }}
          />
        ))}
        {showNow && (
          <span className="absolute -inset-y-0.5 w-[2px] bg-[#0B1F3A]" style={{ left: `${(now / 1440) * 100}%` }}>
            <span className="absolute -left-[3px] -top-[3px] h-2 w-2 rounded-full bg-[#0B1F3A]" />
          </span>
        )}
      </div>
      {!compact && (
        <div className="mt-0.5 flex justify-between text-[10px]" style={{ color: MUTED }}>
          {["12 AM", "6 AM", "12 PM", "6 PM", "12 AM"].map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Confirm({ title, text, ok, onOk, onCancel }: { title: string; text: string; ok: string; onOk: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-extrabold">{title}</p>
        <p className="whitespace-pre-line text-sm text-[#3A4B6B]">{text}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-2 text-sm font-bold text-[#5B6B8C]">
            Cancel
          </button>
          <button type="button" onClick={onOk} className="px-3 py-2 text-sm font-bold text-[#2F80ED]">
            {ok}
          </button>
        </div>
      </div>
    </div>
  );
}

type Day = "every" | "today" | "tomorrow" | "date";

/** 🎰 LUXURY BET CONTROL — NOW card, anytime level change, ready plans (and ধোকা), normal level, today's plan, schedule builder. */
export function LuxuryBetControlCard() {
  const [info, setInfo] = useState<LevelInfo>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pickLevel, setPickLevel] = useState(1);
  const [planFilter, setPlanFilter] = useState<string | null>(null);
  const [planAsk, setPlanAsk] = useState<Plan | null>(null);
  const [dhokaAsk, setDhokaAsk] = useState(false);
  const [editId, setEditId] = useState("");
  const [lastDeleted, setLastDeleted] = useState<Schedule | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [scLevel, setScLevel] = useState(1);
  const [scDay, setScDay] = useState<Day>("every");
  const [scDate, setScDate] = useState("");
  const [scFrom, setScFrom] = useState("");
  const [scTo, setScTo] = useState("");
  const [scPreset, setScPreset] = useState("");
  const busyRef = useRef(false);
  busyRef.current = busy;

  const current = info.level || 0;
  const active = info.activeLevel || 0;
  const source = info.activeSource || "none";
  const activeId = info.activeScheduleId || "";
  const schedules = info.schedules || [];
  const dhokaOn = info.dhokaOn === true;
  const activeSchedule = schedules.find((s) => s.id === activeId);

  const call = (args: Record<string, unknown>, ok: string | null) => {
    setBusy(true);
    setFailed(false);
    levelCall(args)
      .then(({ data }) => {
        setInfo(data || {});
        setNote(ok);
      })
      .catch((e) => {
        setFailed(true);
        setNote(e?.message || "Something went wrong");
      })
      .finally(() => setBusy(false));
  };
  // several server steps in a row (plans, edit = remove + add)
  const chain = async (steps: Record<string, unknown>[], ok: string) => {
    setBusy(true);
    setFailed(false);
    try {
      let last: LevelInfo | null = null;
      for (const st of steps) last = (await levelCall(st)).data;
      if (last) setInfo(last);
      setNote(ok);
    } catch (e: any) {
      setFailed(true);
      setNote(e?.message || "Something went wrong");
    }
    setBusy(false);
  };
  const addArgs = (level: number, daily: boolean, date: string, from: string, to: string) => ({ action: "addSchedule", level, daily, date, from, to });
  const quickBoost = (level: number, minutes: number) => {
    const start = Math.floor(dhakaNowMin() / 5) * 5;
    const steps: Record<string, unknown>[] = [];
    // a boost replaces a running schedule, so the new level starts right away
    if (activeId) steps.push({ action: "removeSchedule", id: activeId });
    steps.push(addArgs(level, false, dhakaDate(0), minToHm(start), minToHm(start + minutes)));
    chain(steps, `⚡ ${lv(level)?.name} for ${minutes >= 60 ? `${Math.floor(minutes / 60)} h` : `${minutes} min`} — from now`);
  };

  useEffect(() => {
    call({ action: "get" }, null);
    // keep the NOW card fresh (schedules switch on/off by the clock)
    const t = setInterval(() => {
      if (!busyRef.current) call({ action: "get" }, null);
    }, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (active >= 1 && active <= 7) setPickLevel(active);
  }, [active]);

  const now = lv(active);
  const pl = lv(pickLevel)!;
  const toMidnight = Math.max(5, 1439 - Math.floor(dhakaNowMin() / 5) * 5);
  const nowRounded = Math.floor(dhakaNowMin() / 5) * 5;
  const presets: [string, string, string][] = [
    ["⚡ Now +1h", minToHm(nowRounded), minToHm(nowRounded + 60)],
    ["⚡ Now +2h", minToHm(nowRounded), minToHm(nowRounded + 120)],
    ["🌅 Morning", "06:00", "12:00"],
    ["☀️ Afternoon", "12:00", "18:00"],
    ["🌆 Evening", "18:00", "23:59"],
    ["🌙 All night", "00:00", "06:00"],
    ["🕛 All day", "00:00", "23:59"],
  ];
  const builderDate = scDay === "today" ? dhakaDate(0) : scDay === "tomorrow" ? dhakaDate(1) : scDay === "date" ? scDate : "";
  const clash =
    scFrom && scTo
      ? schedules.find((sc) => (scDay === "every" || sc.daily || sc.date === builderDate) && overlap(scFrom, scTo, sc.from, sc.to))
      : undefined;
  const ready = !!scFrom && !!scTo && scFrom !== scTo && (scDay !== "date" || !!scDate);
  const dayText = scDay === "every" ? "every day" : scDay === "today" ? "today" : scDay === "tomorrow" ? "tomorrow" : scDate || "…";
  const sl = lv(scLevel)!;
  let lastGroup = "";

  return (
    <div className="space-y-3">
      {/* NOW card */}
      <div className="space-y-1.5 rounded-[20px] border-[1.5px] p-4" style={{ background: NIGHT, borderColor: GOLD }}>
        <div className="flex items-center">
          <span className="mr-2 h-[9px] w-[9px] animate-pulse rounded-full" style={{ background: now?.color || "#888" }} />
          <span className="flex-1 text-[11px] font-bold tracking-[1.5px]" style={{ color: CREAM }}>
            RUNNING NOW
          </span>
          {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#D4AF37] border-t-transparent" />}
        </div>
        <p className="text-[26px] font-black" style={{ color: now ? `color-mix(in srgb, ${now.color} 75%, white)` : "#fff" }}>
          {now ? `${now.n}. ${now.name}` : "Luxury Bot settings"}
        </p>
        <p className="text-xs" style={{ color: CREAM }}>
          {source === "schedule" && activeSchedule
            ? `⏰ By schedule until ${hm12(activeSchedule.to)} · then ${lv(current)?.name || "normal"}`
            : source === "dhoka"
              ? `🎭 ধোকা চলছে · round #${info.dhokaRound || 0} · level changes every round`
              : source === "manual"
                ? "Normal level — no schedule is on right now"
                : "No level chosen yet — pick one below"}
        </p>
        {now && (
          <div className="flex flex-wrap gap-1.5">
            {[now.rtp, now.win, "100 on 2x → 270"].map((t) => (
              <span key={t} className="rounded-full bg-white/[0.08] px-2 py-[3px] text-[11px] font-semibold" style={{ color: CREAM }}>
                {t}
              </span>
            ))}
          </div>
        )}
        {source === "schedule" && activeId && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setLastDeleted(activeSchedule || null);
              call({ action: "removeSchedule", id: activeId }, "⏹ Stopped — back to the normal level");
            }}
            className="rounded-full bg-white/[0.18] px-3 py-[7px] text-xs font-bold text-white"
          >
            ⏹ Stop now
          </button>
        )}
      </div>

      {/* ⚡ anytime level change */}
      <Highlight title="⚡ Anytime level change" badge="1 TAP" hint="Pick a level, then tap how long. It starts right now.">
        <div className="flex items-center gap-1">
          {LEVELS.map((l) => {
            const sel = l.n === pickLevel;
            return (
              <button
                key={l.n}
                type="button"
                disabled={busy}
                onClick={() => setPickLevel(l.n)}
                className={`flex flex-1 flex-col items-center justify-center rounded-xl font-black ${sel ? "h-[58px] text-[19px] text-white" : "h-12 text-[15px]"}`}
                style={{ background: sel ? l.color : `${l.color}40`, outline: sel ? `2px solid ${GOLD}` : undefined }}
              >
                {l.n}
                {l.n === active && <span className="text-[9px] font-bold">now</span>}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 rounded-xl p-2.5" style={{ background: `${pl.color}1F` }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: pl.color }} />
          <span className="flex-1 text-sm font-bold">
            {pl.n}. {pl.name}
          </span>
          <span className="text-[11px]" style={{ color: MUTED }}>
            {pl.rtp} · {pl.win}
          </span>
        </div>
        <p className="text-[13px] font-bold">How long?</p>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {[15, 30, 60, 120, 180, 360].map((min) => (
            <button
              key={min}
              type="button"
              disabled={busy}
              onClick={() => quickBoost(pl.n, min)}
              className="shrink-0 rounded-full px-3.5 py-2 text-[13px] font-bold text-white"
              style={{ background: pl.color }}
            >
              {min >= 60 ? `${min / 60} h` : `${min} min`}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => quickBoost(pl.n, toMidnight)}
            className="flex-1 rounded-full border-[1.5px] py-2 text-[13px] font-bold"
            style={{ borderColor: pl.color }}
          >
            🌙 Till 12 AM
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              // becomes the normal level; a running schedule is stopped so it shows right away
              const steps: Record<string, unknown>[] = [];
              if (activeId) {
                setLastDeleted(activeSchedule || null);
                steps.push({ action: "removeSchedule", id: activeId });
              }
              steps.push({ action: "set", level: pl.n });
              chain(steps, `✅ ${pl.name} is now the normal level`);
            }}
            className="flex-1 rounded-full py-2 text-[13px] font-bold text-white"
            style={{ background: NIGHT }}
          >
            ♾ Always
          </button>
        </div>
      </Highlight>

      {/* 📋 ready plans + 🎭 ধোকা */}
      <Highlight title="📋 Ready plans" badge={`${PLANS.length + 1} PLANS`} hint="Easiest → hardest. One tap sets the whole day; one-day schedules stay.">
        <div
          className="space-y-1.5 rounded-[14px] p-3"
          style={{ background: `linear-gradient(135deg, ${NIGHT}, #3A2456)`, outline: dhokaOn ? `2px solid ${GOLD}` : undefined }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[22px]">🎭</span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-base font-black text-white">
                ধোকা
                {dhokaOn && (
                  <span className="rounded-full px-1.5 text-[10px] font-black" style={{ background: GOLD, color: NIGHT }}>
                    ● ON
                  </span>
                )}
              </p>
              <p className="text-[11px]" style={{ color: CREAM }}>
                প্রতি রাউন্ডে: কয়েক রাউন্ড দিবে দিবে সেইম → কয়েক রাউন্ড উলটা পালটা → আবার দিবে… সব এলোমেলো, কেউ ধরতে পারবে না
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black" style={{ color: GOLD }}>
                {dhokaOn && (info.dhokaPayout || 0) > 0 ? `~${info.dhokaPayout}%` : "~107–112%"}
              </p>
              <p className="text-[10px]" style={{ color: CREAM }}>
                payout
              </p>
            </div>
          </div>
          {dhokaOn && (info.dhokaNext || []).length > 0 && (
            <>
              <p className="text-[10px] font-bold" style={{ color: CREAM }}>
                Next 30 rounds · from #{info.dhokaRound}
              </p>
              <div className="flex items-end gap-[2px]">
                {(info.dhokaNext || []).map((n, i) => (
                  <span
                    key={i}
                    className={`flex-1 rounded-[3px] ${i === 0 ? "h-[18px] border-[1.5px] border-white" : "h-3.5"}`}
                    style={{ background: lv(n)?.color || "#888" }}
                  />
                ))}
              </div>
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => (dhokaOn ? call({ action: "setDhoka", on: false }, "⏹ ধোকা বন্ধ — back to the normal level") : setDhokaAsk(true))}
            className="w-full rounded-full py-[9px] text-[13px] font-extrabold"
            style={dhokaOn ? { background: "rgba(255,255,255,.16)", color: "#fff" } : { background: GOLD, color: NIGHT }}
          >
            {dhokaOn ? "⏹ বন্ধ করো" : "▶ চালু করো"}
          </button>
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          <Chip text={`All ${PLANS.length}`} selected={planFilter === null} color="#0B1F3A" onClick={() => setPlanFilter(null)} />
          {GROUPS.map((g) => (
            <Chip
              key={g.key}
              text={`${g.label} ${PLANS.filter((p) => planGroup(p).key === g.key).length}`}
              selected={planFilter === g.key}
              color={g.color}
              onClick={() => setPlanFilter(g.key)}
            />
          ))}
        </div>
        {PLANS.map((p, i) => {
          const g = planGroup(p);
          if (planFilter && planFilter !== g.key) return null;
          const header = !planFilter && g.key !== lastGroup;
          lastGroup = g.key;
          return (
            <div key={p.name}>
              {header && (
                <p className="pb-1 pt-1 text-xs font-extrabold" style={{ color: g.color }}>
                  {g.label}
                </p>
              )}
              <button type="button" disabled={busy} onClick={() => setPlanAsk(p)} className="w-full space-y-1.5 rounded-[14px] bg-[#0B1F3A0A] p-2.5 text-left">
                <span className="flex items-center gap-2">
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white" style={{ background: g.color }}>
                    {i + 1}
                  </span>
                  <span className="text-lg">{p.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{p.name}</span>
                    <span className="block text-[11px]" style={{ color: MUTED }}>
                      {p.hint}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-black" style={{ color: g.color }}>
                      ~{planRtp(p)}%
                    </span>
                    <span className="block text-[10px]" style={{ color: MUTED }}>
                      payout
                    </span>
                  </span>
                </span>
                <Timeline schedules={p.items.map(([level, from, to]) => ({ level, from, to, daily: true, date: "" }))} normal={current} showNow={false} compact />
                <span className="flex justify-between text-[9px]" style={{ color: MUTED }}>
                  {["12A", "6A", "12P", "6P", "12A"].map((s, k) => (
                    <span key={k}>{s}</span>
                  ))}
                </span>
              </button>
            </div>
          );
        })}
      </Highlight>

      {/* normal level */}
      <Section title="Normal level" hint="Runs whenever no schedule is on. Tap to change.">
        <div className="flex items-center gap-1">
          {LEVELS.map((l) => {
            const sel = l.n === current;
            return (
              <button
                key={l.n}
                type="button"
                disabled={busy || sel}
                onClick={() => call({ action: "set", level: l.n }, `✅ Normal level: ${l.n}. ${l.name}`)}
                className={`flex flex-1 items-center justify-center rounded-[10px] font-black ${sel ? "h-[52px] text-lg text-white" : "h-10 text-sm"}`}
                style={{ background: sel ? l.color : `${l.color}47`, outline: sel ? "2px solid rgba(11,31,58,.6)" : undefined }}
              >
                {l.n}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-[11px] font-bold">
          <span style={{ color: LEVELS[0].color }}>Easy</span>
          <span style={{ color: LEVELS[6].color }}>Very Hard</span>
        </div>
        {lv(current) && (
          <p className="text-[13px] font-semibold">
            {current}. {lv(current)!.name} · {lv(current)!.rtp} · {lv(current)!.win}
          </p>
        )}
      </Section>

      {/* today's plan */}
      <Section title="Today's plan" hint="Bangladesh time · coloured blocks are schedules">
        <Timeline schedules={schedules} normal={current} />
        {dhokaOn && (
          <p className="text-[11px]" style={{ color: MUTED }}>
            🎭 ধোকা runs whenever no schedule is on — it changes every round, not by the clock
          </p>
        )}
        {schedules.length === 0 && (
          <p className="text-xs" style={{ color: MUTED }}>
            No schedules — the normal level runs all day.
          </p>
        )}
        {schedules.map((sc) => {
          const l = lv(sc.level);
          const on = !!sc.id && sc.id === activeId;
          return (
            <div key={sc.id}>
              <div
                className="flex items-center overflow-hidden rounded-[14px] border"
                style={{ background: on ? `${l?.color || "#888"}24` : "rgba(11,31,58,.04)", borderColor: on ? l?.color || "#888" : "transparent" }}
              >
                <span className="h-14 w-1.5 shrink-0" style={{ background: l?.color || "#888" }} />
                <button type="button" onClick={() => setEditId(editId === sc.id ? "" : sc.id)} className="min-w-0 flex-1 px-3 py-2 text-left">
                  <span className="flex items-center gap-1.5 text-sm font-bold">
                    {l?.n ?? "?"}. {l?.name ?? "?"}
                    {on && (
                      <span className="rounded-full px-1.5 text-[10px] font-black text-white" style={{ background: l?.color || "#888" }}>
                        ● ON NOW
                      </span>
                    )}
                  </span>
                  <span className="block text-xs" style={{ color: MUTED }}>
                    {sc.daily ? "🔁 Every day" : `📅 ${prettyDate(sc.date)}`} · {hm12(sc.from)} – {hm12(sc.to)}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setLastDeleted(sc);
                    call({ action: "removeSchedule", id: sc.id }, "🗑 Schedule removed");
                  }}
                  className="px-3 text-base font-bold text-[#E5484D]"
                >
                  ✕
                </button>
              </div>
              {editId === sc.id && (
                <div className="no-scrollbar flex gap-1.5 overflow-x-auto py-1.5 pl-2">
                  {LEVELS.map((nl) => (
                    <Chip
                      key={nl.n}
                      text={`${nl.n}. ${nl.name}`}
                      selected={nl.n === l?.n}
                      color={nl.color}
                      onClick={() => {
                        if (nl.n === l?.n) return;
                        setEditId("");
                        chain([{ action: "removeSchedule", id: sc.id }, addArgs(nl.n, sc.daily, sc.date, sc.from, sc.to)], `✅ Changed to ${nl.name}`);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Section>

      {/* quick builder */}
      {!builderOpen ? (
        <button
          type="button"
          onClick={() => {
            setBuilderOpen(true);
            setNote(null);
          }}
          className="h-12 w-full rounded-[14px] text-[15px] font-extrabold"
          style={{ background: NIGHT, color: GOLD }}
        >
          ＋ Add a schedule
        </button>
      ) : (
        <Section title="New schedule">
          <Step n="1" label="Level" />
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {LEVELS.map((l) => (
              <Chip key={l.n} text={`${l.n}. ${l.name}`} selected={l.n === scLevel} color={l.color} onClick={() => setScLevel(l.n)} />
            ))}
          </div>
          <Step n="2" label="Day" />
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
            <Chip text="🔁 Every day" selected={scDay === "every"} onClick={() => setScDay("every")} />
            <Chip text="Today" selected={scDay === "today"} onClick={() => setScDay("today")} />
            <Chip text="Tomorrow" selected={scDay === "tomorrow"} onClick={() => setScDay("tomorrow")} />
            <label
              className="relative shrink-0 whitespace-nowrap rounded-full px-3 py-[7px] text-xs font-semibold"
              style={scDay === "date" ? { background: NIGHT, color: "#fff" } : { background: "rgba(11,31,58,0.07)" }}
            >
              {scDay === "date" && scDate ? `📅 ${scDate}` : "📅 Pick date"}
              <input
                type="date"
                value={scDate}
                onChange={(e) => {
                  setScDate(e.target.value);
                  if (e.target.value) setScDay("date");
                }}
                className="absolute inset-0 opacity-0"
              />
            </label>
          </div>
          <Step n="3" label="Time" />
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {presets.map(([label, f, t]) => (
              <Chip
                key={label}
                text={label}
                selected={scPreset === label}
                onClick={() => {
                  setScPreset(label);
                  setScFrom(f);
                  setScTo(t);
                }}
              />
            ))}
            <Chip text="✏️ Custom" selected={scPreset === "custom"} onClick={() => setScPreset("custom")} />
          </div>
          {scPreset === "custom" && (
            <div className="flex items-center gap-2 text-xs">
              <span>From</span>
              <input type="time" value={scFrom} onChange={(e) => setScFrom(e.target.value)} className={`${input} !w-auto !py-1.5`} />
              <span>to</span>
              <input type="time" value={scTo} onChange={(e) => setScTo(e.target.value)} className={`${input} !w-auto !py-1.5`} />
            </div>
          )}
          {clash && (
            <p className="text-xs font-semibold text-[#E08A00]">
              ⚠ Overlaps {lv(clash.level)?.name} {hm12(clash.from)} – {hm12(clash.to)}
            </p>
          )}
          <div className="flex items-center gap-2 rounded-xl p-2.5" style={{ background: `${sl.color}1F` }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: sl.color }} />
            <span className="text-[13px] font-semibold">
              {sl.name}, {dayText}
              {scFrom && scTo ? `, ${hm12(scFrom)} – ${hm12(scTo)}` : " — pick a time"}
            </span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setBuilderOpen(false)} className="flex-1 rounded-xl border border-[#C9D3E3] py-2.5 font-bold">
              Cancel
            </button>
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() => {
                call(
                  { action: "addSchedule", level: scLevel, daily: scDay === "every", date: builderDate, from: scFrom, to: scTo },
                  `✅ Added: ${sl.name}, ${dayText}, ${hm12(scFrom)} – ${hm12(scTo)}`
                );
                setBuilderOpen(false);
                setScPreset("");
                setScFrom("");
                setScTo("");
              }}
              className="flex-[2] rounded-xl bg-[#2EC27E] py-2.5 font-extrabold text-white disabled:opacity-50"
            >
              Add schedule
            </button>
          </div>
        </Section>
      )}

      {note && (
        <div className="flex items-center justify-center gap-2">
          <p className="text-center text-[13px] font-semibold" style={{ color: failed ? "#E5484D" : "#1E7A3C" }}>
            {note}
          </p>
          {lastDeleted && !failed && (note.startsWith("🗑") || note.startsWith("⏹")) && (
            <button
              type="button"
              onClick={() => {
                const d = lastDeleted;
                setLastDeleted(null);
                call(addArgs(d.level || 1, d.daily, d.date, d.from, d.to), "↩ Restored");
              }}
              className="text-sm font-bold text-[#2F80ED]"
            >
              ↩ Undo
            </button>
          )}
        </div>
      )}

      {dhokaAsk && (
        <Confirm
          title="🎭 ধোকা চালু করবে?"
          text={
            "রাউন্ড ধরে চলবে: ৩–৮ রাউন্ড একই Easy (দিবে দিবে সেইম), তারপর ৪–১০ রাউন্ড Hard ↔ Easy উলটা পালটা, আবার দিবে… সংখ্যা আর লেভেল সব এলোমেলো, প্রতিবার চালু করলে নতুন secret।\nতোমার Every-day schedule গুলো সরে যাবে; আজ/তারিখের schedule আর ⚡ boost আগের মতো কাজ করবে।\nবন্ধ করলে বা ♾ Always চাপলে normal level-এ ফিরবে।"
          }
          ok="চালু করো"
          onCancel={() => setDhokaAsk(false)}
          onOk={() => {
            setDhokaAsk(false);
            call({ action: "setDhoka", on: true }, "🎭 ধোকা চালু — next round থেকে");
          }}
        />
      )}
      {planAsk && (
        <Confirm
          title={`${planAsk.icon} Use "${planAsk.name}"?`}
          text={`Players get back ~${planRtp(planAsk)}% on average.\nYour Every-day schedules will be replaced by this plan:\n${planAsk.items
            .map(([l, f, t]) => `• ${lv(l)?.name}: ${hm12(f)} – ${hm12(t)}`)
            .join("\n")}\nOne-day schedules stay as they are.`}
          ok="Use plan"
          onCancel={() => setPlanAsk(null)}
          onOk={() => {
            const p = planAsk;
            setPlanAsk(null);
            const steps: Record<string, unknown>[] = [
              ...(dhokaOn ? [{ action: "setDhoka", on: false }] : []),
              ...schedules.filter((s) => s.daily).map((s) => ({ action: "removeSchedule", id: s.id })),
              ...p.items.map(([l, f, t]) => addArgs(l, true, "", f, t)),
            ];
            chain(steps, `✅ ${p.name} is set`);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 🔍 payout check

type AuditLine = { character: string; bet: number; bids: number; multiplier: number; win: number; raw: number };
type Flagged = {
  round: number;
  username: string;
  bet: number;
  paid: number;
  expected: number;
  flags: string[];
  lines: AuditLine[];
  result: { character: string; multiplier: number }[];
  why: string;
};
type Audit = {
  empty?: boolean;
  from?: number;
  to?: number;
  bettors?: number;
  totalBet?: number;
  totalPaid?: number;
  house?: number;
  rtp?: number;
  counts?: { over?: number; under?: number; capped?: number; big?: number };
  stacked?: number;
  biggest?: { username: string; round: number; paid: number } | null;
  top?: { username: string; rounds: number; bet: number; paid: number; best: number; net: number }[];
  flagged?: Flagged[];
  flaggedTotal?: number;
  rules?: { maxBet?: number; oldCap?: number };
};
const auditCall = httpsCallable<{ rounds: number; threshold: number; username: string }, Audit>(functions, "founderLuxuryBetAudit");

const AU = { red: "#E5484D", amber: "#F2A100", green: "#2EC27E", purple: "#8E5CF7", blue: "#3A8DFF" };
const FLAGS = [
  { key: "over", label: "🚨 Overpaid", color: AU.red },
  { key: "under", label: "⚠ Underpaid", color: AU.amber },
  { key: "big", label: "💎 Big wins", color: AU.purple },
  { key: "capped", label: "✂ Old cap", color: AU.blue },
] as const;
const au = (n: number | undefined) => Math.trunc(n || 0).toLocaleString("en-US");
// 2,880,000 → "28.8 লাখ"
const lakh = (n: number | undefined) => {
  const v = n || 0;
  return Math.abs(v) >= 100_000 ? `${(v / 100_000).toFixed(1).replace(/\.0$/, "")} লাখ` : au(v);
};

function Stat({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="flex-1 rounded-[14px] bg-[#0B1F3A0D] p-3">
      <p className="text-[11px] font-semibold" style={{ color: MUTED }}>
        {label}
      </p>
      <p className="text-lg font-black" style={{ color }}>
        {value}
      </p>
      {sub && (
        <p className="line-clamp-2 text-[10px]" style={{ color: MUTED }}>
          {sub}
        </p>
      )}
    </div>
  );
}

/** 🔍 LUXURY BET PAYOUT CHECK — re-checks every win of the last N rounds. */
export function LuxuryBetAuditCard() {
  const [rounds, setRounds] = useState(200);
  const [threshold, setThreshold] = useState(2_900_000);
  const [user, setUser] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Audit | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const run = (who = user) => {
    setBusy(true);
    setErr(null);
    setOpen(null);
    auditCall({ rounds, threshold, username: who.trim() })
      .then(({ data }) => setData(data))
      .catch((e) => setErr(e?.message || "Check failed"))
      .finally(() => setBusy(false));
  };
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const d = data;
  const over = d?.counts?.over || 0;
  const under = d?.counts?.under || 0;
  const big = d?.counts?.big || 0;
  const capped = d?.counts?.capped || 0;
  const bad = over + under;
  const oldCap = d?.rules?.oldCap || 2_880_000;
  const maxBet = d?.rules?.maxBet || 12_000;
  const vColor = !d ? GOLD : bad > 0 ? AU.red : AU.green;
  const flagged = d?.flagged || [];
  const shown = flagged.filter((f) => !filter || f.flags.includes(filter));
  const house = d?.house || 0;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 rounded-[20px] border-[1.5px] p-4" style={{ background: NIGHT, borderColor: vColor }}>
        <div className="flex items-center">
          <span className="flex-1 text-[11px] font-bold tracking-[1.5px]" style={{ color: CREAM }}>
            PAYOUT CHECK
          </span>
          {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#D4AF37] border-t-transparent" />}
        </div>
        <p className="text-2xl font-black" style={{ color: vColor }}>
          {!d && busy ? "Checking…" : !d ? "—" : d.empty ? "No rounds yet" : over > 0 ? `🚨 ${over} overpaid` : under > 0 ? `⚠ ${under} underpaid` : "✅ সব payout ঠিক আছে"}
        </p>
        {d && !d.empty && (
          <>
            <p className="text-xs" style={{ color: CREAM }}>
              Rounds #{au(d.from)}–#{au(d.to)} · {au(d.bettors)} bets checked{user.trim() ? ` · @${user.trim()}` : ""}
            </p>
            {bad === 0 && big > 0 && (
              <p className="text-xs" style={{ color: CREAM }}>
                💎 {big} win{big > 1 ? "s" : ""} above {lakh(threshold)} — maths is correct, see why below
              </p>
            )}
          </>
        )}
        {err && <p className="text-xs" style={{ color: AU.red }}>{err}</p>}
      </div>

      <Section title="Check what?">
        <p className="text-xs" style={{ color: MUTED }}>Last rounds</p>
        <div className="flex gap-1.5">
          {[50, 100, 200, 500].map((r) => (
            <button key={r} type="button" onClick={() => setRounds(r)} className="rounded-full px-3.5 py-2 text-[13px] font-bold" style={r === rounds ? { background: NIGHT, color: GOLD } : { background: "rgba(11,31,58,.07)" }}>
              {r}
            </button>
          ))}
        </div>
        <p className="text-xs" style={{ color: MUTED }}>Big win means more than</p>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {[2_900_000, 2_000_000, 1_000_000, 500_000].map((t) => (
            <button key={t} type="button" onClick={() => setThreshold(t)} className="shrink-0 rounded-full px-3.5 py-2 text-[13px] font-bold" style={t === threshold ? { background: NIGHT, color: GOLD } : { background: "rgba(11,31,58,.07)" }}>
              {lakh(t)}
            </button>
          ))}
        </div>
        <input value={user} onChange={(e) => setUser(e.target.value.slice(0, 30))} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="Only this user (optional)" className={input} />
        <button type="button" disabled={busy} onClick={() => run()} className="h-12 w-full rounded-[14px] text-[15px] font-extrabold disabled:opacity-60" style={{ background: NIGHT, color: GOLD }}>
          {busy ? "Checking…" : "🔍 Check now"}
        </button>
      </Section>

      {d && !d.empty && (
        <>
          <Section title="Totals">
            <div className="flex gap-2">
              <Stat label="Total bet" value={lakh(d.totalBet)} color="#0B1F3A" />
              <Stat label="Total paid" value={lakh(d.totalPaid)} color="#0B1F3A" />
            </div>
            <div className="flex gap-2">
              <Stat label={house >= 0 ? "House profit" : "House loss"} value={lakh(Math.abs(house))} color={house >= 0 ? AU.green : AU.red} />
              <Stat label="Real RTP" value={`${d.rtp || 0}%`} color="#0B1F3A" />
            </div>
            <div className="flex gap-2">
              <Stat label="Biggest win" value={lakh(d.biggest?.paid)} color={AU.purple} sub={d.biggest ? `${d.biggest.username} · #${au(d.biggest.round)}` : undefined} />
              <Stat label="Stacked bids" value={au(d.stacked)} color={AU.blue} sub={`more than ${au(maxBet)} on one character`} />
            </div>
          </Section>

          {(big > 0 || capped > 0) && (
            <div className="space-y-1.5 rounded-2xl border p-3.5" style={{ background: `${AU.purple}1A`, borderColor: `${AU.purple}80` }}>
              <p className="text-[15px] font-extrabold">🤔 কেন এত বড় win?</p>
              {[
                `Win-এর কোনো সীমা নেই এখন — যত নিয়ম বলে, পুরোটাই পায়। (আগের ${lakh(oldCap)} সীমা বাদ দেওয়া হয়েছে; তার আগের রাউন্ডগুলো ✂ Old cap দেখায়।)`,
                `Max ${au(maxBet)} প্রতি bid-এ। একই character-এ বার বার bid করা যায় (40 সেকেন্ডে ~50 বার), তাই এক character-এ ৬ লাখ পর্যন্ত জমতে পারে।`,
                `Win = bet × (multiplier + 1) × 0.9  →  6 লাখ × 6x = ${lakh(3_780_000)}। একই রাউন্ডে ২–৩টা character জিতলে মোট আরো বেশি।`,
              ].map((t, i) => (
                <p key={i} className="flex gap-2 text-xs">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white" style={{ background: `linear-gradient(135deg, ${AU.purple}, ${AU.blue})` }}>
                    {i + 1}
                  </span>
                  <span>{t}</span>
                </p>
              ))}
              <p className="text-[11px]" style={{ color: MUTED }}>ভুল payout হলে উপরে 🚨 Overpaid বা ⚠ Underpaid দেখাত।</p>
            </div>
          )}

          <Section title="Flagged wins" hint={(d.flaggedTotal || 0) > flagged.length ? `Showing ${flagged.length} of ${au(d.flaggedTotal)}` : undefined}>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              <Chip text={`All ${flagged.length}`} selected={!filter} color="#0B1F3A" onClick={() => setFilter(null)} />
              {FLAGS.map((f) => (
                <Chip
                  key={f.key}
                  text={`${f.label} ${{ over, under, big, capped }[f.key]}`}
                  selected={filter === f.key}
                  color={f.color}
                  onClick={() => setFilter(filter === f.key ? null : f.key)}
                />
              ))}
            </div>
            {shown.length === 0 && <p className="text-[13px]" style={{ color: MUTED }}>{flagged.length === 0 ? "Nothing to flag 🎉" : "None in this filter"}</p>}
            {shown.map((fl) => {
              const key = `${fl.round}_${fl.username}`;
              const main = FLAGS.find((f) => fl.flags.includes(f.key)) || FLAGS[2];
              const expanded = open === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOpen(expanded ? null : key)}
                  className="w-full space-y-1 rounded-[14px] border p-3 text-left"
                  style={{ background: `${main.color}14`, borderColor: `${main.color}${expanded ? "E6" : "59"}` }}
                >
                  <span className="flex items-center">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-extrabold">{fl.username}</span>
                      <span className="block text-[11px]" style={{ color: MUTED }}>
                        Round #{au(fl.round)} · bet {lakh(fl.bet)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-base font-black" style={{ color: main.color }}>
                        {lakh(fl.paid)}
                      </span>
                      {fl.paid !== fl.expected && (
                        <span className="block text-[10px]" style={{ color: MUTED }}>
                          should be {lakh(fl.expected)}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {FLAGS.filter((f) => fl.flags.includes(f.key)).map((f) => (
                      <span key={f.key} className="rounded-full px-[7px] py-0.5 text-[10px] font-bold text-white" style={{ background: f.color }}>
                        {f.label}
                      </span>
                    ))}
                  </span>
                  <span className="block text-xs">{fl.why}</span>
                  {expanded && (
                    <span className="block space-y-1 pt-1">
                      <span className="block text-[11px]" style={{ color: MUTED }}>
                        Result: {fl.result.map((r) => `${r.character} ${r.multiplier}x`).join("  ")}
                      </span>
                      <span className="block h-px bg-[#0B1F3A1A]" />
                      {fl.lines.map((l, i) => (
                        <span key={i} className="flex items-center">
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-bold">{l.character}</span>
                            <span className="block text-[11px]" style={{ color: MUTED }}>
                              {au(l.bet)} ({au(l.bids)} bids){l.multiplier > 0 ? ` × (${l.multiplier}+1) × 0.9` : " · lost"}
                            </span>
                          </span>
                          <span className="text-[13px] font-bold" style={{ color: l.multiplier > 0 ? AU.green : MUTED }}>
                            {l.multiplier > 0 ? au(l.win) : "0"}
                          </span>
                        </span>
                      ))}
                      <span className="block h-px bg-[#0B1F3A1A]" />
                      <span className="flex text-xs">
                        <span className="flex-1" style={{ color: MUTED }}>Rule says</span>
                        <b>{au(fl.expected)}</b>
                      </span>
                      <span className="flex text-xs">
                        <span className="flex-1" style={{ color: MUTED }}>Actually paid</span>
                        <b style={{ color: fl.paid === fl.expected ? AU.green : AU.red }}>{au(fl.paid)}</b>
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </Section>

          {(d.top || []).length > 0 && (
            <Section title="🏆 Top winners" hint="Net = paid − bet in these rounds · tap to check only them">
              {(d.top || []).map((p, i) => (
                <button
                  key={p.username}
                  type="button"
                  onClick={() => {
                    setUser(p.username);
                    run(p.username);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl bg-[#0B1F3A0A] px-2.5 py-2 text-left"
                >
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-black" style={{ background: i < 3 ? GOLD : "rgba(11,31,58,.12)", color: NIGHT }}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{p.username}</span>
                    <span className="block text-[11px]" style={{ color: MUTED }}>
                      {au(p.rounds)} rounds · bet {lakh(p.bet)} · best {lakh(p.best)}
                    </span>
                  </span>
                  <span className="text-sm font-black" style={{ color: p.net >= 0 ? AU.green : AU.red }}>
                    {(p.net >= 0 ? "+" : "−") + lakh(Math.abs(p.net))}
                  </span>
                </button>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
