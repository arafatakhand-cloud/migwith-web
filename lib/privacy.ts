"use client";

import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { privateChatId } from "./privateChat";

// 🔒 Profile lock (Settings › Privacy › Profile lock = users/{uid}.profileLocked):
// only the person's FRIENDS may see their profile or start a private chat with
// them. Someone who is not a friend may still REPLY if the locked person wrote
// to them first (a real message, not just a gift). Your own chat / profile is
// never locked for you.

export async function areFriends(me: string, other: string): Promise<boolean> {
  const col = collection(db, "friend_requests");
  const [a, b] = await Promise.all([
    getDocs(query(col, where("fromUsername", "==", me), where("toUsername", "==", other), where("status", "==", "accepted"), limit(1))),
    getDocs(query(col, where("fromUsername", "==", other), where("toUsername", "==", me), where("status", "==", "accepted"), limit(1))),
  ]);
  return !a.empty || !b.empty;
}

/** True when [target] locked their profile and [me] may not open a chat with them.
 * Same markers the Firestore rules check (profile_locks, friendships, chat_spoke —
 * all kept by the functions), so the page and the server always agree. */
export async function chatLockedFor(me: string, target: string): Promise<boolean> {
  const m = me.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  if (!m || !t || m === t) return false;
  try {
    if (!(await getDoc(doc(db, "profile_locks", t))).exists()) return false;
    const pair = privateChatId(m, t);
    const [friends, spoke] = await Promise.all([getDoc(doc(db, "friendships", pair)), getDoc(doc(db, "chat_spoke", `${pair}__${t}`))]);
    return !friends.exists() && !spoke.exists();
  } catch {
    // can't check → keep the person's privacy
    return true;
  }
}

export const lockedChatText = (name: string) => `🔒 ${name} has locked their profile — only their friends can message them.`;
