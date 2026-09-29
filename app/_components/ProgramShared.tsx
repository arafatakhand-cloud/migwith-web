"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, getDocs, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { BackButton } from "./BackButton";

// Shared by the Mentor Dashboard (/mentor) and the Merchant Dashboard
// (/merchant): helpers, the spend rule, the navy tab bar and the EARNING tab.

const syncLuxuryBetEarnings = httpsCallable<{ beneficiaryType: string; username: string }, unknown>(
  functions,
  "syncLuxuryBetEarnings"
);

export type TrailRow = { username: string; spend: number; earning: number; rate?: number };
type TrailReport = { direct?: TrailRow[]; merchantSourced?: TrailRow[]; rows?: TrailRow[]; total: number };
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
  const [bets, refunds, gifts] = await Promise.all([
    getDocs(query(collection(db, "users", uid, "coin_transactions"), where("type", "==", "bet"), ...range)),
    getDocs(query(collection(db, "users", uid, "coin_transactions"), where("type", "==", "refund"), ...range)),
    getDocs(query(collection(db, "gift_activity"), where("fromUsername", "==", username), ...range)),
  ]);
  let game = 0;
  bets.docs.forEach((t) => (game += Math.abs(Number(t.get("amount") || 0))));
  refunds.docs.forEach((t) => (game -= Math.abs(Number(t.get("amount") || 0))));
  let spend = Math.max(0, game);
  gifts.docs.forEach((g) => (spend += Math.abs(Number(g.get("cost") || 0))));
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

