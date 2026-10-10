"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";

// /gift recipient list: as soon as "/gift" is typed, everyone in the room is
// listed in a half-width card on the left of the chat (the rest of the chat
// stays in view), one compact row each with their round photo (or a colored letter)
// and ID. Typing part of a name narrows it; tapping a name fills in
// "/gift <name> ". The first row, "Everyone", starts a Gift Shower.
// The same list opens for /f, /fr (friend request) and /uf (unfriend).

const photos = new Map<string, string>();

function photoOf(d: Record<string, unknown>): string {
  for (const k of ["photoUrl", "profilePic", "avatarUrl", "imageUrl"]) {
    const v = String(d[k] || "").trim();
    if (v) return v;
  }
  return "";
}

// Colored letter circles for people without a photo (same color for a name every time).
const LETTER_BG = [
  ["#FF8A65", "#F4511E"],
  ["#4FC3F7", "#0288D1"],
  ["#81C784", "#388E3C"],
  ["#BA68C8", "#7B1FA2"],
  ["#FFD54F", "#F9A825"],
  ["#F06292", "#C2185B"],
  ["#4DB6AC", "#00796B"],
  ["#7986CB", "#303F9F"],
];
function letterBg(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const [a, b] = LETTER_BG[h % LETTER_BG.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

const TITLES: Record<string, string> = {
  "/gift": "🎁 Send a gift to…",
  "/fr": "👋 Send a friend request to…",
  "/f": "👋 Send a friend request to…",
  "/uf": "💔 Unfriend…",
};

export type PickerQuery = { cmd: string; q: string };

/** The names to list for this text, or null when it isn't "/gift|/fr|/uf|/f [part-of-a-name]". */
export function giftPickerQuery(text: string): PickerQuery | null {
  const t = text.trimStart();
  const m = /^(\/gift|\/fr|\/uf|\/f)(\s|$)/i.exec(t);
  if (!m) return null;
  const q = t.slice(m[1].length).trimStart();
  return /\s/.test(q) ? null : { cmd: m[1].toLowerCase(), q };
}

export function GiftNamePicker({
  queryText,
  cmd = "/gift",
  names,
  onPick,
}: {
  queryText: string;
  /** The command the picked name is put after. */
  cmd?: string;
  /** Everyone in the room except me. */
  names: string[];
  onPick: (text: string) => void;
}) {
  const [, setTick] = useState(0);
  const q = queryText.toLowerCase();
  const list = names.filter((n) => n.toLowerCase().startsWith(q));
  const key = list.join(",");

  // Round photos of the people listed (10 names per query), kept for the visit.
  useEffect(() => {
    const missing = list.filter((n) => !photos.has(n));
    if (missing.length === 0) return;
    missing.forEach((n) => photos.set(n, ""));
    let cancelled = false;
    (async () => {
      for (let i = 0; i < missing.length; i += 10) {
        const chunk = missing.slice(i, i + 10);
        try {
          const snap = await getDocs(query(collection(db, "users"), where("username", "in", chunk)));
          snap.docs.forEach((d) => photos.set(String(d.get("username") || ""), photoOf(d.data())));
        } catch {
          // no photo: the first letter is shown
        }
      }
      if (!cancelled) setTick((t) => t + 1);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (list.length === 0) return null;

  return (
    <div
      className="absolute left-2 top-2 z-30 flex max-h-[65%] w-[52%] min-w-[175px] max-w-[300px] flex-col overflow-hidden rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_10px_30px_-8px_rgba(11,31,58,.35)]"
      data-notranslate
    >
      <div className="flex items-center justify-between border-b px-2.5 border-[#EEF2F7] bg-gradient-to-r from-[#F5F8FD] to-[#FDF3F9] py-2">
        <span className="min-w-0 truncate text-[12px] font-extrabold text-[#0B1F3A]">{TITLES[cmd] || "Pick a name…"}</span>
        <span className="ml-1.5 shrink-0 rounded-full bg-[#E8EEF8] px-1.5 py-0.5 text-[10px] font-bold text-[#4A5A78]">{list.length}</span>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain py-1">
        {cmd === "/gift" && !queryText && (
          <button
            type="button"
            onClick={() => onPick("/gift all ")}
            className="mx-1.5 mb-1 flex w-[calc(100%-12px)] items-center gap-2 rounded-xl bg-gradient-to-r from-[#FFE3F1] to-[#FFF4E5] px-2.5 py-1.5 text-left active:scale-[.99]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FF5FA8] to-[#FF2D95] text-lg shadow-sm">
              🎁
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold leading-5 text-[#C2185B]">Everyone</span>
              <span className="block truncate text-[10.5px] text-[#8A5A75]">Gift Shower · /gift all</span>
            </span>
          </button>
        )}
        {list.map((name) => {
          const photo = photos.get(name) || "";
          return (
            <button
              key={name}
              type="button"
              onClick={() => onPick(`${cmd} ${name} `)}
              className="flex w-full items-center gap-2 px-2.5 py-[5px] text-left hover:bg-[#F3F7FC] active:bg-[#EAF1FB]"
            >
              <span className="shrink-0 rounded-full bg-gradient-to-br from-[#FF9D2E] via-[#FF4F9A] to-[#7B4DE0] p-[2px]">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="h-[30px] w-[30px] rounded-full border-2 border-white object-cover" />
                ) : (
                  <span
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-white text-[13px] font-extrabold text-white"
                    style={{ background: letterBg(name) }}
                  >
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#0B1F3A]">{name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
