"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

// 🎨 Sticker Store (miglife: "like the video"). Packs live in sticker_packs/;
// the packs someone owns (forever) in users/{uid}/sticker_packs/ — both are
// written only by the server (getStickerPack / founderStickerPack).

export type Sticker = { id: string; url: string; motion: StickerMotion };
/** ✨ how a sticker moves ("" = still) — the page animates the PNG. */
export type StickerMotion = "" | "BOUNCE" | "BEAT" | "SWAY" | "POP" | "FLOAT" | "SHAKE" | "WOBBLE";
export const STICKER_MOTIONS: { key: StickerMotion; label: string }[] = [
  { key: "", label: "Still" },
  { key: "BOUNCE", label: "Bounce" },
  { key: "BEAT", label: "Heartbeat" },
  { key: "SWAY", label: "Wave" },
  { key: "POP", label: "Pop" },
  { key: "FLOAT", label: "Float" },
  { key: "SHAKE", label: "Shake" },
  { key: "WOBBLE", label: "Wobble" },
];
const asMotion = (v: unknown): StickerMotion => (STICKER_MOTIONS.some((m) => m.key === v) ? (v as StickerMotion) : "");
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
    .map((s: any) => ({ id: String(s?.id || ""), url: String(s?.url || ""), motion: asMotion(s?.motion) }))
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

// ✨ every sticker's motion by its picture link — one shared listener, so a
// sticker moves the same everywhere (chat, panel, store), old messages too.
let motionMap = new Map<string, StickerMotion>();
const motionSubs = new Set<() => void>();
let motionStop: (() => void) | null = null;
function subscribeMotions(cb: () => void) {
  motionSubs.add(cb);
  if (!motionStop) {
    motionStop = onSnapshot(
      collection(db, "sticker_packs"),
      (snap) => {
        const next = new Map<string, StickerMotion>();
        snap.docs.forEach((d) => toPack(d.id, d.data()).stickers.forEach((s) => s.motion && next.set(s.url, s.motion)));
        motionMap = next;
        motionSubs.forEach((f) => f());
      },
      () => {}
    );
  }
  return () => {
    motionSubs.delete(cb);
  };
}
export function useStickerMotion(url: string): StickerMotion {
  return useSyncExternalStore(subscribeMotions, () => motionMap.get(url) || "", () => "");
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