/** Date bar used by the Report tabs. */
export function DateBar({ day, setDay }: { day: string; setDay: (d: string) => void }) {
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

/** Navy bar: back, DASHBOARD / REPORT / EARNING, refresh. */
export function ProgramBar<P extends string>({
  backHref,
  panels,
  panel,
  setPanel,
  onRefresh,
  accent,
}: {
  backHref?: string;
  panels: readonly P[];
  panel: P;
  setPanel: (p: P) => void;
  onRefresh: () => void;
  accent: string;
}) {
  return (
    <div className="bg-[#0B1F3A]">
      <div className="mx-auto flex max-w-4xl items-center gap-2 px-2 py-2">
        {backHref && (
          <BackButton variant="dark" href={backHref} />
        )}
        <div className="flex min-w-0 flex-1 gap-1.5">
          {panels.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPanel(p)}
              className={`min-w-0 flex-1 truncate rounded-full py-2 text-[11px] font-black tracking-wide ${
                panel === p ? "border text-white" : "bg-white text-[#0B1F3A]"
              }`}
              style={panel === p ? { borderColor: accent, background: `linear-gradient(90deg, #0B1F3A, ${accent}99)` } : undefined}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-lg font-bold"
          style={{ borderColor: accent, color: accent }}
        >
          ⟳
        </button>
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
}: {
  kind: "mentor" | "merchant";
  me: string;
  uid: string;
  refresh: number;
}) {
  const [d, setD] = useState<Record<string, any> | null>(null);
  const [balance, setBalance] = useState(0);
  const [period, setPeriod] = useState<(typeof PERIODS)[number][0]>("today");
  const [menu, setMenu] = useState(false);
  const [viaOpen, setViaOpen] = useState(false);

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
    if (!d) return null;
    const total = num(d.totalEarnings ?? d.total);
    return {
      total,
      pending: num(d.pending),
      settled: num(d.settled),
      periods: { today: num(d.today), last7Days: num(d.last7Days), last30Days: num(d.last30Days), allTime: num(d.allTime ?? total) } as Record<string, number>,
      bySource: (Array.isArray(d.bySource) ? d.bySource : []) as Record<string, any>[],
      recent: (Array.isArray(d.recentActivity) ? d.recentActivity : []) as Record<string, any>[],
    };
  }, [d]);

  if (!view) return <p className="py-16 text-center text-sm text-[#5A6B8C]">Loading {kind === "mentor" ? "Mentor" : "Merchant"} Earnings…</p>;

  return (
    <div className="space-y-3 px-3 py-3">
      <div className="rounded-3xl bg-gradient-to-br from-[#F3E8FF] to-[#EDE3FA] p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E2CCF7] text-2xl text-[#7B1FB8]">▣</span>
          <div>
            <p className="text-xs text-[#6A4A8C]">Total {kind === "mentor" ? "Mentor" : "Merchant"} Earnings</p>
            <p className="text-2xl font-black text-[#4A148C]">{amount(view.total)}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            ["Pending", view.pending, "#C98A0C"],
            ["Settled", view.settled, "#14A044"],
            ["Balance", balance, "#0E1B3D"],
          ].map(([l, v, c]) => (
            <div key={l as string} className="rounded-2xl bg-[#E9DDF7] py-2">
              <p className="text-[10px] text-[#6A4A8C]">{l}</p>
              <p className="text-sm font-bold" style={{ color: c as string }}>{amount(v as number)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center">
          <p className="flex-1 text-xs font-semibold text-[#6B7A90]">Earning</p>
          <div className="relative">
            <button type="button" onClick={() => setMenu((v) => !v)} className="rounded-full border border-[#C9A7EE] bg-[#F3E8FF] px-3 py-1 text-sm font-bold text-[#7B2FD0]">
              {PERIODS.find((p) => p[0] === period)![1]} {menu ? "▲" : "▼"}
            </button>
            {menu && (
              <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-xl bg-white text-sm shadow-xl">
                {PERIODS.map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setPeriod(k);
                      setMenu(false);
                    }}
                    className={`flex w-full justify-between px-3 py-2 text-left hover:bg-[#F3E8FF] ${k === period ? "font-bold text-[#7B2FD0]" : "text-[#0E1B3D]"}`}
                  >
                    {l} {k === period && "✓"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="mt-1 text-2xl font-black text-[#0E1B3D]">🪙 {amount(view.periods[period])}</p>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <button type="button" onClick={() => setViaOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
          <span className="text-[#1597B8]">◐</span>
          <span className="flex-1 font-bold text-[#0E1B3D]">Via</span>
          <span className="text-[10px] text-[#6B7A90]">(last 30 days)</span>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F3E8FF] text-sm font-bold text-[#7B2FD0]">{viaOpen ? "−" : "+"}</span>
        </button>
        {viaOpen &&
          (view.bySource.length === 0 ? (
            <p className="mt-2 text-xs text-[#6B7A90]">No source data yet</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {view.bySource.map((s, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="font-bold text-[#0E1B3D]">{String(s.name ?? s.source ?? "")}</span>
                    <span className="block text-[10px] text-[#6B7A90]">
                      {num(s.percent)}% · {num(s.transactions)} transactions
                    </span>
                  </span>
                  <span className="font-bold text-[#14A044]">+{amount(num(s.amount))}</span>
                </li>
              ))}
            </ul>
          ))}
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-[#1597B8]">↺</span>
          <span className="flex-1 font-bold text-[#0E1B3D]">Recent Activity</span>
          <span className="text-[10px] text-[#6B7A90]">last 30</span>
        </div>
        {view.recent.length === 0 ? (
          <p className="mt-2 text-xs text-[#6B7A90]">No recent activity</p>
        ) : (
          <ul className="mt-1 divide-y divide-[#EEF2F8]">
            {view.recent.map((r, i) => {
              const name = String(r.username ?? r.taggedUsername ?? "");
              const status = String(r.status ?? "pending");
              return (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <Avatar name={name || "?"} />
                  <div className="min-w-0 flex-1">
                    <p data-notranslate className="truncate text-xs font-bold text-[#0E1B3D]">
                      @{name} · {String(r.source ?? "Mentor Tag")}
                    </p>
                    <p className="text-[10px] text-[#6B7A90]">
                      {amount(num(r.spent ?? r.spend))} spent · {amount(num(r.rate ?? 3))}% rate
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[#14A044]">+{amount(num(r.amount ?? r.earning))}</p>
                    <p className="text-[9px] text-[#6B7A90]">
                      <span className={`mr-1 rounded-full px-1.5 py-0.5 ${status === "settled" ? "bg-[#DDF3E4] text-[#14A044]" : "bg-[#FFF1D6] text-[#C98A0C]"}`}>{status}</span>
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
