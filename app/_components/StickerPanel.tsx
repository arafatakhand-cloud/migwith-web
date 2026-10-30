"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { auth } from "../../lib/firebase";
import { StickerImg } from "./StickerImg";
import {
  readRecentStickers,
  rememberRecentSticker,
  useOwnedStickerPacks,
  useStickerPacks,
  type PickedSticker,
} from "../../lib/stickers";

// 🎨 The Stickers tab of the emoji panel (like the video): the stickers of the
// packs I own in a grid, the packs as a row of covers at the bottom — 🕘 my
// recent stickers first, ➕ opens the Sticker Store. A tap sends the sticker.

export function StickerPanel({ onPick, docked = false }: { onPick: (s: PickedSticker) => void; docked?: boolean }) {
  const packs = useStickerPacks();
  const owned = useOwnedStickerPacks(auth.currentUser?.uid);
  const mine = useMemo(() => (packs && owned ? packs.filter((p) => owned.has(p.id)) : []), [packs, owned]);
  const [tab, setTab] = useState<string>("recent");
  const [recent, setRecent] = useState<PickedSticker[]>(() => readRecentStickers());
  const current = tab === "recent" ? null : mine.find((p) => p.id === tab) || null;
  // 🕘 only the recent ones from packs I (still) own
  const recentShown = recent.filter((s) => owned?.has(s.packId));
  const showRecent = tab === "recent" && recentShown.length > 0;
  const shown = showRecent ? recentShown : (current || mine[0])?.stickers.map((s) => ({ url: s.url, packId: (current || mine[0])!.id })) || [];
  const activeTab = showRecent ? "recent" : (current || mine[0])?.id || "";

  const pick = (s: PickedSticker) => {
    rememberRecentSticker(s);
    setRecent(readRecentStickers());
    onPick(s);
  };

  return (
    <div
      className={`flex flex-col overflow-hidden bg-white ${docked ? "h-[260px]" : "h-[300px] rounded-2xl border border-[#D5E3F5] shadow-xl"}`}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {packs === null || owned === null ? (
          <p className="py-10 text-center text-sm text-[#7A8599]">Loading…</p>
        ) : mine.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-[14px] font-semibold text-[#3D4A60]">No sticker packs yet</p>
            <Link href="/stickers" className="rounded-full bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] px-5 py-2 text-[14px] font-bold text-white">
              🎨 Open Sticker Store
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {shown.map((s) => (
              <button
                key={s.url}
                type="button"
                onClick={() => pick(s)}
                className="flex aspect-square items-center justify-center rounded-xl p-1 active:scale-95 active:bg-[#EEF3FB]"
              >
                <StickerImg url={s.url} className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        )}
      </div>
      {/* pack row: 🕘 recent · pack covers · ➕ store */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-[#E5ECF6] px-2 py-1.5">
        <button
          type="button"
          onClick={() => setTab("recent")}
          title="Recent"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[18px] ${activeTab === "recent" ? "bg-[#DCEBFB]" : ""}`}
        >
          🕘
        </button>
        {mine.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setTab(p.id)}
            title={p.name}
            className={`h-10 w-10 shrink-0 rounded-xl p-1 ${activeTab === p.id ? "bg-[#DCEBFB] ring-2 ring-[#2F80ED]" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.cover || p.stickers[0]?.url} alt={p.name} className="h-full w-full object-contain" />
          </button>
        ))}
        <Link
          href="/stickers"
          title="Sticker Store"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF3FB] text-[20px] font-bold text-[#2F80ED]"
        >
          ＋
        </Link>
      </div>
    </div>
  );
}
