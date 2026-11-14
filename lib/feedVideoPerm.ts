"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { isMainFounderName } from "./founder";
import { presenceBadgesForDoc } from "./rooms";
import { shareAllowed, shareKeysOf, videoMaxSecondsOf, type ShareTable } from "./sharePerms";

// 📰🎬 Feed videos: only people the Share Permissions "Feed" column allows
// (the server checks again). Also gives miglife's longest-video limit.
export function useFeedVideoAllowed(uid?: string | null, username?: string | null): { allowed: boolean; maxSeconds: number } {
  const [out, setOut] = useState({ allowed: false, maxSeconds: 60 });
  useEffect(() => {
    if (!uid) return;
    let gone = false;
    Promise.all([
      getDoc(doc(db, "app_settings", "media_sharing_permissions")),
      getDoc(doc(db, "users", uid)),
      // 👑 founders (miglife secret → Founders) may always share videos
      getDoc(doc(db, "founders", uid)).then((f) => f.exists()).catch(() => false),
    ])
      .then(([t, u, isFounder]) => {
        if (gone) return;
        const table = (t.data() as ShareTable) || {};
        const keys = shareKeysOf(presenceBadgesForDoc(u.data() || {}));
        setOut({
          allowed: isMainFounderName(username || String(u.data()?.username || "")) || isFounder || shareAllowed(table, keys, "feedVideo"),
          maxSeconds: videoMaxSecondsOf(table),
        });
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [uid, username]);
  return out;
}
