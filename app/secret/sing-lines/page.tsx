"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { refreshCustomSongs } from "../../../lib/roomCommands";
import { FounderShell, card } from "../_Shell";

// 🎤 Sing Songs (miGlife only): write NEW songs for /sing. The built-in songs
// all stay; yours are added to them (singLinesAdmin → app_settings/sing_lines).
// Same as the app (SingLinesTool).

type Line = { id: string; kind: string; line: string; at: number };
type Res = { ok: boolean; kinds: string[]; lines: Line[] };
const singLinesAdmin = httpsCallable<{ action: string; kind?: string; line?: string; id?: string }, Res>(functions, "singLinesAdmin");
const short = (k: string) => k.replace(/^an? /, "");
// what the room will show (one line, like the server saves it)
const oneLine = (t: string) => t.replace(/\s*\n\s*/g, ", ").replace(/["*]/g, "").replace(/\s+/g, " ").trim();

export default function SingSongsPage() {
  const f = useFounderPerms();
  const [kinds, setKinds] = useState<string[]>(["a Bangla song"]);
  const [kind, setKind] = useState("a Bangla song");
  const [text, setText] = useState("");
  const [lines, setLines] = useState<Line[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const call = async (data: { action: string; kind?: string; line?: string; id?: string }, ok = "") => {
    setBusy(true);
    setMsg(null);
    try {
      const r = (await singLinesAdmin(data)).data;
      if (r.kinds?.length) setKinds(r.kinds);
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

  const clean = oneLine(text);
  return (
    <FounderShell title="🎤 Sing Songs" allowed={f.isMigwith} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <p className="text-xs text-[#5B6B8C]">Write a new song for /sing. All the old songs stay — yours are added to them, and /sing picks from all of them.</p>
        <div>
          <p className="mb-2 text-[11px] font-extrabold tracking-wide text-[#5B6B8C]">TYPE OF SONG</p>
          <div className="flex flex-wrap gap-1.5">
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold ${k === kind ? "bg-[#7C3AED] text-white" : "bg-[#F1F5F9] text-[#334155]"}`}
              >
                {short(k)}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          rows={4}
          placeholder="The song"
          className="w-full rounded-xl border border-[#D5DEEA] px-3 py-2.5 text-sm text-[#1E3A6E] outline-none focus:border-[#7C3AED]"
        />
        <p className="text-[11px] text-[#5B6B8C]">{text.length}/500</p>
        {clean && (
          <p className="text-[13px] font-bold text-[#B91C1C]">
            In the room: **kamol is singing {kind}, &quot;{clean}&quot; 🎤**
          </p>
        )}
        <button
          type="button"
          disabled={busy || clean.length < 3}
          onClick={() => call({ action: "add", kind, line: text }, "✅ Added")}
          className="w-full rounded-xl bg-[#7C3AED] py-3 text-sm font-black text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "➕ Add song"}
        </button>
        {msg && <p className={`text-sm ${msg.error ? "text-[#B91C1C]" : "text-[#2E7D32]"}`}>{msg.text}</p>}
      </div>
      <p className="mb-2 mt-4 text-[11px] font-extrabold tracking-wide text-[#5B6B8C]">YOUR SONGS · {lines?.length ?? 0}</p>
      {lines === null ? (
        <p className="text-sm text-[#5B6B8C]">Loading…</p>
      ) : lines.length === 0 ? (
        <p className="text-[12.5px] text-[#5B6B8C]">No songs added yet — /sing uses the old songs.</p>
      ) : (
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.id} className={`${card} flex items-center gap-2`}>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold text-[#7C3AED]">{short(l.kind)}</span>
                <span className="block text-sm text-[#1E3A6E]">{l.line}</span>
              </span>
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
