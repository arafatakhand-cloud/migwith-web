import { useEffect, useState } from "react";
import { arrayRemove, arrayUnion, doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

// 👥 Follow uses the same list as the profile page and the app: users/{uid}.following
// (an array of usernames). One follow system for web and Android.

/** The usernames I follow (live). */
export function useFollowing(uid: string | undefined): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!uid) {
      setNames([]);
      return;
    }
    return onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        const list = snap.get("following") as unknown[] | undefined;
        setNames(Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : []);
      },
      () => setNames([])
    );
  }, [uid]);
  return names;
}

/** Follow or unfollow one username. Changes only that name, like the profile page. */
export async function setFollowing(uid: string, username: string, follow: boolean): Promise<void> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const current = ((snap.get("following") as unknown[]) || []).filter((v): v is string => typeof v === "string");
  const matches = current.filter((n) => n.trim().toLowerCase() === username.trim().toLowerCase());
  if (follow) {
    if (matches.length === 0) await updateDoc(ref, { following: arrayUnion(username) });
  } else if (matches.length > 0) {
    await updateDoc(ref, { following: arrayRemove(...matches) });
  }
}
