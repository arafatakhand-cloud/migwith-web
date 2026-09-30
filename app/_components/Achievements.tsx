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

function AchievementsDialog({ ach, isOwnProfile, onClose }: { ach: AchData; isOwnProfile: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<AchCategory | null>(null); // null = All
  const [showEvents, setShowEvents] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const openEvents = useOpenEvents(true);
  const earnedCount = earnedMedals(ach).length;
  // Opening your own badges refreshes the "checked by the server" ones.
  useEffect(() => {
    if (isOwnProfile) syncMyAchievements().catch(() => {});
  }, [isOwnProfile]);

  const now = Date.now();
  const earnedEvents = Object.values(ach.badges)
    .filter((b) => b.key.startsWith("event_"))
    .sort((a, b) => b.earnedAt - a.earnedAt);
  const waiting = isOwnProfile ? openEvents.filter((ev) => !ach.badges[`event_${ev.id}`]) : [];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-3.5" onClick={onClose}>
      <div
        className="flex max-h-[min(640px,92vh)] w-full max-w-lg flex-col items-center rounded-[22px] bg-white p-3.5 text-[#0B2A5B]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[19px] font-extrabold">🏅 Achievements</p>
        <p className="text-xs text-gray-500">
          {earnedCount} of {ACH_TOTAL} badges earned
        </p>
        <div className="no-scrollbar mt-2.5 flex w-full gap-1.5 overflow-x-auto">
          <Chip label="All" on={tab === null && !showEvents} onClick={() => (setTab(null), setShowEvents(false))} />
          {ACH_CATEGORIES.map(([c, label]) => (
            <Chip key={c} label={label} on={tab === c && !showEvents} onClick={() => (setTab(c), setShowEvents(false))} />
          ))}
          <Chip label="🎉 Events" on={showEvents} onClick={() => (setShowEvents(true), setTab(null))} />
        </div>
        <div className="mt-2 w-full min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {showEvents ? (
            <>
              {earnedEvents.length === 0 && waiting.length === 0 && (
                <p className="p-4 text-center text-xs text-gray-500">
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
                      : `🔥 Running now — ends ${fmtDate(ev.endMs)}. Keep the app open to get it!`
                  }
                />
              ))}
              {earnedEvents.map((b) => (
                <EventRow
                  key={b.key}
                  emoji={b.emoji || "🎉"}
                  title={b.title || "Event"}
                  earned
                  sub={b.earnedAt > 0 ? `✅ Earned on ${fmtDate(b.earnedAt)}` : "✅ Earned"}
                />
              ))}
            </>
          ) : (
            ACH_CATEGORIES.filter(([c]) => tab === null || c === tab).map(([c, label]) => (
              <div key={c} className="space-y-1.5">
                {tab === null && <p className="pb-0.5 pt-1.5 text-[11px] font-bold tracking-[1px] text-[#B07A00]">{label.toUpperCase()}</p>}
                {ACH_SERIES.filter((s) => s.category === c).map((s) => (
                  <SeriesRow key={s.id} s={s} ach={ach} open={expanded === s.id} onClick={() => setExpanded(expanded === s.id ? null : s.id)} />
                ))}
              </div>
            ))
          )}
        </div>
        <button type="button" onClick={onClose} className="mt-2.5 rounded-xl bg-[#17395C] px-6 py-2 font-bold text-white">
          Close
        </button>
      </div>
    </div>
  );
}

// One series: best medal + name + progress to the next step. Tap → every step.
function SeriesRow({ s, ach, open, onClick }: { s: AchSeries; ach: AchData; open: boolean; onClick: () => void }) {
  const value = ach.numbers[s.field] ?? 0;
  const earnedIdx = s.steps.map((_, i) => i).filter((i) => ach.badges[achKey(s, i)]);
  const best = earnedIdx.length ? Math.max(...earnedIdx) : null;
  const nextI = s.steps.findIndex((_, i) => !ach.badges[achKey(s, i)]);
  const next = nextI < 0 ? null : nextI;
  const shownIdx = best ?? 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      className={`w-full cursor-pointer rounded-[14px] border p-2.5 ${best !== null ? "border-[#D9A10B]/20 bg-[#D9A10B]/[0.07]" : "border-black/[0.08] bg-black/[0.03]"}`}
    >
      <div className="flex items-center gap-2.5">
        <AchMedal emoji={s.emoji} label={achMedalLabel(s, shownIdx)} metal={achMetal(s, shownIdx)} earned={best !== null} size={46} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{best !== null ? achStepTitle(s, best) : s.title}</p>
          <p className="line-clamp-2 text-[11px] text-gray-500">{next === null ? "✅ Complete — every step earned!" : achGoalText(s, next)}</p>
          {next !== null && s.steps[next] > 1 && (
            <div className="mt-1 flex items-center gap-1.5">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#FFD86B] to-[#D9A10B]"
                  style={{ width: `${Math.min(100, (Math.min(value, s.steps[next]) / s.steps[next]) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-500">
                {achShort(Math.min(value, s.steps[next]))}/{achShort(s.steps[next])}
              </span>
            </div>
          )}
        </div>
        {s.steps.length > 1 && (
          <span className="text-xs font-bold text-[#B07A00]">
            {earnedIdx.length}/{s.steps.length}
          </span>
        )}
      </div>
      {open && (
        <>
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
            {s.steps.map((_, i) => {
              const b = ach.badges[achKey(s, i)];
              return (
                <div key={i} className="flex w-[72px] shrink-0 flex-col items-center text-center">
                  <AchMedal emoji={s.emoji} label={achMedalLabel(s, i)} metal={achMetal(s, i)} earned={!!b} size={50} />
                  <p className={`line-clamp-2 text-[10px] font-semibold leading-3 ${b ? "" : "text-gray-500"}`}>{achStepTitle(s, i)}</p>
                  <p className="text-[9px] text-gray-500">{b ? (b.earnedAt > 0 ? fmtDate(b.earnedAt) : "Earned") : "🔒"}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-[10px] text-gray-500">{s.steps.map((_, i) => achGoalText(s, i)).join(" · ")}</p>
        </>
      )}
    </div>
  );
}

function EventRow({ emoji, title, earned, sub }: { emoji: string; title: string; earned: boolean; sub: string }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-[14px] border p-2.5 ${earned ? "border-[#D9A10B]/20 bg-[#D9A10B]/[0.07]" : "border-black/[0.08] bg-black/[0.03]"}`}>
      <AchMedal emoji={emoji} label="" metal={EVENT_METAL} earned={earned} size={46} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-[11px] text-gray-500">{sub}</p>
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
