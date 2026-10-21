"use client";

import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { privateChatId } from "./privateChat";

// 🔒 Profile lock (Settings › Privacy › Profile lock = users/{uid}.profileLocked):
// only the person's FRIENDS may see their profile or start a private chat with
// them. Someone who is not a friend may still REPLY if the locked person wrote
// to them first (a real message, not just a gift). Your own chat / profile is
// never locked for you.

async function userByName(name: string) {
  const lower = name.trim().toLowerCase();
  let snap = await getDocs(query(collection(db, "users"), where("usernameLower", "==", lower), limit(1)));
  if (snap.empty) snap = await getDocs(query(collection(db, "users"), where("username", "==", name.trim()), limit(1)));
  return snap.docs[0];
}

export async function areFriends(me: string, other: string): Promise<boolean> {
  const col = collection(db, "friend_requests");
  const [a, b] = await Promise.all([
    getDocs(query(col, where("fromUsername", "==", me), where("toUsername", "==", other), where("status", "==", "accepted"), limit(1))),
    getDocs(query(col, where("fromUsername", "==", other), where("toUsername", "==", me), where("status", "==", "accepted"), limit(1))),
  ]);
  return !a.empty || !b.empty;
}

/** True when [target] locked their profile and [me] may not open a chat with them. */
export async function chatLockedFor(me: string, target: string): Promise<boolean> {
  if (!me || !target || me.trim().toLowerCase() === target.trim().toLowerCase()) return false;
  try {
    const t = await userByName(target);
    if (!t || t.get("profileLocked") !== true) return false;
    if (await areFriends(me, String(t.get("username") || target))) return false;
    // they wrote to me first (not a gift line) → I may answer
    const theirs = await getDocs(
      query(collection(db, "private_messages"), where("chatId", "==", privateChatId(me, target)), where("fromUsername", "==", String(t.get("username") || target)), limit(30))
    );
    return !theirs.docs.some((d) => String(d.get("messageType") || "") !== "gift");
  } catch {
    // can't check → keep the person's privacy
    return true;
  }
}

export const lockedChatText = (name: string) => `🔒 ${name} has locked their profile — only their friends can message them.`;
