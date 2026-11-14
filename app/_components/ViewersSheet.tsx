"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { blogAgoBn, blogCall, blogError } from "../../lib/feed";

// 👁 Who saw my post (only the writer): newest first, with the reaction they gave.
export function ViewersSheet({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [list, setList] = useState<{ name: string; emoji: string; atMs: number }[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    blogCall("postViewers", { postId })
      .then((r) => setList((r.viewers as { name: string; emoji: string; atMs: number }[]) || []))
      .catch((e) => setErr(blogError(e)));
  }, [postId]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-[24px] bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-black text-[#1E1B4B]">👁 Seen by · {list ? list.length : "…"}</h3>
          <button type="button" onClick={onClose} className="text-[#8494B2]" aria-label="Close">✕</button>
        </div>
        <div className="mt-3 flex-1 overflow-y-auto">
          {err && <p className="text-[13px] text-[#B91C1C]">{err}</p>}
          {list === null && !err && <p className="text-[13px] text-[#6B6F9A]">Loading…</p>}
          {list && list.length === 0 && <p className="py-6 text-center text-[13px] text-[#6B6F9A]">No one has seen it yet.</p>}
          {(list || []).map((r, i) => (
            <div key={`${r.name}-${i}`} className="flex items-center gap-3 border-b border-[#EEF2FA] py-2.5 last:border-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#38BDF8] to-[#6366F1] text-[13px] font-bold text-white">
                {r.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <Link href={`/profile/${encodeURIComponent(r.name)}`} className="block truncate text-[14px] font-bold text-[#1E1B4B]">
                  {r.name}
                </Link>
                {r.atMs > 0 && <span className="block text-[11.5px] text-[#6B6F9A]">{blogAgoBn(r.atMs)}</span>}
              </span>
              {r.emoji && <span className="text-[18px]">{r.emoji}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
