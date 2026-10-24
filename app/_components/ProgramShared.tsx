"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { collection, doc, getDocs, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { BackButton } from "./BackButton";
import { RefreshButton } from "./RefreshButton";

// Shared by the Mentor Dashboard (/mentor) and the Merchant Dashboard
// (/merchant): helpers, the spend rule, the navy tab bar and the EARNING tab.

const syncLuxuryBetEarnings = httpsCallable<{ beneficiaryType: string; username: string }, unknown>(
  functions,
  "syncLuxuryBetEarnings"
);

export type TrailRow = { username: string; spend: number; earning: number; rate?: number };
/** One line per game round (or gift) of the day — not paid yet, so "pending". */
export type TrailActivity = { username: string; source?: string; roundNumber?: number; spend: number; earning: number; rate?: number; timeMs?: number };
type TrailReport = { direct?: TrailRow[]; merchantSourced?: TrailRow[]; rows?: TrailRow[]; activity?: TrailActivity[]; total: number };
const getTrailReport = httpsCallable<{ beneficiaryType: "mentor" | "merchant"; date: string }, TrailReport>(
  functions,
  "getTrailReport"
);

/** A day's trail worked out on the server (getTrailReport), which can read
 *  the tagged users' spend; if that function isn't there yet, `fallback`
 *  works it out in the browser as before. */
export async function trailReport(
  beneficiaryType: "mentor" | "merchant",
  date: string,
  fallback: () => Promise<TrailReport>
): Promise<TrailReport> {
  try {
    return (await getTrailReport({ beneficiaryType, date })).data;
  } catch (e: any) {
    // Only a missing function falls back; a real server error is shown.
    const code = String(e?.code || "");
    if (code.endsWith("not-found") || code.endsWith("unimplemented") || code.endsWith("internal")) return fallback();
    throw e;
  }
}

