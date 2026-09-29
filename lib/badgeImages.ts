"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { BADGE_EMOJI_TO_KEY } from "./rooms";

// Live app_settings/badge_images, as {badge emoji: uploaded picture URL}, like
// the app's rememberBadgeImageUrls: the room enter/left lines show miglife's
// uploaded picture in place of a Color Shop / role badge emoji.
export function useBadgeImages(enabled: boolean): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
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
        setUrls(out);
      },
      () => {}
    );
  }, [enabled]);
  return urls;
}
