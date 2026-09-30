"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";

// /gift recipient list, like the app: as soon as "/gift" is typed, everyone in
// the room is listed under the top bar, one per row with their round photo
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
    <div className="absolute inset-x-0 top-0 z-30 max-h-[380px] overflow-y-auto bg-white shadow-lg" data-notranslate>
      {cmd === "/gift" && !queryText && (
        <button
          type="button"
          onClick={() => onPick("/gift all ")}
          className="flex w-full items-center gap-3 bg-[#FFF1F8] px-3 py-2 text-left"
        >
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#FF2D95] text-lg">🎁</span>
          <span>
            <span className="block text-lg leading-6 text-[#C2185B]">Everyone</span>
            <span className="block text-sm text-[#8A5A75]">Gift Shower: /gift all</span>
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
            className="flex w-full items-center gap-3 px-3 py-[7px] text-left hover:bg-[#F1F5FB]"
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="h-[34px] w-[34px] shrink-0 rounded-full border border-[#E0E4EA] object-cover" />
            ) : (
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-[#E0E4EA] bg-[#DCE8F7] font-bold text-[#0B1F3A]">
                {name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="truncate text-lg text-[#0B1F3A]">{name}</span>
          </button>
        );
      })}
    </div>
  );
}
