"use client";

import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { privateChatId } from "./privateChat";
import { isMainFounderName } from "./founder";

// 🔒 Privacy: private chat is for friends only; a locked profile
// (Settings › Privacy › Profile lock) is shown only to friends.

export async function areFriends(me: string, other: string): Promise<boolean> {
  const col = collection(db, "friend_requests");
  const [a, b] = await Promise.all([
    getDocs(query(col, where("fromUsername", "==", me), where("toUsername", "==", other), where("status", "==", "accepted"), limit(1))),
    getDocs(query(col, where("fromUsername", "==", other), where("toUsername", "==", me), where("status", "==", "accepted"), limit(1))),
  ]);
  return !a.empty || !b.empty;
}

/** True when [me] may NOT open a private chat with [target]. Private chat is
 * for FRIENDS only (for everyone). miglife may write to anyone, and someone
 * miglife wrote to may answer. Same markers the Firestore rules check
 * (friendships, chat_spoke — kept by the functions), so page and server agree. */
export async function chatLockedFor(me: string, target: string): Promise<boolean> {
  const m = me.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  if (!m || !t || m === t || isMainFounderName(m)) return false;
  try {
    const pair = privateChatId(m, t);
    const [friends, spoke] = await Promise.all([
      getDoc(doc(db, "friendships", pair)),
      isMainFounderName(t) ? getDoc(doc(db, "chat_spoke", `${pair}__${t}`)) : null,
    ]);
    return !friends.exists() && !spoke?.exists();
  } catch {
    // can't check → keep it closed
    return true;
  }
}

export const lockedChatText = (name: string) => `🔒 Only friends can send private messages. Add ${name} as a friend first.`;
