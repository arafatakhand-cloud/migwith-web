"use client";

import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card, input } from "../_Shell";

// 📣 Push Notifications — miglife sends a notification to every phone (app)
// and every browser that turned push on: now, once at a set time, or every day
// at a set time (Bangladesh time). The server sends what is due every 5 minutes.

type Campaign = {
  id: string;
  title: string;
  body: string;
  kind: "daily" | "once";
  time: string;
  at: number;
  active: boolean;
  lastSentDay: string;
  sentAt: number;
  lastSentCount: number;
};

const pushCampaign = httpsCallable<Record<string, unknown>, { campaigns?: Campaign[]; ok?: boolean; sent?: number; total?: number }>(
  functions,
  "founderPushCampaign"
);

const dhaka = (ms: number) =>
  ms
    ? new Date(ms).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" })
    : "";

// "2026-10-18T08:00" typed as Bangladesh time → ms
function dhakaLocalToMs(v: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return 0;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 6, +m[5]);
}

export default function PushPage() {
  const f = useFounderPerms();
  const allowed = f.isMigwith;
  const [list, setList] = useState<Campaign[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"now" | "daily" | "once">("daily");
  const [time, setTime] = useState("08:00");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  const load = useCallback(() => {
    pushCampaign({ action: "list" })
      .then((r) => setList(r.data.campaigns || []))
      .catch((e) => {
        setList([]);
        setMsg({ text: e?.message || "Could not load.", bad: true });
      });
  }, []);
  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const submit = async () => {
    if (!title.trim() || !body.trim()) return setMsg({ text: "Write a title and a message.", bad: true });
    if (kind === "now" && !window.confirm(`Send "${title.trim()}" to EVERYONE now?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      if (kind === "now") {
        const r = await pushCampaign({ action: "sendNow", title, body });
        setMsg({ text: `✅ Sent to ${r.data.sent ?? 0} of ${r.data.total ?? 0} phones / browsers.`, bad: false });
      } else if (kind === "daily") {
        await pushCampaign({ action: "save", kind: "daily", time, title, body });
        setMsg({ text: `✅ Every day at ${time} (Bangladesh time).`, bad: false });
      } else {
        const at = dhakaLocalToMs(when);
        if (!at) throw new Error("Pick a date and time.");
        await pushCampaign({ action: "save", kind: "once", at, title, body });
        setMsg({ text: `✅ Will be sent on ${dhaka(at)}.`, bad: false });
      }
      setTitle("");
      setBody("");
      load();
    } catch (e: any) {
      setMsg({ text: e?.message || "Could not save.", bad: true });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (c: Campaign) => {
    await pushCampaign({ action: "toggle", id: c.id, active: !c.active }).catch(() => {});
    load();
  };
  const remove = async (c: Campaign) => {
    if (!window.confirm(`Delete "${c.title}"?`)) return;
    await pushCampaign({ action: "delete", id: c.id }).catch(() => {});
    load();
  };

  const tab = (k: typeof kind, label: string) => (
    <button
      type="button"
      onClick={() => setKind(k)}
      className={`flex-1 rounded-xl py-2 text-sm font-bold ${kind === k ? "bg-[#174EA6] text-white" : "bg-[#EEF3FA] text-[#35507E]"}`}
    >
      {label}
    </button>
  );

  return (
    <FounderShell title="📣 Push Notifications" allowed={allowed} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <p className="text-xs text-[#5B6B8C]">
          Goes to everyone who allowed notifications (app and web). Keep it to about one a day.
        </p>
        <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 100))} placeholder="Title — e.g. Boring morning? Not on miGlife! ☀️" className={input} />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 240))}
          placeholder="Message — e.g. Wake up, join a room and let the fun begin! 🎉"
          rows={3}
          className={input}
        />
        <div className="flex gap-2">
          {tab("daily", "🔁 Every day")}
          {tab("once", "📅 Once")}
          {tab("now", "⚡ Now")}
        </div>
        {kind === "daily" && (
          <label className="flex items-center gap-2 text-sm font-semibold">
            Time (Bangladesh)
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${input} max-w-[150px]`} />
          </label>
        )}
        {kind === "once" && (
          <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            Date & time (Bangladesh)
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`${input} max-w-[230px]`} />
          </label>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="w-full rounded-xl bg-[#2F80ED] py-3 text-sm font-black text-white disabled:opacity-50"
        >
          {busy ? "…" : kind === "now" ? "Send to everyone now" : "Save"}
        </button>
        {msg && <p className={`text-sm font-semibold ${msg.bad ? "text-[#B3261E]" : "text-[#1E7B34]"}`}>{msg.text}</p>}
      </div>

      <p className="pl-0.5 pt-2 text-[11px] font-bold uppercase tracking-[1px] text-[#5B6B8C]">Scheduled & sent</p>
      {list === null ? (
        <p className="py-6 text-center text-sm text-[#5B6B8C]">Loading…</p>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-[#5B6B8C]">Nothing yet.</p>
      ) : (
        list.map((c) => (
          <div key={c.id} className={`${card} space-y-1.5`}>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#EEF3FA] px-2.5 py-0.5 text-xs font-bold text-[#35507E]">
                {c.kind === "daily" ? `🔁 Daily ${c.time}` : `📅 ${dhaka(c.at)}`}
              </span>
              <span className={`text-xs font-bold ${c.active ? "text-[#1E7B34]" : "text-[#8A97A8]"}`}>
                {c.active ? "● On" : c.sentAt ? "Sent" : "Off"}
              </span>
              <span className="ml-auto flex gap-3 text-xs font-bold">
                {c.kind === "daily" && (
                  <button type="button" onClick={() => toggle(c)} className="text-[#174EA6]">
                    {c.active ? "Pause" : "Resume"}
                  </button>
                )}
                <button type="button" onClick={() => remove(c)} className="text-[#B3261E]">
                  Delete
                </button>
              </span>
            </div>
            <p className="text-sm font-bold">{c.title}</p>
            <p className="text-sm text-[#35507E]">{c.body}</p>
            {(c.lastSentDay || c.sentAt > 0) && (
              <p className="text-[11px] text-[#8A97A8]">
                Last sent: {c.kind === "daily" ? c.lastSentDay : dhaka(c.sentAt)}
                {c.lastSentCount ? ` · ${c.lastSentCount} delivered` : ""}
              </p>
            )}
          </div>
        ))
      )}
    </FounderShell>
  );
}
