"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

// 🎨 Sticker Store (miglife: "like the video"). Packs live in sticker_packs/;
// the packs someone owns (forever) in users/{uid}/sticker_packs/ — both are
// written only by the server (getStickerPack / founderStickerPack).

export type Sticker = { id: string; url: string };
export type StickerPack = {
  id: string;
  name: string;
  category: string;
  price: number; // coins, 0 = free
  active: boolean;
  sortOrder: number;
  stickers: Sticker[];
  cover: string;
};
export type PickedSticker = { url: string; packId: string };

const toPack = (id: string, d: Record<string, unknown>): StickerPack => ({
  id,
  name: String(d.name || "Sticker pack"),
  category: String(d.category || ""),
  price: Math.max(0, Math.floor(Number(d.price) || 0)),
  active: d.active !== false,
  sortOrder: Number(d.sortOrder) || 0,
  stickers: (Array.isArray(d.stickers) ? d.stickers : [])
    .map((s: any) => ({ id: String(s?.id || ""), url: String(s?.url || "") }))
    .filter((s) => s.url),
  cover: String(d.cover || ""),
});

/** Every sticker pack (founder: also the switched-off ones). */
export function useStickerPacks(includeOff = false): StickerPack[] | null {
  const [packs, setPacks] = useState<StickerPack[] | null>(null);
  useEffect(
    () =>
      onSnapshot(
        collection(db, "sticker_packs"),
        (snap) =>
          setPacks(
            snap.docs
              .map((d) => toPack(d.id, d.data()))
              .filter((p) => includeOff || (p.active && p.stickers.length > 0))
              .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
          ),
        () => setPacks([])
      ),
    [includeOff]
  );
  return packs;
}

/** The ids of the packs this person owns. */
export function useOwnedStickerPacks(uid: string | undefined): Set<string> | null {
  const [owned, setOwned] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      collection(db, "users", uid, "sticker_packs"),
      (snap) => setOwned(new Set(snap.docs.map((d) => d.id))),
      () => setOwned(new Set())
    );
  }, [uid]);
  return owned;
}

const getPackCall = httpsCallable<{ packId: string; operationId: string }, { ok?: boolean; balance?: number; already?: boolean }>(
  functions,
  "getStickerPack"
);
/** Claim a free pack / buy a paid one (owned forever). */
export async function getStickerPack(packId: string) {
  const { data } = await getPackCall({ packId, operationId: crypto.randomUUID().replace(/-/g, "") });
  return data;
}

export const founderStickerPack = httpsCallable<Record<string, unknown>, { ok?: boolean; packId?: string; made?: string[]; url?: string }>(
  functions,
  "founderStickerPack"
);

// 🕘 the last stickers I sent (this browser)
const RECENT_KEY = "migwith.recentStickers";
export function readRecentStickers(): PickedSticker[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((s) => s && typeof s.url === "string" && typeof s.packId === "string").slice(0, 24) : [];
  } catch {
    return [];
  }
}
export function rememberRecentSticker(s: PickedSticker) {
  try {
    const next = [s, ...readRecentStickers().filter((x) => x.url !== s.url)].slice(0, 24);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage blocked
  }
}

export const formatStickerPrice = (n: number) => (n > 0 ? n.toLocaleString("en-US") : "Free");
