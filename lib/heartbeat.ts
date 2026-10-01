"use client";

import { useEffect } from "react";
import { deleteField, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

// Online heartbeat, like the app: users/{uid}.lastActiveAt is refreshed every
// 30 s while this tab is open and visible, so friends and profiles show
// "Online" (fresh within 90 s) on every page, not only inside a room.
// Nothing is written for an invisible account (users/{uid}.isInvisible).
export function useOnlineHeartbeat(uid: string | undefined) {
  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, "users", uid);
    let invisible = true; // until the profile says otherwise
    let timer: ReturnType<typeof setInterval> | null = null;
    const beat = () => {
      if (invisible || document.visibilityState !== "visible") return;
      updateDoc(ref, { lastActiveAt: serverTimestamp() }).catch(() => {});
    };
    const off = onSnapshot(
      ref,
      (snap) => {
        const was = invisible;
        invisible = snap.get("isInvisible") === true;
        if (was && !invisible) beat();
      },
      () => {}
    );
    timer = setInterval(beat, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off();
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [uid]);
}

/** Online = a fresh heartbeat (lastActiveAt within 90 s), like the app's friend list. */
export function isOnlineNow(data: { lastActiveAt?: unknown } | undefined): boolean {
  const v = data?.lastActiveAt as { toMillis?: () => number } | number | undefined;
  const ms = typeof v === "number" ? v : typeof v?.toMillis === "function" ? v.toMillis() : 0;
  return ms > 0 && Date.now() - ms < 90_000;
}

/** Logout: offline at once for friends (like the app). Never touches the app's fcmToken. */
export async function markOfflineForLogout(uid: string | undefined) {
  if (!uid) return;
  await updateDoc(doc(db, "users", uid), { lastActiveAt: deleteField(), presenceStatus: "OFFLINE" }).catch(() => {});
}
