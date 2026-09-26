"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";

// Same deterministic id the app uses for a 1:1 chat, whoever opened it first.
export function privateChatId(a: string, b: string): string {
  return [a.trim().toLowerCase(), b.trim().toLowerCase()].sort().join("__");
}

export function chatHref(username: string): string {
  return `/chat/${encodeURIComponent(username)}`;
}

// "Online" if the person was active in the last 2 minutes, else "Last seen …".
export function lastSeenLabel(lastActiveMs: number): string {
  if (!lastActiveMs) return "";
  const minutes = Math.floor((Date.now() - lastActiveMs) / 60_000);
  if (minutes < 2) return "Online";
  if (minutes < 60) return `Last seen ${minutes}m ago`;
  if (minutes < 1440) return `Last seen ${Math.floor(minutes / 60)}h ago`;
  return `Last seen ${Math.floor(minutes / 1440)}d ago`;
}

// Friends = accepted friend requests in either direction.
export function useFriends(username: string) {
  const [fromMe, setFromMe] = useState<string[]>([]);
  const [toMe, setToMe] = useState<string[]>([]);

  useEffect(() => {
    if (!username) return;
    const col = collection(db, "friend_requests");
    const offFrom = onSnapshot(
      query(col, where("fromUsername", "==", username), where("status", "==", "accepted")),
      (snap) => setFromMe(snap.docs.map((d) => String(d.get("toUsername") || "").trim()).filter(Boolean))
    );
    const offTo = onSnapshot(
      query(col, where("toUsername", "==", username), where("status", "==", "accepted")),
      (snap) => setToMe(snap.docs.map((d) => String(d.get("fromUsername") || "").trim()).filter(Boolean))
    );
    return () => {
      offFrom();
      offTo();
    };
  }, [username]);

  return Array.from(new Set([...fromMe, ...toMe])).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
}

// Unread private messages sent to me, counted per sender.
export function useUnreadBySender(username: string) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!username) return;
    return onSnapshot(
      query(
        collection(db, "private_messages"),
        where("toUsername", "==", username),
        where("read", "==", false)
      ),
      (snap) => {
        const next: Record<string, number> = {};
        snap.docs.forEach((d) => {
          const from = String(d.get("fromUsername") || "");
          if (from) next[from] = (next[from] || 0) + 1;
        });
        setCounts(next);
      },
      (err) => console.error("unread listener failed", err)
    );
  }, [username]);

  return counts;
}
