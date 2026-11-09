"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { blogCall, blogError } from "../../lib/feed";

// 👥 Who reacted: everyone who reacted to a post, with their reaction, newest first.
// Tabs filter by reaction (All, then each emoji that is used).
export function ReactorsSheet({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [list, setList] = useState<{ username: string; type: string }[] | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("all");
  useEffect(() => {
    blogCall("reactors", { postId })
      .then((r) => setList((r.reactors as { username: string; type: string }[]) || []))
      .catch((e) => setErr(blogError(e)));
  }, [postId]);
  const kinds = useMemo(() => [...new Set((list || []).map((r) => r.type))], [list]);
  const shown = (list || []).filter((r) => tab === "all" || r.type === tab);
  if (typeof document === "undefined") return null;
  // on <body>, above the Mig sheet (z-70): a sheet inside a moved/animated box
  // would be placed relative to that box instead of the screen
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-[24px] bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-black text-[#1E1B4B]">Reactions · {list ? list.length : "…"}</h3>
          <button type="button" onClick={onClose} className="text-[#8494B2]" aria-label="Close">✕</button>
        </div>
        {list && list.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {["all", ...kinds].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-extrabold ${tab === k ? "bg-[#1D4ED8] text-white" : "bg-[#F1F4FB] text-[#4F46E5]"}`}
              >
                {k === "all" ? `All ${list.length}` : `${k} ${list.filter((r) => r.type === k).length}`}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex-1 overflow-y-auto">
          {err && <p className="text-[13px] text-[#B91C1C]">{err}</p>}
          {list === null && !err && <p className="text-[13px] text-[#6B6F9A]">Loading…</p>}
          {list && list.length === 0 && <p className="py-6 text-center text-[13px] text-[#6B6F9A]">No reactions yet.</p>}
          {shown.map((r, i) => (
            <div key={`${r.username}-${i}`} className="flex items-center gap-3 border-b border-[#EEF2FA] py-2.5 last:border-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#38BDF8] to-[#6366F1] text-[13px] font-bold text-white">
                {r.username.slice(0, 1).toUpperCase()}
              </span>
              <Link href={`/profile/${encodeURIComponent(r.username)}`} className="min-w-0 flex-1 truncate text-[14px] font-bold text-[#1E1B4B]">
                {r.username}
              </Link>
              <span className="text-[18px]">{r.type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
