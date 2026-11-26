"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import type { SysCard } from "../../../lib/feed";
import { SystemCard } from "../../_components/SystemPost";
import { FounderShell, card } from "../_Shell";

// ⚙️ System posts (miGlife only): miGlife's own Migs in the Feed. Turn each kind
// on / off, its time and days (Bangladesh time), Eid dates, and the hadith /
// history / amal lists. Preview or post one now. Same as the app's tool.
type Kind = { on: boolean; time: string; days: number[] };
type Settings = { master: boolean; kinds: Record<string, Kind>; eids: { date: string; name: string; text: string }[] };
type Hadith = { text: string; ref: string };
type History = { md: string; year: number; title: string; text: string };
type Amal = { title: string; text: string; ref: string };
type Short = { title?: string; text: string };
type Content = { hadith: Hadith[]; history: History[]; amal: Amal[]; question: Short[]; tip: Short[]; safety: Short[] };
type ListTab = "hadith" | "history" | "amal" | "question" | "tip" | "safety";

const call = (data: Record<string, unknown>) => httpsCallable(functions, "systemPosts")(data).then((r) => r.data as any);
const KIND_LABEL: Record<string, string> = {
  amal: "🌙 Daily amal", morning: "☀️ Good morning + Daily Missions", festival: "🇧🇩 Special days & Eid", birthday: "🎂 Birthdays",
  history: "📜 On this day in history", hadith: "🕌 Hadith", season: "🏅 Season Pass", topmigs: "🔥 Top Migs of the week", welcome: "👋 Welcome new members",
  champions: "🏆 Yesterday's Champions", lucky: "🍀 Yesterday's Lucky Users", topgifters: "💎 Gifts of the week", levelup: "⭐ Big level-ups today",
  anniversary: "🎂 miGlife anniversaries", roomofday: "🏠 Busiest rooms", question: "❓ Question of the day", newinshop: "🛍 New in the shop this week",
  ramadan: "🌙 Ramadan day count", countdown: "📅 Countdown to special days", tip: "💡 miGlife tip", safety: "🛡 Stay safe reminder",
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SystemPostsPage() {
  const f = useFounderPerms();
  const [s, setS] = useState<Settings | null>(null);
  const [kinds, setKinds] = useState<string[]>([]);
  const [content, setContent] = useState<Content | null>(null);
  const [log, setLog] = useState<{ id: string; postId?: string; skipped?: boolean; error?: string }[]>([]);
  const [tab, setTab] = useState<"kinds" | ListTab>("kinds");
  const [preview, setPreview] = useState<{ kind: string; card: SysCard | null; note?: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const load = () =>
    call({ action: "get" })
      .then((r) => (setS(r.settings), setKinds(r.kinds), setContent({ question: [], tip: [], safety: [], ...r.content }), setLog(r.log || [])))
      .catch((e) => setMsg({ text: e?.message || "Could not load.", error: true }));
  useEffect(() => {
    if (f.isMigwith) load();
  }, [f.isMigwith]);
  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    setMsg(null);
    try {
      setMsg({ text: await fn(), error: false });
    } catch (e: any) {
      setMsg({ text: e?.message || "Something went wrong.", error: true });
    }
    setBusy("");
  };
  const setKind = (k: string, p: Partial<Kind>) => setS((o) => (o ? { ...o, kinds: { ...o.kinds, [k]: { ...o.kinds[k], ...p } } } : o));
  const input = "w-full rounded-lg border border-[#D4DDEB] bg-white px-2 py-1.5 text-[13px] text-[#16264A] outline-none";
  const btn = "rounded-lg px-3 py-1.5 text-[12px] font-bold disabled:opacity-50";
  return (
    <FounderShell title="⚙️ System posts" allowed={f.isMigwith} loaded={f.loaded}>
      {!s || !content ? (
        <p className="p-3 text-sm text-[#5B6B8C]">{msg?.text || "Loading…"}</p>
      ) : (
        <div className="space-y-3">
          <div className={`${card} flex items-center gap-3`}>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-black text-[#16264A]">System posts are {s.master ? "ON" : "OFF"}</div>
              <div className="text-[11.5px] font-semibold text-[#5B6B8C]">Posted by the miglife account with a “⚙️ System post” tag. Times are Bangladesh time.</div>
            </div>
            <button type="button" onClick={() => setS({ ...s, master: !s.master })} className={`h-8 w-14 rounded-full p-1 transition ${s.master ? "bg-[#10B981]" : "bg-[#CBD5E1]"}`}>
              <span className={`block h-6 w-6 rounded-full bg-white transition ${s.master ? "translate-x-6" : ""}`} />
            </button>
          </div>
          <p className="rounded-xl bg-[#FFFBEB] px-3 py-2 text-[12px] font-bold text-[#92400E]">
            ⚠️ Hadith, amal and history come only from the lists below. Please have them checked by someone who knows before turning those kinds on.
          </p>
          <div className="flex gap-1.5 overflow-x-auto">
            {(["kinds", "hadith", "history", "amal", "question", "tip", "safety"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`${btn} shrink-0 ${tab === t ? "bg-[#0B1F3A] text-white" : "bg-[#EEF2F8] text-[#16264A]"}`}>
                {t === "kinds" ? "Kinds & times" : `${{ hadith: "🕌 Hadith", history: "📜 History", amal: "🌙 Amal", question: "❓ Questions", tip: "💡 Tips", safety: "🛡 Safety" }[t]} (${content[t].length})`}
              </button>
            ))}
          </div>

          {tab === "kinds" && (
            <>
              {kinds.map((k) => {
                const v = s.kinds[k];
                return (
                  <div key={k} className={`${card} space-y-2`}>
                    <div className="flex items-center gap-2">
                      <label className="flex min-w-0 flex-1 items-center gap-2 text-[13.5px] font-black text-[#16264A]">
                        <input type="checkbox" checked={v.on} onChange={(e) => setKind(k, { on: e.target.checked })} /> {KIND_LABEL[k] || k}
                      </label>
                      <input type="time" value={v.time} onChange={(e) => setKind(k, { time: e.target.value })} className={`${input} w-[110px]`} />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {DAYS.map((d, i) => {
                        const on = v.days.includes(i);
                        return (
                          <button key={d} type="button" onClick={() => setKind(k, { days: on ? v.days.filter((x) => x !== i) : [...v.days, i].sort() })} className={`${btn} ${on ? "bg-[#6366F1] text-white" : "bg-[#EEF2F8] text-[#5B6B8C]"}`}>
                            {d}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" disabled={!!busy} onClick={() => run("p", async () => { const r = await call({ action: "preview", kind: k }); setPreview({ kind: k, card: r.card, note: r.note }); return r.card ? "Preview below ↓" : r.note || "Nothing to post today."; })} className={`${btn} bg-[#EEF0FF] text-[#4F46E5]`}>
                        👁 Preview
                      </button>
                      <button type="button" disabled={!!busy} onClick={() => confirm(`Post "${KIND_LABEL[k]}" in the Feed now?`) && run("n", async () => { const r = await call({ action: "postNow", kind: k }); return r.postId ? "✅ Posted in the Feed." : r.note || "Nothing to post today."; })} className={`${btn} bg-[#ECFDF5] text-[#047857]`}>
                        ➤ Post now
                      </button>
                    </div>
                    {preview?.kind === k && preview.card && <SystemCard sys={preview.card} />}
                  </div>
                );
              })}
              <div className={`${card} space-y-2`}>
                <div className="text-[13.5px] font-black text-[#16264A]">🌙 Eid dates (set after the moon is seen)</div>
                {s.eids.map((e, i) => (
                  <div key={i} className="grid grid-cols-[120px_1fr_auto] gap-1.5">
                    <input type="date" value={e.date} onChange={(ev) => setS({ ...s, eids: s.eids.map((x, j) => (j === i ? { ...x, date: ev.target.value } : x)) })} className={input} />
                    <input value={e.name} placeholder="Eid ul-Fitr" onChange={(ev) => setS({ ...s, eids: s.eids.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)) })} className={input} />
                    <button type="button" onClick={() => setS({ ...s, eids: s.eids.filter((_, j) => j !== i) })} className={`${btn} bg-[#FEF2F2] text-[#DC2626]`}>✕</button>
                    <input value={e.text} placeholder="Message (optional)" onChange={(ev) => setS({ ...s, eids: s.eids.map((x, j) => (j === i ? { ...x, text: ev.target.value } : x)) })} className={`${input} col-span-3`} />
                  </div>
                ))}
                <button type="button" onClick={() => setS({ ...s, eids: [...s.eids, { date: "", name: "Eid ul-Fitr", text: "" }] })} className={`${btn} bg-[#EEF2F8] text-[#16264A]`}>+ Add a date</button>
                <p className="text-[11px] font-semibold text-[#5B6B8C]">21 February, 26 March, Pohela Boishakh, 16 December and 1 January go out by themselves.</p>
                <p className="text-[11px] font-semibold text-[#5B6B8C]">🌙 Ramadan: add a date named “Ramadan” = the 1st day of Ramadan → a “Ramadan · Day N” post every day for 30 days. 📅 7, 3 and 1 day(s) before every date here, a countdown post goes out.</p>
              </div>
              <button type="button" disabled={!!busy} onClick={() => run("s", async () => { const r = await call({ action: "save", settings: s }); setS(r.settings); return "✅ Saved."; })} className="w-full rounded-xl bg-[#0B1F3A] py-3 text-[14px] font-bold text-white disabled:opacity-60">
                {busy === "s" ? "Saving…" : "Save settings"}
              </button>
              {log.length > 0 && (
                <div className={card}>
                  <div className="mb-1 text-[12.5px] font-black text-[#16264A]">Recent</div>
                  {log.map((l) => (
                    <div key={l.id} className="text-[12px] font-semibold text-[#5B6B8C]">
                      {l.id.replace("_", " · ")} — {l.postId ? "✅ posted" : l.skipped ? "nothing that day" : l.error ? `⚠️ ${l.error}` : "…"}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab !== "kinds" && (
            <ListEditor
              kind={tab}
              items={content[tab] as any[]}
              onChange={(items) => setContent({ ...content, [tab]: items } as Content)}
              busy={busy === "c"}
              onSave={() => run("c", async () => { const r = await call({ action: "saveContent", kind: tab, items: content[tab] }); return `✅ Saved ${r.count} items.`; })}
              input={input}
              btn={btn}
            />
          )}
          {msg && <p className={`text-[13px] font-bold ${msg.error ? "text-[#DC2626]" : "text-[#0E9F6E]"}`}>{msg.text}</p>}
        </div>
      )}
    </FounderShell>
  );
}

function ListEditor({ kind, items, onChange, onSave, busy, input, btn }: { kind: ListTab; items: any[]; onChange: (x: any[]) => void; onSave: () => void; busy: boolean; input: string; btn: string }) {
  const set = (i: number, p: Record<string, unknown>) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const blank = kind === "hadith" ? { text: "", ref: "" } : kind === "history" ? { md: "", year: 0, title: "", text: "" } : kind === "question" ? { text: "" } : kind === "amal" ? { title: "", text: "", ref: "" } : { title: "", text: "" };
  const list = kind === "history" ? items.map((x, i) => [x, i] as const).sort((a, b) => String(a[0].md).localeCompare(String(b[0].md))) : items.map((x, i) => [x, i] as const);
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => onChange([blank, ...items])} className={`${btn} bg-[#EEF2F8] text-[#16264A]`}>+ Add</button>
      {list.map(([x, i]) => (
        <div key={i} className={`${card} space-y-1.5`}>
          {kind === "history" && (
            <div className="grid grid-cols-[90px_80px_1fr] gap-1.5">
              <input value={x.md} placeholder="MM-DD" onChange={(e) => set(i, { md: e.target.value })} className={input} />
              <input inputMode="numeric" value={x.year || ""} placeholder="Year" onChange={(e) => set(i, { year: Number(e.target.value.replace(/\D/g, "")) || 0 })} className={input} />
              <input value={x.title} placeholder="Title" onChange={(e) => set(i, { title: e.target.value })} className={input} />
            </div>
          )}
          {(kind === "amal" || kind === "tip" || kind === "safety") && <input value={x.title || ""} placeholder={kind === "amal" ? "Title (e.g. Before sleeping)" : "Title (e.g. Music Library)"} onChange={(e) => set(i, { title: e.target.value })} className={input} />}
          <textarea value={x.text} rows={2} placeholder={kind === "hadith" ? "Hadith text (English)" : kind === "question" ? "Question (English), e.g. Tea or coffee? ☕" : "Text (English)"} onChange={(e) => set(i, { text: e.target.value })} className={input} />
          <div className="flex gap-1.5">
            {(kind === "hadith" || kind === "amal") && <input value={x.ref} placeholder="Reference (e.g. Sahih al-Bukhari 1)" onChange={(e) => set(i, { ref: e.target.value })} className={input} />}
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className={`${btn} ml-auto bg-[#FEF2F2] text-[#DC2626]`}>Remove</button>
          </div>
        </div>
      ))}
      <button type="button" disabled={busy} onClick={onSave} className="w-full rounded-xl bg-[#0B1F3A] py-3 text-[14px] font-bold text-white disabled:opacity-60">
        {busy ? "Saving…" : "Save list"}
      </button>
    </div>
  );
}
