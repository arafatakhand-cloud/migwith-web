"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import {
  ACH_CATEGORIES,
  ACH_METALS,
  ACH_SERIES,
  ACH_TOTAL,
  EVENT_METAL,
  achGoalText,
  achKey,
  achMedalLabel,
  achMetal,
  achShort,
  achStepTitle,
  earnedMedals,
  parseAchievements,
  type AchCategory,
  type AchData,
  type AchEvent,
  type AchSeries,
} from "../../lib/achievements";

// 🏅 ACHIEVEMENT BADGES, like the app's Achievements.kt: a row on every profile
// (anyone can tap it to see that person's badges), the server sync, and the
// founder tools. Badges are written only by the Cloud Functions.

const syncMyAchievements = httpsCallable(functions, "syncMyAchievements");
const founderRecount = httpsCallable<{ part: string; cursor: unknown }, Record<string, unknown>>(functions, "founderRecountAchievements", {
  timeout: 560_000,
});
const founderEvent = httpsCallable<Record<string, unknown>, { events?: AchEvent[] }>(functions, "founderAchievementEvent");

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// ---------------------------------------------------------------------------
// One medal, drawn with CSS (no picture files).
// ---------------------------------------------------------------------------
export function AchMedal({ emoji, label, metal, earned, size }: { emoji: string; label: string; metal: number; earned: boolean; size: number }) {
  const m = ACH_METALS[Math.min(ACH_METALS.length - 1, Math.max(0, metal))];
  const face = earned ? m.face : ["#E2E5EA", "#B9BEC6"];
  const ring = earned ? m.ring : "#9AA0A8";
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, background: ring }}>
      <span className="absolute rounded-full" style={{ inset: size * 0.07, background: `linear-gradient(135deg, ${face.join(", ")})` }} />
      <span className="absolute rounded-full" style={{ inset: size * 0.15, border: `${Math.max(1, size * 0.025)}px solid ${ring}8C` }} />
      {earned && (
        <span
          className="absolute rounded-full bg-white/35"
          style={{ width: size * 0.22, height: size * 0.22, left: size * 0.2, top: size * 0.18 }}
        />
      )}
      <span className="relative flex flex-col items-center leading-none">
        <span style={{ fontSize: size * 0.3, lineHeight: `${size * 0.36}px` }}>{earned ? emoji : "🔒"}</span>
        {label && (
          <span className="font-extrabold" style={{ color: earned ? m.ring : "#7D838C", fontSize: size * (label.length >= 4 ? 0.16 : 0.19), lineHeight: `${size * 0.21}px` }}>
            {label}
          </span>
        )}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Live data
// ---------------------------------------------------------------------------
function useAchievements(uid: string | undefined): AchData {
  const [data, setData] = useState<AchData>({ numbers: {}, badges: {} });
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, "achievements", uid),
      (s) => setData(parseAchievements(s.data())),
      () => {}
    );
  }, [uid]);
  return data;
}

// Events running now or coming later (for the "earn it now" line).
function useOpenEvents(on: boolean): AchEvent[] {
  const [list, setList] = useState<AchEvent[]>([]);
  useEffect(() => {
    if (!on) return;
    return onSnapshot(
      query(collection(db, "achievement_events"), where("endMs", ">", Date.now())),
      (snap) =>
        setList(
          snap.docs
            .map((d) => ({
              id: d.id,
              title: String(d.get("title") || ""),
              emoji: String(d.get("emoji") || "🎉"),
              startMs: Number(d.get("startMs") || 0),
              endMs: Number(d.get("endMs") || 0),
            }))
            .sort((a, b) => a.startMs - b.startMs)
        ),
      () => {}
    );
  }, [on]);
  return list;
}

