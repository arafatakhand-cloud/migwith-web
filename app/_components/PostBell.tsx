"use client";

import { useEffect, useState } from "react";
import { blogCall, blogError } from "../../lib/feed";

// 🔔 Feed post bell on a friend's profile: get a notification when they post a
// new Mig. "all" = every post, "media" = only photo / video posts, "off" = none.
// The server sends it (grouped, quiet at night, a few a day: Settings › Notifications).
export type BellMode = "all" | "media" | "off";
const OPTIONS: [BellMode, string, string][] = [
  ["all", "🔔 All new posts", "Tell me whenever they post"],
  ["media", "⭐ Photos & videos only", "Text-only posts are skipped"],
  ["off", "🔕 Off", "See them in the Feed, no notification"],
];

export function PostBellButton({ username, classic }: { username: string; classic: boolean }) {
  const [mode, setMode] = useState<BellMode | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    blogCall("bellGet", { author: username })
      .then((r) => live && setMode((String((r as { mode?: string }).mode || "off") as BellMode)))
      .catch(() => live && setMode("off"));
    return () => {
      live = false;
    };
  }, [username]);

  const pick = async (m: BellMode) => {
    setOpen(false);
    if (m === mode) return;
    const before = mode;
    setMode(m);
    setBusy(true);
    try {
      const r = await blogCall("bell", { author: username, mode: m });
      setMode(String((r as { mode?: string }).mode || m) as BellMode);
    } catch (e) {
      setMode(before);
      alert(blogError(e));
    } finally {
      setBusy(false);
    }
  };

  if (mode === null) return null;
  const on = mode !== "off";
  return (
    <div className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        aria-label={on ? "Post notifications on" : "Post notifications off"}
        title="Notify me about new posts"
        className={`flex h-[38px] w-[38px] items-center justify-center rounded-lg text-[17px] disabled:opacity-60 ${
          on ? "bg-gradient-to-b from-[#FFC94D] to-[#F5A300] shadow-[0_3px_0_#B97A00]" : classic ? "bg-[#F4F6F9]" : "bg-[#6A6A6A]"
        }`}
      >
        {mode === "media" ? "⭐" : on ? "🔔" : "🔕"}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 top-full z-40 mt-1 w-64 -translate-x-1/2 overflow-hidden rounded-xl bg-white p-1 shadow-xl ring-1 ring-black/10">
            <p className="px-3 pb-1 pt-2 text-[12px] font-semibold text-[#6B819C]">New posts from {username}</p>
            {OPTIONS.map(([m, label, sub]) => (
              <button
                key={m}
                type="button"
                onClick={() => pick(m)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left ${m === mode ? "bg-[#FFF6DD]" : "hover:bg-[#F1F5FB]"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-bold text-[#0B2A5B]">{label}</span>
                  <span className="block text-[12px] text-[#6B819C]">{sub}</span>
                </span>
                {m === mode && <span className="text-[#F5A300]">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
