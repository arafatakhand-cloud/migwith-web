"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";

// 🎉 The newest announcement, shown once per visit after login (like the app's
// popup when it opens). Closes only through Dismiss / View. Same look as the
// app's Glass popup: a clear glass card, a blue glass header, 3D buttons.

const KEY = "migwith.announcementShown";
// A line that starts with an emoji / symbol stands out (like the Announcements page).
const EMOJI_START = /^[^\p{L}\p{N}\s"'(—–-]/u;

export function AnnouncementPopup({ username, onDone }: { username: string; onDone: () => void }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    const key = `${KEY}.${username.toLowerCase()}`;
    try {
      if (sessionStorage.getItem(key)) return onDone();
    } catch {
      // storage blocked — still show it
    }
    let alive = true;
    getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(1)))
      .then((snap) => {
        if (!alive) return;
        const text = String(snap.docs[0]?.get("message") || "").trim();
        try {
          sessionStorage.setItem(key, "1");
        } catch {}
        if (text) setMessage(text);
        else onDone();
      })
      .catch(() => alive && onDone());
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  if (message == null || typeof document === "undefined") return null;
  const close = () => {
    setMessage(null);
    onDone();
  };
  const lines = message.split("\n");

  return createPortal(
    <div className="fixed inset-0 z-[94] flex items-center justify-center bg-[#0B1F3A]/25 p-7" style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-[30px] border-[1.5px] border-white/95 shadow-[0_18px_44px_rgba(40,80,160,.35)]"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,.78), rgba(234,243,255,.66), rgba(252,239,247,.7))",
          backdropFilter: "blur(16px) saturate(1.4)",
          WebkitBackdropFilter: "blur(16px) saturate(1.4)",
        }}
      >
        {/* header band */}
        <div
          className="relative flex flex-col items-center pb-3.5 pt-[18px]"
          style={{ background: "linear-gradient(180deg, rgba(90,162,255,.94), rgba(21,101,216,.94))" }}
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-full border-[1.5px] border-white/90 bg-white/20 text-2xl">
            <span className="inline-block -scale-x-100">📢</span>
          </span>
          <p className="relative mt-2 text-base font-extrabold tracking-[1.2px] text-white">🎉 ANNOUNCEMENT 🎉</p>
          <span className="relative mt-2 h-[3px] w-11 rounded bg-white/80" />
        </div>

        {/* the message (scrolls when long) */}
        <div className="mx-3.5 my-3.5 max-h-[260px] overflow-y-auto rounded-[20px] border-[1.5px] border-white bg-white/60 px-3.5 py-3">
          <p className="whitespace-pre-wrap break-words text-sm leading-[21px] text-[#1E293B]">
            {lines.map((ln, i) => (
              <span
                key={i}
                className={
                  i === 0 ? "font-black text-[#1565D8]" : EMOJI_START.test(ln.trim()) ? "font-extrabold text-[#0E7490]" : undefined
                }
              >
                {ln}
                {i < lines.length - 1 ? "\n" : ""}
              </span>
            ))}
          </p>
        </div>

        {/* buttons */}
        <div className="flex gap-2.5 px-3.5 pb-4">
          <button
            type="button"
            onClick={close}
            className="h-11 flex-1 rounded-full border-[1.5px] border-white text-sm font-bold text-[#1565D8]"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,.8), rgba(255,255,255,.45))" }}
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              router.push("/announcements");
            }}
            className="h-11 flex-1 rounded-full border-[1.5px] border-white/85 text-sm font-black text-white shadow-[0_6px_14px_rgba(21,101,216,.4)]"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,.35), transparent 45%), linear-gradient(180deg, #5aa2ff, #1565d8)" }}
          >
            View
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