/** Asks the server to check level, streak, friends, views, votes, age, roles and event badges — on open, then every 30 min. */
export function useAchievementSync(uid: string | undefined) {
  useEffect(() => {
    if (!uid) return;
    const run = () => syncMyAchievements().catch(() => {});
    const first = setTimeout(run, 8_000);
    const every = setInterval(run, 30 * 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [uid]);
}

// ---------------------------------------------------------------------------
// Profile row + full view
// ---------------------------------------------------------------------------
export function ProfileAchievementsRow({ uid, isOwnProfile }: { uid: string; isOwnProfile: boolean }) {
  const ach = useAchievements(uid);
  const [open, setOpen] = useState(false);
  const earned = earnedMedals(ach);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center gap-2 rounded-2xl border border-[#D9A10B]/20 bg-white px-3.5 py-2.5 text-left shadow-sm hover:bg-[#FFFBF0]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-[#0B2A5B]">🏅 Achievements</span>
          <span className="block text-[11px] text-gray-500">
            {earned.length === 0 ? "No badges yet · tap to view" : `${earned.length} badge${earned.length > 1 ? "s" : ""} · tap to view`}
          </span>
        </span>
        {earned.length === 0 ? (
          <span className="text-gray-400">—</span>
        ) : (
          <span className="flex gap-0.5">
            {earned.slice(0, 5).map((m, i) => (
              <AchMedal key={i} emoji={m.emoji} label={m.label} metal={m.metal} earned size={30} />
            ))}
          </span>
        )}
        <span className="text-xl text-gray-400">›</span>
      </button>
      {open && <AchievementsDialog ach={ach} isOwnProfile={isOwnProfile} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * For the profile's "Badges" tile (like the app's rememberAchievementBadgeCount
 * + AchievementsDialogFor): how many badges this person has, and the full
 * Achievements window, shown while `open`.
 */
export function useProfileAchievements(uid: string | undefined, isOwnProfile: boolean) {
  const ach = useAchievements(uid);
  const [open, setOpen] = useState(false);
  return {
    count: earnedMedals(ach).length,
    open: () => setOpen(true),
    dialog: open && uid ? <AchievementsDialog ach={ach} isOwnProfile={isOwnProfile} onClose={() => setOpen(false)} /> : null,
  };
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border border-[#D9A10B]/35 px-3 py-1.5 text-xs font-semibold ${
        on ? "bg-[#D9A10B] text-white" : "bg-[#D9A10B]/10 text-[#0B2A5B]"
      }`}
    >
      {label}
    </button>
  );
}

// ---- Modern dark "trophy room" look for the Achievements window (like the app) ----
const GOLD = "#FFD36B";
const PINK = "#FF5FA2";
const VIOLET = "#8B5CFF";
const SUB = "#AFA3D6";

function ModernChip({ label, count, on, onClick }: { label: string; count: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full py-1.5 pl-3 pr-1.5 text-xs font-semibold text-[#F3EEFF] ${
        on ? "bg-gradient-to-r from-[#FF5FA2] to-[#8B5CFF]" : "border border-white/15 bg-white/[0.08]"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${on ? "bg-white/20 text-white" : "bg-white/10 text-[#AFA3D6]"}`}>{count}</span>
    </button>
  );
}

function AchievementsDialog({ ach, isOwnProfile, onClose }: { ach: AchData; isOwnProfile: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<AchCategory | null>(null); // null = All
  const [showEvents, setShowEvents] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const openEvents = useOpenEvents(true);
  const earnedCount = earnedMedals(ach).length;
  const total = ACH_TOTAL;
  const pct = total > 0 ? Math.floor((earnedCount * 100) / total) : 0;
  // Opening your own badges refreshes the "checked by the server" ones.
  useEffect(() => {
    if (isOwnProfile) syncMyAchievements().catch(() => {});
  }, [isOwnProfile]);

  const catCount = (c: AchCategory): [number, number] => {
    const list = ACH_SERIES.filter((s) => s.category === c);
    const got = list.reduce((a, s) => a + s.steps.filter((_, i) => ach.badges[achKey(s, i)]).length, 0);
    return [got, list.reduce((a, s) => a + s.steps.length, 0)];
  };

  const now = Date.now();
  const earnedEvents = Object.values(ach.badges)
    .filter((b) => b.key.startsWith("event_"))
    .sort((a, b) => b.earnedAt - a.earnedAt);
  const waiting = isOwnProfile ? openEvents.filter((ev) => !ach.badges[`event_${ev.id}`]) : [];

  // Progress ring: r 35.5 inside a 78 box, 7 px stroke.
  const R = 35.5;
  const C = 2 * Math.PI * R;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 px-3 py-[22px]" onClick={onClose}>
      <div
        className="relative flex max-h-[min(680px,94vh)] w-full max-w-lg flex-col overflow-hidden rounded-[26px] bg-gradient-to-b from-[#150A30] to-[#0B0620] text-[#F3EEFF] shadow-[0_10px_40px_rgba(139,92,255,.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* gradient border */}
        <span
          className="pointer-events-none absolute inset-0 rounded-[26px] p-px"
          style={{
            background: "linear-gradient(135deg, rgba(255,211,107,.6), rgba(255,95,162,.4), rgba(139,92,255,.6))",
            WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        />
        {/* Header: trophy + progress ring */}
        <div className="flex shrink-0 items-center bg-gradient-to-b from-[#8B5CFF]/35 to-transparent pb-3 pl-[18px] pr-3 pt-4">
          <div className="relative flex h-[78px] w-[78px] shrink-0 items-center justify-center">
            <svg width="78" height="78" className="absolute inset-0 -rotate-90">
              <defs>
                <linearGradient id="achRing" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={GOLD} />
                  <stop offset="50%" stopColor={PINK} />
                  <stop offset="100%" stopColor={VIOLET} />
                </linearGradient>
              </defs>
              <circle cx="39" cy="39" r={R} fill="none" stroke="rgba(255,255,255,.13)" strokeWidth="7" />
              <circle
                cx="39"
                cy="39"
                r={R}
                fill="none"
                stroke="url(#achRing)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${(C * earnedCount) / Math.max(1, total)} ${C}`}
              />
            </svg>
            <span className="ach-glow absolute h-[56px] w-[56px] rounded-full bg-[#FFD36B]/20" />
            <span className="relative flex flex-col items-center leading-none">
              <span className="text-[22px]">🏆</span>
              <span className="mt-0.5 text-xs font-extrabold" style={{ color: GOLD }}>
                {pct}%
              </span>
            </span>
          </div>
          <div className="ml-3.5 min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-[2px]" style={{ color: GOLD }}>
              ACHIEVEMENTS
            </p>
            <p className="text-[32px] font-extrabold leading-[34px]">{earnedCount}</p>
            <p className="text-xs" style={{ color: SUB }}>
              of {total} badges unlocked
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-white/[0.13] text-[15px] font-bold"
          >
            ✕
          </button>
        </div>

        {/* Category chips (with counts) */}
        <div className="no-scrollbar flex shrink-0 gap-[7px] overflow-x-auto px-3 py-1.5">
          <ModernChip label="✦ All" count={String(earnedCount)} on={tab === null && !showEvents} onClick={() => (setTab(null), setShowEvents(false))} />
          {ACH_CATEGORIES.map(([c, label]) => {
            const [got, all] = catCount(c);
            return <ModernChip key={c} label={label} count={`${got}/${all}`} on={tab === c && !showEvents} onClick={() => (setTab(c), setShowEvents(false))} />;
          })}
          <ModernChip label="🎉 Events" count={String(earnedEvents.length)} on={showEvents} onClick={() => (setShowEvents(true), setTab(null))} />
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3.5 pt-1">
          {showEvents ? (
            <>
              {earnedEvents.length === 0 && waiting.length === 0 && (
                <p className="p-5 text-center text-xs" style={{ color: SUB }}>
                  Special badges for Eid, Puja, Noboborsho and other days appear here. Open miglife during the event to earn one — after it ends, it can never be earned again.
                </p>
              )}
              {waiting.map((ev) => (
                <EventRow
                  key={`w_${ev.id}`}
                  emoji={ev.emoji}
                  title={ev.title}
                  earned={false}
                  sub={
                    ev.startMs > now
                      ? `Starts ${fmtDate(ev.startMs)} · ends ${fmtDate(ev.endMs)}`
                      : `🔥 Live now — ends ${fmtDate(ev.endMs)}. Keep the app open to get it!`
                  }
                />
              ))}
              {earnedEvents.map((b) => (
                <EventRow
                  key={b.key}
                  emoji={b.emoji || "🎉"}
                  title={b.title || "Event"}
                  earned
                  sub={b.earnedAt > 0 ? `Unlocked ${fmtDate(b.earnedAt)}` : "Unlocked"}
                />
              ))}
            </>
          ) : (
            ACH_CATEGORIES.filter(([c]) => tab === null || c === tab).map(([c, label]) => {
              const [got, all] = catCount(c);
              return (
                <div key={c} className="space-y-2">
                  {tab === null && (
                    <div className="flex items-center gap-2 pb-0.5 pt-2">
                      <span className="text-[11px] font-bold tracking-[1.5px]" style={{ color: GOLD }}>
                        {label.toUpperCase()}
                      </span>
                      <span className="h-px flex-1 bg-gradient-to-r from-[#FFD36B]/50 to-transparent" />
                      <span className="text-[11px]" style={{ color: SUB }}>
                        {got}/{all}
                      </span>
                    </div>
                  )}
                  {ACH_SERIES.filter((s) => s.category === c).map((s) => (
                    <SeriesRow key={s.id} s={s} ach={ach} open={expanded === s.id} onClick={() => setExpanded(expanded === s.id ? null : s.id)} />
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// One series as a glass card: glowing medal, name, next goal, gradient
// progress bar and step dots. Tap → every step with its unlock date.
function SeriesRow({ s, ach, open, onClick }: { s: AchSeries; ach: AchData; open: boolean; onClick: () => void }) {
  const value = ach.numbers[s.field] ?? 0;
  const earnedIdx = s.steps.map((_, i) => i).filter((i) => ach.badges[achKey(s, i)]);
  const best = earnedIdx.length ? Math.max(...earnedIdx) : null;
  const nextI = s.steps.findIndex((_, i) => !ach.badges[achKey(s, i)]);
  const next = nextI < 0 ? null : nextI;
  const complete = next === null;
  const shownIdx = best ?? 0;
  const ringOf = (i: number) => ACH_METALS[Math.min(ACH_METALS.length - 1, Math.max(0, achMetal(s, i)))].ring;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      className="relative w-full cursor-pointer rounded-[18px] p-3"
      style={
        complete
          ? {
              // gold → pink → violet border on a finished series
              border: "1px solid transparent",
              background: `linear-gradient(135deg, #2A1A40, #1E103A) padding-box, linear-gradient(135deg, ${GOLD}, ${PINK}, ${VIOLET}) border-box`,
            }
          : {
              border: `1px solid ${best !== null ? "rgba(255,211,107,.45)" : "rgba(255,255,255,.15)"}`,
              background: best !== null ? "linear-gradient(135deg, rgba(255,211,107,.18), rgba(139,92,255,.08))" : "rgba(255,255,255,.08)",
            }
      }
    >
      <div className="flex items-center">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
          {best !== null && (
            <span
              className="ach-glow absolute h-[58px] w-[58px] rounded-full"
              style={{ background: `radial-gradient(circle, ${ringOf(shownIdx)}99, transparent 70%)` }}
            />
          )}
          <span className="relative">
            <AchMedal emoji={s.emoji} label={achMedalLabel(s, shownIdx)} metal={achMetal(s, shownIdx)} earned={best !== null} size={48} />
          </span>
        </div>
        <div className="ml-3 min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[15px] font-bold">{best !== null ? achStepTitle(s, best) : s.title}</p>
            {complete && (
              <span className="shrink-0 rounded-full bg-gradient-to-r from-[#FFD36B] to-[#FFA726] px-1.5 py-px text-[9px] font-extrabold text-[#1A0E00]">
                MAX
              </span>
            )}
          </div>
          <p className="line-clamp-2 text-[11px]" style={{ color: SUB }}>
            {complete ? "Every step unlocked 🎉" : achGoalText(s, next!)}
          </p>
          {next !== null && s.steps[next] > 1 && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-white/[0.12]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#FFD36B] via-[#FF5FA2] to-[#8B5CFF]"
                  style={{ width: `${Math.min(100, (Math.min(value, s.steps[next]) / s.steps[next]) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] font-bold">
                {achShort(Math.min(value, s.steps[next]))}/{achShort(s.steps[next])}
              </span>
            </div>
          )}
          {s.steps.length > 1 && (
            <div className="mt-1.5 flex gap-[3px]">
              {s.steps.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 rounded-full ${s.steps.length > 8 ? "w-2.5" : "w-[18px]"}`}
                  style={{ background: ach.badges[achKey(s, i)] ? ringOf(i) : "rgba(255,255,255,.13)" }}
                />
              ))}
            </div>
          )}
        </div>
        <span className="ml-1.5 text-sm" style={{ color: SUB }}>
          {open ? "▴" : "▾"}
        </span>
      </div>
      {open && (
        <>
          <div className="my-2.5 h-px bg-white/15" />
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto">
            {s.steps.map((_, i) => {
              const b = ach.badges[achKey(s, i)];
              return (
                <div
                  key={i}
                  className={`flex w-[76px] shrink-0 flex-col items-center rounded-[14px] py-2 text-center ${b ? "bg-[#FFD36B]/10" : "bg-white/5"}`}
                >
                  <AchMedal emoji={s.emoji} label={achMedalLabel(s, i)} metal={achMetal(s, i)} earned={!!b} size={50} />
                  <p className={`mt-1 line-clamp-2 text-[10px] font-semibold leading-3 ${b ? "" : "text-[#AFA3D6]"}`}>{achStepTitle(s, i)}</p>
                  <p className="text-[9px]" style={{ color: b ? GOLD : "#7F74A8" }}>
                    {b ? (b.earnedAt > 0 ? fmtDate(b.earnedAt) : "Unlocked") : "🔒 Locked"}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px]" style={{ color: SUB }}>
            {s.steps.map((_, i) => achGoalText(s, i)).join(" · ")}
          </p>
        </>
      )}
    </div>
  );
}

function EventRow({ emoji, title, earned, sub }: { emoji: string; title: string; earned: boolean; sub: string }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-[18px] border p-3 ${
        earned ? "border-[#FF5FA2]/50 bg-gradient-to-br from-[#FF5FA2]/20 to-[#8B5CFF]/[0.13]" : "border-white/15 bg-white/[0.08]"
      }`}
    >
      <AchMedal emoji={emoji} label="" metal={EVENT_METAL} earned={earned} size={48} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold">{title}</p>
        <p className="text-[11px]" style={{ color: earned ? GOLD : SUB }}>
          {sub}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Founder tools (miglife secret)
// ---------------------------------------------------------------------------
const PART_NAMES: Record<string, string> = { gifts: "🎁 Gifts", games: "🎮 Games", messages: "💬 Messages", award: "🏅 Badges" };

export function FounderAchievementsCard() {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Record<string, string>>({});
  const run = async () => {
    setBusy(true);
    setLog({});
    for (const part of ["gifts", "games", "messages", "award"]) {
      let cursor: unknown = null;
      let rounds = 0;
      for (;;) {
        rounds++;
        setLog((l) => ({ ...l, [part]: `${PART_NAMES[part]} … counting (step ${rounds})` }));
        let d: Record<string, unknown> | null = null;
        try {
          d = (await founderRecount({ part, cursor })).data || {};
        } catch (e: any) {
          setLog((l) => ({ ...l, [part]: `${PART_NAMES[part]} ❌ ${e?.message || "failed"}` }));
          setBusy(false);
          return;
        }
        if (d.done === true) {
          const info = ["users", "gifts", "lines", "awarded"]
            .filter((k) => d![k] !== undefined && d![k] !== null)
            .map((k) => `${d![k]} ${k}`)
            .join(", ");
          setLog((l) => ({ ...l, [part]: `${PART_NAMES[part]} ✅ ${info}` }));
          break;
        }
        cursor = d.cursor;
      }
    }
    setBusy(false);
  };
  return (
    <>
      <div className="space-y-2 rounded-[18px] border-[1.5px] border-[#D9A10B] bg-white p-4">
        <p className="text-[17px] font-extrabold">🏅 Achievements</p>
        <p className="text-xs text-gray-500">
          Counts the PAST (gifts, game wins, Lucky User, vouchers, room messages, rooms entered, night chats) and gives every badge people already
          deserve. New activity is counted automatically. Run once after the update; it can take a few minutes — keep this page open.
        </p>
        <button type="button" disabled={busy} onClick={run} className="w-full rounded-xl bg-[#D9A10B] py-2.5 font-extrabold text-white disabled:opacity-60">
          {busy ? "Counting…" : "RECOUNT ALL BADGES"}
        </button>
        {Object.values(log).map((line) => (
          <p key={line} className="text-[13px]">
            {line}
          </p>
        ))}
      </div>
      <FounderEventBadgesCard />
    </>
  );
}

// Bangladesh time (UTC+6) ↔ "yyyy-MM-dd HH:mm"
const DHAKA_MS = 6 * 3600_000;
const toDhaka = (ms: number) => new Date(ms + DHAKA_MS).toISOString().slice(0, 16).replace("T", " ");
function fromDhaka(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - DHAKA_MS;
  return Number.isFinite(ms) ? ms : null;
}

const PRESETS: [string, string][] = [
  ["🌙", "Eid Mubarak"],
  ["🐐", "Eid ul-Adha"],
  ["🪔", "Puja"],
  ["🎊", "Noboborsho 1433"],
  ["🇧🇩", "Victory Day"],
  ["🎆", "New Year"],
  ["🎂", "miglife Birthday"],
];

// 🎉 Event badges: name + emoji + start/end (Bangladesh time). Everyone who
// opens miglife in that window gets it; after the end nobody can.
function FounderEventBadgesCard() {
  const [events, setEvents] = useState<AchEvent[]>([]);
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🎉");
  const [start, setStart] = useState(() => toDhaka(Date.now()));
  const [end, setEnd] = useState(() => toDhaka(Date.now() + 3 * 24 * 3600_000));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = async () => {
    try {
      const { data } = await founderEvent({ action: "list" });
      setEvents(
        (data?.events || []).map((e) => ({
          id: String(e.id),
          title: String(e.title || ""),
          emoji: String(e.emoji || "🎉"),
          startMs: Number(e.startMs || 0),
          endMs: Number(e.endMs || 0),
        }))
      );
    } catch {
      // list stays as it was
    }
  };
  useEffect(() => {
    reload();
  }, []);

  const input = "w-full rounded-xl border border-[#D5E3F5] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#B04BD6]";
  const now = Date.now();
  return (
    <div className="space-y-2 rounded-[18px] border-[1.5px] border-[#B04BD6] bg-white p-4">
      <p className="text-[17px] font-extrabold">🎉 Event Badges</p>
      <p className="text-xs text-gray-500">
        Limited-time badge: everyone who opens miglife between start and end gets it. After the end it can never be earned again. Time is Bangladesh
        time.
      </p>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {PRESETS.map(([e, t]) => (
          <Chip key={t} label={`${e} ${t}`} on={false} onClick={() => (setEmoji(e), setTitle(t))} />
        ))}
      </div>
      <div className="flex gap-1.5">
        <input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 8))} placeholder="Emoji" className={`${input} w-20`} />
        <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 30))} placeholder="Badge name" className={input} />
      </div>
      <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="Start (yyyy-MM-dd HH:mm)" className={input} />
      <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="End (yyyy-MM-dd HH:mm)" className={input} />
      <button
        type="button"
        disabled={busy || !title.trim()}
        onClick={async () => {
          const s = fromDhaka(start);
          const e = fromDhaka(end);
          if (s === null || e === null) return setMsg("Write the time like 2026-10-01 00:00");
          setBusy(true);
          setMsg(null);
          try {
            await founderEvent({ action: "create", title: title.trim(), emoji: emoji.trim(), startMs: s, endMs: e });
            setMsg("✅ Event badge created");
          } catch (err: any) {
            setMsg(`Failed: ${err?.message || "unknown error"}`);
          }
          await reload();
          setBusy(false);
        }}
        className="w-full rounded-xl bg-[#B04BD6] py-2.5 font-extrabold text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "CREATE EVENT BADGE"}
      </button>
      {msg && <p className="text-[13px]">{msg}</p>}
      {events.map((ev) => (
        <div key={ev.id} className="flex items-center gap-2 rounded-xl bg-[#B04BD6]/[0.07] p-2">
          <AchMedal emoji={ev.emoji} label="" metal={EVENT_METAL} earned={ev.endMs > now} size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold">{ev.title}</p>
            <p className="text-[11px] text-gray-500">
              {toDhaka(ev.startMs)} → {toDhaka(ev.endMs)} · {now < ev.startMs ? "coming" : now < ev.endMs ? "🔥 running" : "ended"}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            aria-label="Delete event"
            onClick={async () => {
              setBusy(true);
              await founderEvent({ action: "delete", id: ev.id }).catch(() => {});
              await reload();
              setBusy(false);
            }}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#C0123C]/15 font-bold text-[#C0123C]"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
