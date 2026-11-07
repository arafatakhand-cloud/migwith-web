import { useEffect, useState } from "react";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

// 👥 One-way follow. The server (setFollow) writes follows/<follower>__<followee>;
// anyone signed in can read them, so counts and the Following tab work.
const setFollowFn = httpsCallable<{ username: string; follow: boolean }, { ok: boolean; following: boolean }>(functions, "setFollow");

/** Names this user follows (live). */
export function useFollowing(username: string): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!username) {
      setNames([]);
      return;
    }
    return onSnapshot(
      query(collection(db, "follows"), where("follower", "==", username)),
      (snap) => setNames(snap.docs.map((d) => String(d.get("followee") || "")).filter(Boolean)),
      () => setNames([])
    );
  }, [username]);
  return names;
}

/** How many members follow this one. */
export async function followerCount(username: string): Promise<number> {
  const snap = await getDocs(query(collection(db, "follows"), where("followee", "==", username)));
  return snap.size;
}

export async function setFollowing(username: string, follow: boolean): Promise<boolean> {
  const r = await setFollowFn({ username, follow });
  return r.data.following;
}
