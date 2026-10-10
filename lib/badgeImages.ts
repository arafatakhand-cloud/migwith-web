"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { BADGE_EMOJI_TO_KEY } from "./rooms";

// The last known picture lists are kept in this browser, so a room shows the
// badge pictures right away (no emoji → picture swap a moment later), and
// every picture is fetched as soon as the list is known (all together, not
// one by one when each line draws).
function readCache(key: string): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}
function writeCache(key: string, v: Record<string, string>) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // storage full or blocked
  }
}
const preloaded = new Set<string>();
/** Starts loading every picture now (the browser keeps them for the <img>s). */
export function preloadImages(urls: Iterable<string>) {
  if (typeof window === "undefined") return;
  for (const u of urls) {
    if (!u || preloaded.has(u)) continue;
    preloaded.add(u);
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.decoding = "async";
    img.src = u;
  }
}

const BADGE_CACHE = "migwith.badgeImages";
const LEVEL_BADGE_CACHE = "migwith.levelBadgeImages";

// Live app_settings/badge_images, as {badge emoji: uploaded picture URL}, like
// the app's rememberBadgeImageUrls: the room enter/left lines show miglife's
// uploaded picture in place of a Color Shop / role badge emoji.
export function useBadgeImages(enabled: boolean): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  // The list kept in this browser first (right after the first paint), then the live one.
  useEffect(() => {
    const c = readCache(BADGE_CACHE);
    if (Object.keys(c).length === 0) return;
    preloadImages(Object.values(c));
    setUrls((cur) => (Object.keys(cur).length ? cur : c));
  }, []);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, "app_settings", "badge_images"),
      (snap) => {
        const out: Record<string, string> = {};
        for (const [emoji, key] of BADGE_EMOJI_TO_KEY) {
          const url = snap.get(key);
          if (typeof url === "string" && url.trim()) out[emoji] = url;
        }
        preloadImages(Object.values(out));
        writeCache(BADGE_CACHE, out);
        setUrls(out);
      },
      () => {}
    );
  }, [enabled]);
  return urls;
}

// Live app_settings/level_badge_images, as {tier name ("Silver", "Gold" …):
// uploaded picture URL}, like the app's rememberLevelBadgeImageUrls. Keyed by
// the tier's name, since a tier's emoji can also be a Color Shop badge's.
export function useLevelBadgeImages(enabled: boolean): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  // The list kept in this browser first (right after the first paint), then the live one.
  useEffect(() => {
    const c = readCache(LEVEL_BADGE_CACHE);
    if (Object.keys(c).length === 0) return;
    preloadImages(Object.values(c));
    setUrls((cur) => (Object.keys(cur).length ? cur : c));
  }, []);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, "app_settings", "level_badge_images"),
      (snap) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(snap.data() || {})) if (typeof v === "string" && v.trim()) out[k] = v;
        preloadImages(Object.values(out));
        writeCache(LEVEL_BADGE_CACHE, out);
        setUrls(out);
      },
      () => {}
    );
  }, [enabled]);
  return urls;
}
