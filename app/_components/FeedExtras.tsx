"use client";

import { useEffect, useState } from "react";
import { blogCall, blogError } from "../../lib/feed";

// =============================================================================
// 📊 ⏰ 💚 📅 Feed phase 4 (miglife 2026-11), same as the app (BlogExtras.kt):
//   InsightsSheet     — the writer's own numbers for a Mig (views by hour, reactions…)
//   SchedulePicker    — pick a day + time to post a Mig later
//   ScheduledSheet    — my Migs waiting to go out (cancel one)
//   CloseFriendsSheet — tick the friends who see 💚 Close Friends Migs
//   MemoriesCard      — "On this day": my Migs from earlier years, Share again
// =============================================================================

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#0B1F3A]/45 sm:items-center sm:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[86vh] w-full max-w-[440px] flex-col rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[16px] font-black text-[#1E1B4B]">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F2F8] text-[15px] font-black text-[#4B4F7A]">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const fmtNum = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;

type Insights = { views: number; reactions: number; comments: number; shares: number; gifts: number; giftCoins: number; engagement: number; byHour: number[]; kinds: Record<string, number> };

export function InsightsSheet({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [d, setD] = useState<Insights | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    blogCall("insights", { postId }).then((r) => setD(r as Insights)).catch((e) => setErr(blogError(e)));
  }, [postId]);
  const max = d ? Math.max(1, ...d.byHour) : 1;
  const best = d ? d.byHour.indexOf(Math.max(...d.byHour)) : -1;
  return (
    <Sheet title="📊 Mig insights" onClose={onClose}>
      <p className="-mt-2 mb-3 text-[12px] font-semibold text-[#8A8FB0]">Only you can see these numbers.</p>
      {err && <p className="py-6 text-center text-[13px] font-bold text-[#E11D48]">{err}</p>}
      {!d && !err && <p className="py-10 text-center text-[13px] font-semibold text-[#8A8FB0]">Loading…</p>}
      {d && (
        <div className="overflow-y-auto">
          <div className="grid grid-cols-3 gap-2">
            {[
              ["👁", "Views", d.views],
              ["❤️", "Reactions", d.reactions],
              ["💬", "Comments", d.comments],
              ["↗️", "Shares", d.shares],
              ["🎁", "Gifts", d.gifts],
              ["🔥", "Engaged", `${d.engagement}%`],
            ].map(([icon, label, v]) => (
              <div key={String(label)} className="rounded-2xl bg-gradient-to-br from-[#F5F3FF] to-[#FDF2F8] px-2 py-3 text-center">
                <div className="text-[18px]">{icon}</div>
                <div className="text-[19px] font-black text-[#1E1B4B]">{typeof v === "number" ? fmtNum(v) : v}</div>
                <div className="text-[11px] font-bold text-[#8A8FB0]">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-[#EEF0F7] p-3">
            <div className="mb-2 flex items-center justify-between text-[12.5px] font-extrabold text-[#1E1B4B]">
              <span>When people saw it</span>
              {best >= 0 && d.byHour[best] > 0 && <span className="rounded-full bg-[#EEF0FF] px-2 py-0.5 text-[11px] text-[#6366F1]">Best: {hourLabel(best)}</span>}
            </div>
            <div className="flex h-[90px] items-end gap-[3px]">
              {d.byHour.map((n, h) => (
                <div key={h} title={`${hourLabel(h)}: ${n}`} className={`flex-1 rounded-t-[3px] ${h === best && n > 0 ? "bg-gradient-to-t from-[#EC4899] to-[#8B5CF6]" : "bg-[#DDD6FE]"}`} style={{ height: `${Math.max(4, (n / max) * 100)}%` }} />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] font-bold text-[#A0A6C2]">
              <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
            </div>
            <p className="mt-1 text-[10.5px] font-semibold text-[#A0A6C2]">Bangladesh time</p>
          </div>
          {Object.keys(d.kinds).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(d.kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                <span key={k} className="rounded-full bg-[#F4F6FD] px-3 py-1 text-[13px] font-extrabold text-[#1E1B4B]">{k} {n}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

// ⏰ the <input type="datetime-local"> value for a time
const localValue = (ms: number) => {
  const t = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`;
};
export const scheduleLabel = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

export function SchedulePicker({ value, onPick, onClose, onList }: { value: number | null; onPick: (ms: number | null) => void; onClose: () => void; onList: () => void }) {
  const soon = () => Math.ceil((Date.now() + 60 * 60000) / (15 * 60000)) * 15 * 60000;
  const [v, setV] = useState(localValue(value || soon()));
  const [err, setErr] = useState("");
  const quick: [string, () => number][] = [
    ["In 1 hour", () => Date.now() + 60 * 60000],
    ["Tonight 9pm", () => { const t = new Date(); t.setHours(21, 0, 0, 0); if (t.getTime() < Date.now() + 10 * 60000) t.setDate(t.getDate() + 1); return t.getTime(); }],
    ["Tomorrow 9am", () => { const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0); return t.getTime(); }],
  ];
  const ok = () => {
    const ms = new Date(v).getTime();
    if (!Number.isFinite(ms) || ms < Date.now() + 5 * 60000) return setErr("Pick a time at least 5 minutes from now.");
    if (ms > Date.now() + 30 * 86400000) return setErr("You can schedule up to 30 days ahead.");
    onPick(ms);
    onClose();
  };
  return (
    <Sheet title="⏰ Post later" onClose={onClose}>
      <div className="mb-3 flex flex-wrap gap-2">
        {quick.map(([label, f]) => (
          <button key={label} type="button" onClick={() => (setV(localValue(f())), setErr(""))} className="rounded-full bg-[#F1F2F8] px-3 py-1.5 text-[12.5px] font-extrabold text-[#4B4F7A] hover:bg-[#EEF0FF]">{label}</button>
        ))}
      </div>
      <input type="datetime-local" value={v} min={localValue(Date.now() + 5 * 60000)} onChange={(e) => (setV(e.target.value), setErr(""))} className="w-full rounded-2xl border-2 border-[#E5E7F2] px-3 py-3 text-[15px] font-bold text-[#1E1B4B] outline-none focus:border-[#8B5CF6]" />
      {err && <p className="mt-2 text-[12.5px] font-bold text-[#E11D48]">{err}</p>}
      <div className="mt-4 flex gap-2">
        {value && (
          <button type="button" onClick={() => (onPick(null), onClose())} className="h-11 rounded-2xl bg-[#F1F2F8] px-4 text-[14px] font-black text-[#4B4F7A]">Post now</button>
        )}
        <button type="button" onClick={ok} className="h-11 flex-1 rounded-2xl bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] text-[14.5px] font-black text-white">Set time ✓</button>
      </div>
      <button type="button" onClick={onList} className="mt-3 text-[13px] font-extrabold text-[#6366F1]">🗓 See my scheduled Migs</button>
    </Sheet>
  );
}

type Scheduled = { id: string; atMs: number; title: string; text: string; privacy: string; image: string; video: boolean; audio: boolean };
export function ScheduledSheet({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Scheduled[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    blogCall("scheduledList").then((r) => setItems((r as { items: Scheduled[] }).items || [])).catch((e) => setErr(blogError(e)));
  }, []);
  const cancel = async (id: string) => {
    if (!window.confirm("Cancel this scheduled Mig?")) return;
    setItems((x) => (x ? x.filter((i) => i.id !== id) : x));
    await blogCall("scheduledCancel", { id }).catch((e) => setErr(blogError(e)));
  };
  return (
    <Sheet title="🗓 Scheduled Migs" onClose={onClose}>
      {err && <p className="mb-2 text-[12.5px] font-bold text-[#E11D48]">{err}</p>}
      {!items && !err && <p className="py-8 text-center text-[13px] font-semibold text-[#8A8FB0]">Loading…</p>}
      {items && items.length === 0 && <p className="py-8 text-center text-[13px] font-semibold text-[#8A8FB0]">Nothing scheduled. Tap ⏰ while writing a Mig to post it later.</p>}
      <div className="overflow-y-auto">
        {items?.map((i) => (
          <div key={i.id} className="mb-2 flex items-center gap-3 rounded-2xl border border-[#EEF0F7] p-2.5">
            {i.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={i.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F5F3FF] text-[20px]">{i.video ? "🎬" : i.audio ? "🎙" : "📝"}</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-extrabold text-[#1E1B4B]">{i.title || i.text || "Mig"}</div>
              <div className="text-[12px] font-bold text-[#8B5CF6]">⏰ {scheduleLabel(i.atMs)}{i.privacy === "close" ? " · 💚" : i.privacy === "friends" ? " · 👥" : i.privacy === "me" ? " · 🔒" : ""}</div>
            </div>
            <button type="button" onClick={() => cancel(i.id)} className="rounded-full bg-[#FFF1F2] px-3 py-1.5 text-[12px] font-black text-[#E11D48]">Cancel</button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export function CloseFriendsSheet({ friends, onClose, avatar }: { friends: string[]; onClose: () => void; avatar: (name: string) => React.ReactNode }) {
  const [on, setOn] = useState<string[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    blogCall("closeList").then((r) => setOn((r as { names: string[] }).names || [])).catch((e) => setErr(blogError(e)));
  }, []);
  const has = (f: string) => !!on?.some((x) => x.toLowerCase() === f.toLowerCase());
  const save = async () => {
    if (!on) return;
    setBusy(true);
    try {
      await blogCall("closeSave", { names: on });
      onClose();
    } catch (e) {
      setErr(blogError(e));
    } finally {
      setBusy(false);
    }
  };
  // ticked ones first, then the rest
  const list = [...friends].sort((a, b) => Number(has(b)) - Number(has(a))).filter((f) => !q.trim() || f.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet title="💚 Close Friends" onClose={onClose}>
      <p className="-mt-2 mb-2 text-[12px] font-semibold text-[#8A8FB0]">Only these friends see your 💚 Close Friends Migs. Nobody is told when you add or remove them.</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Search friends" className="mb-2 w-full rounded-2xl bg-[#F4F6FD] px-3 py-2.5 text-[14px] font-semibold outline-none" />
      {err && <p className="mb-2 text-[12.5px] font-bold text-[#E11D48]">{err}</p>}
      <div className="min-h-[120px] flex-1 overflow-y-auto">
        {!on && !err && <p className="py-8 text-center text-[13px] font-semibold text-[#8A8FB0]">Loading…</p>}
        {on && friends.length === 0 && <p className="py-8 text-center text-[13px] font-semibold text-[#8A8FB0]">Add friends first.</p>}
        {on &&
          list.slice(0, 300).map((f) => {
            const t = has(f);
            return (
              <button
                key={f}
                type="button"
                disabled={!t && on.length >= 50}
                onClick={() => setOn((x) => (x ? (t ? x.filter((n) => n.toLowerCase() !== f.toLowerCase()) : [...x, f]) : x))}
                className="flex w-full items-center gap-3 border-b border-[#F0F1F7] px-1 py-2 text-left disabled:opacity-40"
              >
                {avatar(f)}
                <span className="min-w-0 flex-1 truncate text-[14px] font-extrabold text-[#1E1B4B]">{f}</span>
                <span className={`flex h-[24px] w-[24px] items-center justify-center rounded-full text-[13px] font-black ${t ? "bg-[#22C55E] text-white" : "border-2 border-[#C9D3E3]"}`}>{t ? "✓" : ""}</span>
              </button>
            );
          })}
      </div>
      <button type="button" disabled={!on || busy} onClick={save} className="mt-3 h-11 w-full rounded-2xl bg-gradient-to-r from-[#22C55E] to-[#10B981] text-[14.5px] font-black text-white disabled:opacity-50">
        {busy ? "Saving…" : `Save · ${on?.length || 0} close friend${on?.length === 1 ? "" : "s"}`}
      </button>
    </Sheet>
  );
}

export type Memory = { id: string; years: number; title: string; excerpt: string; image: string; video: boolean; createdMs: number; privacy: string; likes: number; comments: number };

// 📅 "On this day" at the top of my Feed (hidden for the day once closed)
export function MemoriesCard({ onOpen, onShare }: { onOpen: (id: string) => void; onShare: (m: Memory) => void }) {
  const [items, setItems] = useState<Memory[]>([]);
  const [i, setI] = useState(0);
  const dayKey = `mig_mem_hide_${new Date().toDateString()}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(dayKey) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (hidden) return;
    blogCall("memories").then((r) => setItems((r as { memories: Memory[] }).memories || [])).catch(() => {});
  }, [hidden]);
  if (hidden || items.length === 0) return null;
  const m = items[Math.min(i, items.length - 1)];
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(dayKey, "1");
    } catch {
      // blocked
    }
  };
  return (
    <div className="mb-3 overflow-hidden rounded-3xl bg-gradient-to-br from-[#FEF3C7] via-[#FCE7F3] to-[#EDE9FE] p-[1.5px] shadow-[0_10px_30px_-18px_rgba(139,92,246,.8)]">
      <div className="rounded-[22px] bg-white/80 p-3.5 backdrop-blur">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[20px]">📅</span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-black text-[#1E1B4B]">On this day</div>
            <div className="text-[11.5px] font-bold text-[#8A8FB0]">{m.years} year{m.years === 1 ? "" : "s"} ago · {new Date(m.createdMs).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
          </div>
          {items.length > 1 && <span className="text-[11px] font-black text-[#8B5CF6]">{i + 1}/{items.length}</span>}
          <button type="button" onClick={hide} aria-label="Hide" className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[12px] font-black text-[#8A8FB0]">✕</button>
        </div>
        <button type="button" onClick={() => onOpen(m.id)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-2 text-left">
          {m.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.image} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FDE68A] to-[#F9A8D4] text-[26px]">{m.video ? "🎬" : "✍️"}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="line-clamp-1 text-[14px] font-extrabold text-[#1E1B4B]">{m.title}</div>
            <div className="line-clamp-2 text-[12.5px] font-semibold text-[#6B7094]">{m.excerpt}</div>
            <div className="mt-0.5 text-[11.5px] font-bold text-[#A0A6C2]">❤️ {m.likes} · 💬 {m.comments}</div>
          </div>
        </button>
        <div className="mt-2.5 flex gap-2">
          {items.length > 1 && (
            <button type="button" onClick={() => setI((x) => (x + 1) % items.length)} className="h-9 rounded-full bg-white px-4 text-[12.5px] font-black text-[#4B4F7A]">Next ›</button>
          )}
          {!m.privacy && (
            <button type="button" onClick={() => onShare(m)} className="ml-auto h-9 rounded-full bg-gradient-to-r from-[#F59E0B] to-[#EC4899] px-4 text-[12.5px] font-black text-white">↗️ Share again</button>
          )}
        </div>
      </div>
    </div>
  );
}
