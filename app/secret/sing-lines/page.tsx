"use client";

import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { refreshCustomSongs } from "../../../lib/roomCommands";
import { FounderShell, card } from "../_Shell";

// 🎤 Sing Lines (miGlife only): write the WHOLE /sing message yourself —
// {name} = the person who typed /sing, {to} = who they sang for
// (singLinesAdmin → app_settings/sing_lines). Same as the app (SingLinesTool).

type Line = { id: string; text: string; at: number };
type Res = { ok: boolean; lines: Line[] };
const singLinesAdmin = httpsCallable<{ action: string; text?: string; id?: string }, Res>(functions, "singLinesAdmin");

export default function SingLinesPage() {
  const f = useFounderPerms();
  const [text, setText] = useState('{name} is singing a Bangla song, "" 🎤');
  const [lines, setLines] = useState<Line[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const call = async (data: { action: string; text?: string; id?: string }, ok = "") => {
    setBusy(true);
    setMsg(null);
    try {
      const r = (await singLinesAdmin(data)).data;
      setLines(r.lines || []);
      if (ok) setMsg({ text: ok, error: false });
      if (ok.startsWith("✅")) setText("");
      refreshCustomSongs(true);
    } catch (e) {
      const t = e instanceof Error ? e.message : "";
      setMsg({ text: t && !t.startsWith("internal") ? t : "Could not save. Please try again.", error: true });
      setLines((l) => l ?? []);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (f.loaded && f.isMigwith) call({ action: "list" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.loaded, f.isMigwith]);

  // puts {name} / {to} where the cursor is
  const insert = (tag: string) => {
    const el = box.current;
    const at = el ? el.selectionStart : text.length;
    const next = text.slice(0, at) + tag + text.slice(at);
    if (next.length > 300) return;
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + tag.length, at + tag.length);
    });
  };

  const clean = text.trim();
  const ok = !busy && clean.includes("{name}") && clean.replace("{name}", "").trim().length >= 3;
  return (
    <FounderShell title="🎤 Sing Lines" allowed={f.isMigwith} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <p className="text-xs text-[#5B6B8C]">
          Write the whole /sing message yourself. {"{name}"} becomes the person who typed /sing, {"{to}"} the person they sang for (&quot;everyone&quot; if
          nobody). About one /sing in three uses your messages.
        </p>
        <textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 300))}
          rows={3}
          placeholder="Whole message"
          className="w-full rounded-xl border border-[#D5DEEA] px-3 py-2.5 text-sm text-[#1E3A6E] outline-none focus:border-[#7C3AED]"
        />
        <div className="flex items-center gap-1.5">
          {["{name}", "{to}", "🎤"].map((t) => (
            <button key={t} type="button" onClick={() => insert(t)} className="rounded-full bg-[#F1E8FB] px-3 py-1.5 text-[12.5px] font-bold text-[#7C3AED]">
              + {t}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-[#5B6B8C]">{text.length}/300</span>
        </div>
        {clean && (
          <p className="text-[13px] font-bold text-[#B91C1C]">
            Preview: **{clean.split("{name}").join("kamol").split("{to}").join("anima")}**
          </p>
        )}
        {clean && !clean.includes("{name}") && <p className="text-[12px] text-[#B45309]">Put {"{name}"} where the singer&apos;s name should go.</p>}
        <button
          type="button"
          disabled={!ok}
          onClick={() => call({ action: "add", text: clean }, "✅ Added")}
          className="w-full rounded-xl bg-[#7C3AED] py-3 text-sm font-black text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "➕ Add message"}
        </button>
        {msg && <p className={`text-sm ${msg.error ? "text-[#B91C1C]" : "text-[#2E7D32]"}`}>{msg.text}</p>}
      </div>
      <p className="mb-2 mt-4 text-[11px] font-extrabold tracking-wide text-[#5B6B8C]">YOUR MESSAGES · {lines?.length ?? 0}</p>
      {lines === null ? (
        <p className="text-sm text-[#5B6B8C]">Loading…</p>
      ) : lines.length === 0 ? (
        <p className="text-[12.5px] text-[#5B6B8C]">No messages yet. /sing uses only the built-in songs.</p>
      ) : (
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.id} className={`${card} flex items-center gap-2`}>
              <span className="min-w-0 flex-1 text-sm text-[#1E3A6E]">{l.text}</span>
              <button type="button" disabled={busy} onClick={() => call({ action: "delete", id: l.id }, "🗑 Deleted")} className="rounded-full p-2 text-lg" aria-label="Delete">
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </FounderShell>
  );
}
