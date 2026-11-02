"use client";

import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "./firebase";

// ✍️ "is typing" for private chats. Each person writes ONE small doc per chat
// (private_typing/{chatId}__{uid}) while they type — at most every 2 s. The other
// person shows three bouncing dots for 3 s after the last write. Sending clears it.

const WRITE_GAP_MS = 2_000;
const SHOW_MS = 3_000;
let lastWrite = 0;

export function markTyping(chatId: string, uid: string, username: string) {
  if (!chatId || !uid) return;
  const now = Date.now();
  if (now - lastWrite < WRITE_GAP_MS) return;
  lastWrite = now;
  setDoc(doc(db, "private_typing", `${chatId}__${uid}`), {
    chatId,
    uid,
    username: username.toLowerCase(),
    at: serverTimestamp(),
  }).catch(() => {});
}

export function clearTyping(chatId: string, uid: string) {
  if (!chatId || !uid) return;
  lastWrite = 0;
  deleteDoc(doc(db, "private_typing", `${chatId}__${uid}`)).catch(() => {});
}

/** Calls back with true while the OTHER person is typing in this chat. */
export function watchPartnerTyping(chatId: string, me: string, cb: (typing: boolean) => void) {
  let docs: { uid: string; at: number }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const check = () => {
    const now = Date.now();
    const typing = docs.some((d) => d.uid !== me && d.at > now - SHOW_MS);
    cb(typing);
    if (timer) clearTimeout(timer);
    // look again when the newest "typing" stops counting
    const nextAt = Math.min(...docs.filter((d) => d.uid !== me && d.at > now - SHOW_MS).map((d) => d.at + SHOW_MS));
    if (Number.isFinite(nextAt)) timer = setTimeout(check, Math.max(0, nextAt - Date.now()) + 50);
  };
  const off = onSnapshot(query(collection(db, "private_typing"), where("chatId", "==", chatId)), (snap) => {
    docs = snap.docs.map((d) => ({ uid: String(d.get("uid") || ""), at: Number(d.get("at")?.toMillis?.() || Date.now()) }));
    check();
  });
  return () => {
    if (timer) clearTimeout(timer);
    off();
  };
}