export const DAY = 86_400_000;
export const lc = (s: string) => s.trim().toLowerCase();
export const toMs = (v: any) => (v && typeof v.toMillis === "function" ? v.toMillis() : 0);
export const daysLeft = (v: any) => {
  const ms = toMs(v);
  return ms > 0 ? Math.max(0, Math.floor((ms - Date.now()) / DAY)) : null;
};
export const amount = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const COLORS = ["#4A90E2", "#D9527F", "#C8871E", "#8E7CE0", "#2FAE85", "#E0703C", "#3FA7C9"];
export function Avatar({ name, size = "h-9 w-9" }: { name: string; size?: string }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-full text-sm font-bold text-white`}
      style={{ backgroundColor: COLORS[h % COLORS.length] }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

// Bangladesh date — the same "today" the server's daily reports use,
// whatever time zone this device is set to (like the app).
export const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

// One user's spend in [from, end): bets minus refunds (never below 0) plus
// gifts sent — the same rule the app and the midnight settlement use.
export async function spendBetween(uid: string, username: string, from: Timestamp, end: Timestamp): Promise<number> {
  if (from.toMillis() >= end.toMillis()) return 0;
  const range = [where("createdAt", ">=", from), where("createdAt", "<", end)];
  const [bets, refunds, gifts, privateGifts] = await Promise.all([
    getDocs(query(collection(db, "users", uid, "coin_transactions"), where("type", "==", "bet"), ...range)),
    getDocs(query(collection(db, "users", uid, "coin_transactions"), where("type", "==", "refund"), ...range)),
    getDocs(query(collection(db, "gift_activity"), where("fromUsername", "==", username), ...range)),
    // 🔒 private-chat gifts (readable by the person's own Mentor / Merchant)
    getDocs(query(collection(db, "gift_activity_private"), where("fromUsername", "==", username), ...range)).catch(() => null),
  ]);
  let game = 0;
  bets.docs.forEach((t) => (game += Math.abs(Number(t.get("amount") || 0))));
  refunds.docs.forEach((t) => (game -= Math.abs(Number(t.get("amount") || 0))));
  let spend = Math.max(0, game);
  [...gifts.docs, ...(privateGifts?.docs || [])].forEach((g) => (spend += Math.abs(Number(g.get("cost") || 0))));
  return spend;
}

/** Local-midnight start and end of a "YYYY-MM-DD" day. */
export function dayRange(day: string): { start: Timestamp; end: Timestamp } {
  const [y, m, d] = day.split("-").map(Number);
  return { start: Timestamp.fromMillis(new Date(y, m - 1, d).getTime()), end: Timestamp.fromMillis(new Date(y, m - 1, d + 1).getTime()) };
}

/** usernames → uids, 10 at a time. */
export async function uidsFor(names: string[], into = new Map<string, string>()): Promise<Map<string, string>> {
  const need = Array.from(new Set(names.filter((n) => n && !into.has(n))));
  for (let i = 0; i < need.length; i += 10) {
    const s = await getDocs(query(collection(db, "users"), where("username", "in", need.slice(i, i + 10))));
    s.docs.forEach((u) => into.set(String(u.get("username")), u.id));
  }
  return into;
}

/** Before a tag request: is this user already tagged (active, not run out) by
 *  ANOTHER mentor or merchant? Returns the message to show, or null if free.
 *  The other mentor / merchant's name is not shown (like the app). */
export async function checkTagFree(tagged: string, me: string): Promise<string | null> {
  const now = Date.now();
  const untilOf = (d: { get: (f: string) => any }) => {
    const exp = toMs(d.get("expiresAt"));
    if (exp > 0) return exp;
    const made = toMs(d.get("createdAt"));
    return made > 0 ? made + 30 * DAY : Number.MAX_SAFE_INTEGER;
  };
  const read = (coll: string, owner: string) =>
    getDocs(query(collection(db, coll), where("taggedUsername", "==", tagged), where("status", "==", "active")))
      .then((s) => s.docs.map((d) => ({ owner: String(d.get(owner) || ""), until: untilOf(d) })))
      .catch(() => [] as { owner: string; until: number }[]);
  const hits = [...(await read("mentor_tagged", "mentorUsername")), ...(await read("merchant_tagged", "merchantUsername"))];
  const other = hits.find((h) => h.until > now && lc(h.owner) !== lc(me));
  return other ? `@${tagged} is already tagged by another mentor or merchant.` : null;
}

/** Date bar used by the Report tabs. */
export function DateBar({ day, setDay, gold = false }: { day: string; setDay: (d: string) => void; gold?: boolean }) {
  const [open, setOpen] = useState(false);
  if (gold) {
    // 📅 our own calendar in the theme colours (not the phone's plain one)
    const label = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-1 items-center gap-2 rounded-2xl border border-[#D5E3F5] bg-white px-3 py-2.5 text-left text-sm font-bold text-[#0B2A5B] shadow-sm"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#5A8FD6] to-[#2F6ABD] text-xs text-white">📅</span>
          <span className="flex-1">{label}</span>
          <span className="text-[#1E63D6]">▾</span>
        </button>
        <button type="button" onClick={() => setDay(todayStr())} className="px-2 text-sm font-bold text-[#1E63D6]">
          Today
        </button>
        {open && (
          <DatePickerSheet
            day={day}
            onPick={(d) => {
              setDay(d);
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <label className="flex flex-1 items-center gap-2 rounded-2xl border-[1.5px] border-[#FFC04A] bg-[#0B1F3A] px-3 py-2 text-sm font-bold text-white shadow">
        📅
        <input
          type="date"
          value={day}
          max={todayStr()}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-white outline-none [color-scheme:dark]"
        />
      </label>
      <button type="button" onClick={() => setDay(todayStr())} className="px-2 text-sm font-bold text-[#0B6FA6]">
        Today
      </button>
    </div>
  );
}

const dayKey = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysBackStr = (n: number) => new Date(Date.now() - n * DAY).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

/** The calendar: big picked date on the theme colour, quick picks, month
 *  arrows, no days after today (Bangladesh time). */
function DatePickerSheet({ day, onPick, onClose }: { day: string; onPick: (d: string) => void; onClose: () => void }) {
  const today = todayStr();
  const [picked, setPicked] = useState(day || today);
  const [ym, setYm] = useState(() => {
    const [y, m] = (day || today).split("-").map(Number);
    return { y, m: m - 1 };
  });
  const [ty, tm] = today.split("-").map(Number);
  const atLast = ym.y > ty || (ym.y === ty && ym.m >= tm - 1);
  const pickedDate = new Date(`${picked}T12:00:00Z`);
  const head = pickedDate.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const monthName = new Date(Date.UTC(ym.y, ym.m, 1, 12)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const lead = new Date(Date.UTC(ym.y, ym.m, 1)).getUTCDay();
  const count = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(0), ...Array.from({ length: count }, (_, i) => i + 1)];
  const showMonthOf = (k: string) => {
    const [y, m] = k.split("-").map(Number);
    setYm({ y, m: m - 1 });
  };
  const move = (by: number) => setYm(({ y, m }) => (m + by < 0 ? { y: y - 1, m: 11 } : m + by > 11 ? { y: y + 1, m: 0 } : { y, m: m + by }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-[360px] overflow-hidden rounded-[28px] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-[#5A8FD6] to-[#2F6ABD] px-6 py-5 text-white">
          <p className="text-[11px] font-bold tracking-[0.2em] text-white/85">📅 SELECT DATE</p>
          <p className="mt-1.5 text-[30px] font-black leading-tight">{head}</p>
          <p className="text-sm font-semibold text-white/80">{pickedDate.getUTCFullYear()}</p>
        </div>
        <div className="px-4 pb-4 pt-3">
          <div className="flex gap-2">
            {(
              [
                ["Today", 0],
                ["Yesterday", 1],
                ["7 days ago", 7],
              ] as const
            ).map(([l, n]) => {
              const k = daysBackStr(n);
              const on = picked === k;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => {
                    setPicked(k);
                    showMonthOf(k);
                  }}
                  className={`flex-1 rounded-full py-2 text-xs font-bold ${on ? "bg-gradient-to-r from-[#5A8FD6] to-[#2F6ABD] text-white" : "bg-[#EAF1FC] text-[#1E63D6]"}`}
                >
                  {l}
                </button>
              );
            })}
          </div>
          <div className="mt-3.5 flex items-center">
            <p className="flex-1 text-base font-black text-[#0B2A5B]">{monthName}</p>
            {[
              ["‹", -1, true],
              ["›", 1, !atLast],
            ].map(([a, by, en]) => (
              <button
                key={a as string}
                type="button"
                disabled={!en}
                onClick={() => move(by as number)}
                className="ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#EAF1FC] text-xl font-bold text-[#1E63D6] disabled:text-[#A3AFC2]"
              >
                {a}
              </button>
            ))}
          </div>
          <div className="mt-2.5 grid grid-cols-7 text-center text-xs font-bold text-[#5B6B8C]">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i} className={i === 5 ? "text-[#1E63D6]" : ""}>
                {d}
              </span>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-7 gap-y-0.5">
            {cells.map((d, i) => {
              if (!d) return <span key={i} />;
              const k = dayKey(ym.y, ym.m, d);
              const isPicked = k === picked;
              const isToday = k === today;
              const future = k > today;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={future}
                  onClick={() => setPicked(k)}
                  className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full text-[15px] transition ${
                    isPicked
                      ? "bg-gradient-to-br from-[#5A8FD6] to-[#2F6ABD] font-black text-white shadow-md"
                      : future
                        ? "text-[#C7D0DD]"
                        : isToday
                          ? "border-[1.5px] border-[#1E63D6] font-black text-[#1E63D6]"
                          : "font-medium text-[#0B2A5B] active:bg-[#EAF1FC]"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2.5">
            <button type="button" onClick={onClose} className="flex-1 rounded-2xl bg-[#EAF1FC] py-3 text-[15px] font-bold text-[#5B6B8C]">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onPick(picked)}
              className="flex-[1.4] rounded-2xl bg-gradient-to-r from-[#5A8FD6] to-[#2F6ABD] py-3 text-[15px] font-black text-white shadow-md"
            >
              Show this day
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 🌊 Mentor / Merchant page background: a curved blue → purple wave on top
 *  (with "👋 Hi, name") and a soft blue → lilac → pink page under it with
 *  blurred colour glows, so the white cards float on colour. */
export function WavePage({ children }: { children: ReactNode }) {
  return (
    <div className="wave-page page-bg relative isolate min-h-[calc(100dvh-64px)] overflow-hidden bg-gradient-to-b from-[#E4EEFD] via-[#EEE8FF] to-[#FFE8F2]">
      <div className="wave-top pointer-events-none absolute inset-x-0 top-0 -z-10 h-[250px] overflow-hidden rounded-b-[50%_22%] bg-gradient-to-br from-[#2F6ABD] via-[#5A8FD6] to-[#8B5CFF]">
        <span className="absolute -right-10 -top-14 h-48 w-48 rounded-full bg-white/15" />
        <span className="absolute bottom-6 left-[-30px] h-28 w-28 rounded-full bg-white/10" />
      </div>
      <span className="wave-glow pointer-events-none absolute -left-24 top-[420px] -z-10 h-72 w-72 rounded-full bg-[#7FB2FF]/40 blur-3xl" />
      <span className="wave-glow pointer-events-none absolute -right-24 top-[720px] -z-10 h-72 w-72 rounded-full bg-[#B79CFF]/40 blur-3xl" />
      <span className="wave-glow pointer-events-none absolute -left-10 top-[1050px] -z-10 h-64 w-64 rounded-full bg-[#FFB3CF]/40 blur-3xl" />
      {children}
    </div>
  );
}

/** 💫 Tabs with a gradient bubble that slides to the tab you pick. */
export function GradientTabs<T extends string>({
  tabs,
  value,
  onChange,
  small = false,
}: {
  tabs: readonly { id: T; label: string; badge?: number; alert?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  small?: boolean;
}) {
  const i = Math.max(0, tabs.findIndex((t) => t.id === value));
  return (
    <div className={`gtabs relative flex min-w-0 flex-1 rounded-2xl bg-white p-1 shadow-[0_2px_10px_rgba(30,99,214,.12)] ${small ? "text-[12px]" : "text-[11px]"}`}>
      <span
        className="gtabs-bubble pointer-events-none absolute bottom-1 top-1 rounded-xl bg-gradient-to-r from-[#5A8FD6] via-[#1E63D6] to-[#8B5CFF] shadow-[0_4px_12px_rgba(30,99,214,.45)] transition-all duration-300 ease-out"
        style={{ left: `calc(${(i * 100) / tabs.length}% + 4px)`, width: `calc(${100 / tabs.length}% - 8px)` }}
      />
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`relative z-10 flex min-w-0 flex-1 items-center justify-center gap-1 truncate py-2 font-black tracking-wide transition-colors duration-300 ${
              on ? "text-white" : "text-[#5B6B8C]"
            }`}
          >
            {t.label}
            {!!t.badge && t.badge > 0 && (
              <span
                className={`rounded-full px-1.5 text-[10px] font-extrabold ${
                  t.alert ? "bg-[#E5484D] text-white" : on ? "bg-white/25 text-white" : "bg-[#1E63D6]/10 text-[#1E63D6]"
                }`}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Navy bar: back, DASHBOARD / REPORT / EARNING, refresh. */
export function ProgramBar<P extends string>({
  backHref,
  onBack,
  panels,
  panel,
  setPanel,
  onRefresh,
  accent,
  gold = false,
  hello,
}: {
  backHref?: string;
  /** used instead of backHref when given */
  onBack?: () => void;
  panels: readonly P[];
  panel: P;
  setPanel: (p: P) => void;
  onRefresh: () => void;
  accent: string;
  /** 💼 the Mentor Dashboard's dark-gold look */
  gold?: boolean;
  /** 👋 greeting on the wave (gold look): name + one line */
  hello?: { name: string; line: string };
}) {
  return (
    <div className={gold ? "bg-transparent" : "bg-[#0B1F3A]"}>
      {gold && hello && hello.name && (
        <div className="wave-hello mx-auto max-w-4xl px-4 pb-1 pt-3 text-white">
          <p className="text-lg font-extrabold drop-shadow-sm">👋 Hi, {hello.name}</p>
          <p className="text-xs text-white/85">{hello.line}</p>
        </div>
      )}
      <div className="mx-auto flex max-w-4xl items-center gap-2 px-2 py-2">
        {(backHref || onBack) && (
          <BackButton variant={gold ? "light" : "dark"} href={onBack ? undefined : backHref} onClick={onBack} />
        )}
        {gold ? (
          <GradientTabs tabs={panels.map((p) => ({ id: p, label: p === "EARNING" ? "BONUS" : p }))} value={panel} onChange={setPanel} />
        ) : (
        <div className="flex min-w-0 flex-1 gap-1.5">
          {panels.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPanel(p)}
              className={`min-w-0 flex-1 truncate py-2 text-[11px] font-black tracking-wider ${
                gold
                  ? `rounded-xl ${panel === p ? "bg-[#1E63D6] text-white shadow" : "bg-white text-[#5B6B8C] shadow-sm"}`
                  : `rounded-full ${panel === p ? "border text-white" : "bg-white text-[#0B1F3A]"}`
              }`}
              style={!gold && panel === p ? { borderColor: accent, background: `linear-gradient(90deg, #0B1F3A, ${accent}99)` } : undefined}
            >
              {p === "EARNING" ? "BONUS" : p}
            </button>
          ))}
        </div>
        )}
        <RefreshButton
          onClick={onRefresh}
          glyph="⟳"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-lg font-bold ${gold ? "border-[#1E63D6] bg-white text-[#1E63D6]" : ""}`}
          style={gold ? undefined : { borderColor: accent, color: accent }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- EARNING */

const PERIODS = [
  ["today", "Today"],
  ["last7Days", "Last 7 days"],
  ["last30Days", "Last 30 days"],
  ["allTime", "All time"],
] as const;

export function EarningPanel({
  kind,
  me,
  uid,
  refresh,
  onRefresh,
  gold = false,
}: {
  kind: "mentor" | "merchant";
  me: string;
  uid: string;
  refresh: number;
  /** ↺ next to Recent Activity reloads the panel too */
  onRefresh?: () => void;
  /** 💼 the Mentor Dashboard's dark-gold look */
  gold?: boolean;
}) {
  const [d, setD] = useState<Record<string, any> | null>(null);
  const [balance, setBalance] = useState(0);
  const [period, setPeriod] = useState<(typeof PERIODS)[number][0]>("today");
  const [menu, setMenu] = useState(false);
  const [viaOpen, setViaOpen] = useState(false);
  // Live, from the same calculation the Report tab uses (getTrailReport), so
  // Today / Last 7 days / Pending always match Report. Trail is settled at
  // 12:00 AM Bangladesh time, so what's earned today IS the pending amount.
  const [live, setLive] = useState<{
    today: number;
    last7: number | null;
    activity: Record<string, any>[];
    /** 💼 gold look: each of the last 7 days (0 = today) and who brought it */
    days?: { day: string; total: number }[];
    people?: { username: string; earning: number }[];
  } | null>(null);
  const [allRecent, setAllRecent] = useState(false);

  useEffect(() => {
    let alive = true;
    const day = (n: number) => new Date(Date.now() - n * DAY).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
    const ago = (ms?: number) => {
      if (!ms) return "today";
      const mins = Math.max(0, Math.floor((Date.now() - ms) / 60000));
      return mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
    };
    (async () => {
      const today = await getTrailReport({ beneficiaryType: kind, date: day(0) }).then((r) => r.data).catch(() => null);
      if (!alive || !today) return;
      const fromRows = (rows: TrailRow[] | undefined, label: string) =>
        (rows || [])
          .filter((r) => r.username && r.spend > 0)
          .map((r) => ({ username: r.username, source: label, amount: r.earning, spent: r.spend, rate: r.rate, status: "pending", timeLabel: "today" }))
          .sort((a, b) => b.amount - a.amount);
      const activity = (today.activity || []).length
        ? (today.activity || [])
            .filter((a) => a.username && a.spend > 0)
            .map((a) => ({ username: a.username, source: a.source || "Other", roundNumber: a.roundNumber, amount: a.earning, spent: a.spend, rate: a.rate, status: "pending", timeLabel: ago(a.timeMs) }))
        : kind === "mentor"
          ? [...fromRows(today.direct, "Mentor Tag · Today"), ...fromRows(today.merchantSourced, "Merchant Tag · Today")]
          : fromRows(today.rows, "Today");
      setLive({ today: Number(today.total || 0), last7: null, activity });
      const others = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => getTrailReport({ beneficiaryType: kind, date: day(n) }).then((r) => r.data)))
        .catch(() => null);
      if (!alive || !others) return;
      const week = [today, ...others];
      // Who brought the most over these 7 days (Mentor Tag + via merchants).
      const people = new Map<string, number>();
      week.forEach((r) =>
        [...(r.direct || []), ...(r.merchantSourced || []), ...(r.rows || [])].forEach((x) => {
          if (x.username && x.earning > 0) people.set(x.username, (people.get(x.username) || 0) + x.earning);
        })
      );
      setLive((l) =>
        l && {
          ...l,
          last7: week.reduce((a, r) => a + Number(r.total || 0), 0),
          days: week.map((r, n) => ({ day: day(n), total: Number(r.total || 0) })),
          people: [...people].map(([username, earning]) => ({ username, earning })).sort((a, b) => b.earning - a.earning),
        }
      );
    })();
    return () => {
      alive = false;
    };
  }, [kind, me, refresh]);

  useEffect(() => {
    // Brings Luxury Bot bets into the totals first (same as the app); fine if it fails.
    syncLuxuryBetEarnings({ beneficiaryType: kind, username: me }).catch(() => {});
  }, [kind, me, refresh]);

  useEffect(() => {
    const t = setTimeout(() => setD((x) => x ?? {}), 12_000);
    const off = onSnapshot(
      doc(db, `${kind}_earnings`, me),
      (s) => setD(s.exists() ? (s.data() as Record<string, any>) : {}),
      () => setD({})
    );
    return () => {
      clearTimeout(t);
      off();
    };
  }, [kind, me, refresh]);

  // Balance is always your real My Account balance.
  useEffect(() => onSnapshot(doc(db, "users", uid), (s) => setBalance(Number(s.get("balance") || 0))), [uid]);

  const num = (v: any) => (typeof v === "number" ? v : Number(v) || 0);
  const view = useMemo(() => {
    // Shown at once with zeros; the numbers fill in quietly (no "Loading…").
    const e = d || {};
    const total = num(e.totalEarnings ?? e.total);
    return {
      total,
      pending: live ? Math.max(live.today, num(e.pending)) : num(e.pending),
      settled: num(e.settled),
      periods: {
        today: live ? live.today : num(e.today),
        last7Days: live?.last7 ?? num(e.last7Days),
        last30Days: num(e.last30Days),
        allTime: num(e.allTime ?? total),
      } as Record<string, number>,
      bySource: (Array.isArray(e.bySource) ? e.bySource : []) as Record<string, any>[],
      recent: [...(live?.activity || []), ...((Array.isArray(e.recentActivity) ? e.recentActivity : []) as Record<string, any>[])],
    };
  }, [d, live]);

  // Colours: the light purple look (merchants) or dark gold (mentors).
  const c = gold
    ? {
        card: "rounded-2xl bg-white p-4 shadow-sm",
        ink: "text-[#0B2A5B]",
        sub: "text-[#5B6B8C]",
        chip: "border border-[#D5E3F5] bg-[#1E63D6]/10 text-[#1E63D6]",
        menu: "bg-white text-[#0B2A5B]",
        menuHover: "hover:bg-[#E3ECF7]",
        menuOn: "font-bold text-[#1E63D6]",
        plus: "bg-[#1E63D6]/10 text-[#1E63D6]",
        line: "divide-[#E3ECF7]",
        icon: "text-[#1E63D6]",
        up: "text-[#16A34A]",
        settled: "bg-[#16A34A]/10 text-[#16A34A]",
        pending: "bg-[#C98A0C]/10 text-[#C98A0C]",
      }
    : {
        card: "rounded-2xl bg-white p-4 shadow-sm",
        ink: "text-[#0E1B3D]",
        sub: "text-[#6B7A90]",
        chip: "border border-[#C9A7EE] bg-[#F3E8FF] text-[#7B2FD0]",
        menu: "bg-white",
        menuHover: "hover:bg-[#F3E8FF]",
        menuOn: "font-bold text-[#7B2FD0]",
        plus: "bg-[#F3E8FF] text-[#7B2FD0]",
        line: "divide-[#EEF2F8]",
        icon: "text-[#1597B8]",
        up: "text-[#14A044]",
        settled: "bg-[#DDF3E4] text-[#14A044]",
        pending: "bg-[#FFF1D6] text-[#C98A0C]",
      };

  return (
    <div className="space-y-3 px-3 py-3">
      {gold ? (
        <div className="earn-hero relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[#5A8FD6] via-[#2F6ABD] to-[#8B5CFF] p-4 text-white shadow-[0_10px_24px_rgba(47,106,189,.35)]">
          <span className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-white/10" />
          <span className="pointer-events-none absolute -bottom-10 left-6 h-24 w-24 rounded-full bg-white/[0.07]" />
          <div className="relative flex items-center justify-between">
            <p className="text-xs font-semibold text-white/85">Total {kind === "mentor" ? "Mentor" : "Merchant"} Bonus</p>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white">💼 {kind === "mentor" ? "Mentor" : "Merchant"}</span>
          </div>
          <div className="relative mt-1 flex items-center gap-3">
            <p className="earn-hero-amt min-w-0 flex-1 truncate text-[28px] font-black leading-tight text-white drop-shadow-sm">
              {amount(view.total)}
            </p>
            <SettledRing settled={view.settled} pending={view.pending} />
          </div>
          <div className="relative mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ["Pending", view.pending, "text-[#FFD66B]"],
              ["Settled", view.settled, "text-[#8FF0B4]"],
              ["Balance", balance, "text-white"],
            ].map(([l, v, col]) => (
              <div key={l as string} className="earn-hero-chip rounded-xl bg-white/15 py-1.5 backdrop-blur-sm">
                <p className="text-[10px] text-white/80">
                  <span className={col as string}>●</span> {l}
                </p>
                <p className={`truncate px-1 text-[13px] font-black ${col}`}>{amount(v as number)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-gradient-to-br from-[#F3E8FF] to-[#EDE3FA] p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E2CCF7] text-2xl text-[#7B1FB8]">▣</span>
            <div>
              <p className="text-xs text-[#6A4A8C]">Total {kind === "mentor" ? "Mentor" : "Merchant"} Bonus</p>
              <p className="text-2xl font-black text-[#4A148C]">{amount(view.total)}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ["Pending", view.pending, "#C98A0C"],
              ["Settled", view.settled, "#14A044"],
              ["Balance", balance, "#0E1B3D"],
            ].map(([l, v, col]) => (
              <div key={l as string} className="rounded-2xl bg-[#E9DDF7] py-2">
                <p className="text-[10px] text-[#6A4A8C]">{l}</p>
                <p className="text-sm font-bold" style={{ color: col as string }}>{amount(v as number)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {gold && <WeekChart days={live?.days} today={view.periods.today} last7={view.periods.last7Days} last30={view.periods.last30Days} />}

      {!gold && <div className={c.card}>
        <div className="flex items-center">
          <p className={`flex-1 text-xs font-semibold ${c.sub}`}>Bonus</p>
          <div className="relative">
            <button type="button" onClick={() => setMenu((v) => !v)} className={`rounded-full px-3 py-1 text-sm font-bold ${c.chip}`}>
              {PERIODS.find((p) => p[0] === period)![1]} {menu ? "▲" : "▼"}
            </button>
            {menu && (
              <div className={`absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-xl text-sm shadow-xl ${c.menu}`}>
                {PERIODS.map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setPeriod(k);
                      setMenu(false);
                    }}
                    className={`flex w-full justify-between px-3 py-2 text-left ${c.menuHover} ${k === period ? c.menuOn : c.ink}`}
                  >
                    {l} {k === period && "✓"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className={`mt-1 text-2xl font-black ${gold ? "text-[#F7D774]" : c.ink}`}>🪙 {amount(view.periods[period])}</p>
      </div>}

      <div className={c.card}>
        <button type="button" onClick={() => setViaOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
          <span className={c.icon}>◐</span>
          <span className={`flex-1 font-bold ${c.ink}`}>Via</span>
          <span className={`text-[10px] ${c.sub}`}>(last 30 days)</span>
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold ${c.plus}`}>{viaOpen ? "−" : "+"}</span>
        </button>
        {viaOpen &&
          (view.bySource.length === 0 ? (
            <p className={`mt-2 text-xs ${c.sub}`}>No source data yet</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {view.bySource.map((s, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span>
                    <span className={`font-bold ${c.ink}`}>{String(s.name ?? s.source ?? "")}</span>
                    <span className={`block text-[10px] ${c.sub}`}>
                      {num(s.percent)}% · {num(s.transactions)} transactions
                    </span>
                  </span>
                  <span className={`font-bold ${c.up}`}>+{amount(num(s.amount))}</span>
                </li>
              ))}
            </ul>
          ))}
      </div>

      <div className={c.card}>
        <div className="flex items-center gap-2">
          {onRefresh ? <RefreshButton onClick={onRefresh} glyph="↺" className={c.icon} /> : <span className={c.icon}>↺</span>}
          <span className={`flex-1 font-bold ${c.ink}`}>Recent Activity</span>
          {gold && view.recent.length > 3 ? (
            <button type="button" onClick={() => setAllRecent((v) => !v)} className="rounded-full bg-[#1E63D6]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#1E63D6]">
              {allRecent ? "Less ▴" : `See all ${view.recent.length} ›`}
            </button>
          ) : (
            <span className={`text-[10px] ${c.sub}`}>last 30</span>
          )}
        </div>
        {view.recent.length === 0 ? (
          <p className={`mt-2 text-xs ${c.sub}`}>No recent activity</p>
        ) : (
          <ul className={`mt-1 divide-y ${c.line}`}>
            {(gold && !allRecent ? view.recent.slice(0, 3) : view.recent).map((r, i) => {
              const name = String(r.username ?? r.taggedUsername ?? "");
              const status = String(r.status ?? "pending");
              return (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <Avatar name={name || "?"} />
                  <div className="min-w-0 flex-1">
                    <p data-notranslate className={`truncate text-xs font-bold ${c.ink}`}>
                      @{name} · {String(r.source ?? (kind === "mentor" ? "Mentor Tag" : "Merchant Tag"))}
                      {num(r.roundNumber) > 0 ? ` · Round ${num(r.roundNumber)}` : ""}
                    </p>
                    <p className={`text-[10px] ${c.sub}`}>
                      {amount(num(r.spent ?? r.spend))} spent · {amount(num(r.rate ?? 3))}% rate
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${c.up}`}>+{amount(num(r.amount ?? r.earning))}</p>
                    <p className={`text-[9px] ${c.sub}`}>
                      <span className={`mr-1 rounded-full px-1.5 py-0.5 ${status === "settled" ? c.settled : c.pending}`}>{status}</span>
                      {String(r.timeLabel ?? "")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* 💼 gold Bonus pieces ------------------------------------------------------ */

/** How much of the bonus is settled (paid) — a small ring. */
function SettledRing({ settled, pending }: { settled: number; pending: number }) {
  const all = settled + pending;
  const pct = all > 0 ? Math.round((settled / all) * 100) : 0;
  return (
    <span
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
      style={{ background: all > 0 ? `conic-gradient(#16A34A 0 ${pct}%, #F2B544 0)` : "#E3ECF7" }}
      title="Settled"
    >
      <span className="flex h-11 w-11 flex-col items-center justify-center rounded-full bg-white leading-none">
        <span className="text-[12px] font-black text-[#16A34A]">{all > 0 ? `${pct}%` : "—"}</span>
        <span className="mt-0.5 text-[7px] text-[#5B6B8C]">settled</span>
      </span>
    </span>
  );
}

/** Bars for the last 7 days (today on the right). */
function WeekChart({ days, today, last7, last30 }: { days?: { day: string; total: number }[]; today: number; last7: number; last30: number }) {
  // Shown at once (empty bars), the days fill in when they arrive.
  const week = days ? [...days].reverse() : Array.from({ length: 7 }, (_, i) => ({ day: "", total: i === 6 ? today : 0 }));
  const max = Math.max(1, ...week.map((d) => d.total));
  const best = Math.max(...week.map((d) => d.total));
  const label = (day: string, i: number) =>
    i === 6 ? "Today" : day ? new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }) : "";
  return (
    <div className="rounded-2xl bg-white shadow-sm p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[#0B2A5B]">Last 7 days</p>
        <p className="text-sm font-black text-[#1E63D6]">🪙 {amount(last7)}</p>
      </div>
      <div className="mt-3 flex h-28 items-end gap-2">
        {week.map((d, i) => {
          const top = d.total > 0 && d.total === best;
          return (
            <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              {d.total > 0 && <span className="max-w-full truncate text-[8px] font-bold text-[#1E63D6]">{short(d.total)}</span>}
              <span
                className={`w-full rounded-md transition-[height] duration-500 ${
                  d.total > 0 ? "bg-gradient-to-b from-[#5A8FD6] to-[#2F6ABD]" : "bg-[#E3ECF7]"
                } ${top ? "shadow-md" : ""}`}
                style={{ height: `${Math.max(4, (d.total / max) * 78)}px` }}
              />
              <span className={`text-[10px] ${i === 6 || top ? "font-bold text-[#1E63D6]" : "text-[#5B6B8C]"}`}>{label(d.day, i)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between border-t border-[#E3ECF7] pt-2 text-[11px] text-[#5B6B8C]">
        <span>
          Today <b className="text-[#1E63D6]">{amount(today)}</b>
        </span>
        <span>
          30 days <b className="text-[#1E63D6]">{amount(last30)}</b>
        </span>
      </div>
    </div>
  );
}

/** 1,234,567 → 1.2M (for the small labels on the bars). */
function short(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return amount(n);
}

