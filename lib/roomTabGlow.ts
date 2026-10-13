"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";

// TAB HEADLIGHT (the app's glowingRoomTabs): an open room tab glows red ⇄ green
// when ANYTHING happens there (a message, someone entering / leaving, bot or
// game lines, gifts …) while you're on another tab, until you open that tab.
// Your own lines never light it.

const seenKey = (uid: string, room: string) => `migwith.roomSeen.${uid}.${room}`;
const EVENT = "migwith-room-seen";

function readSeen(uid: string, room: string): number {
  try {
    return Number(localStorage.getItem(seenKey(uid, room)) || 0);
  } catch {
    return 0;
  }
}

/** The room on screen: everything in it so far counts as seen. */
export function markRoomSeen(uid: string, room: string) {
  try {
    localStorage.setItem(seenKey(uid, room), String(Date.now()));
  } catch {
    // storage blocked
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Open room tabs (not the one on screen) with something new in them. */
export function useGlowingRoomTabs(uid: string | undefined, rooms: string[], current: string | null): Set<string> {
  const [latest, setLatest] = useState<Record<string, number>>({});
  const [, setTick] = useState(0);
  const key = rooms.join("|");

  useEffect(() => {
    if (!uid) return;
    const offs = rooms.map((room) =>
      onSnapshot(
        query(collection(db, "room_messages", room, "messages"), orderBy("createdAt", "desc"), limit(1)),
        (snap) => {
          const d = snap.docs[0];
          if (!d || d.metadata.hasPendingWrites) return;
          if (String(d.get("senderUid") || "") === uid) return; // my own line
          const at = d.get("createdAt")?.toMillis?.() || 0;
          setLatest((m) => (m[room] === at ? m : { ...m, [room]: at }));
        },
        () => {}
      )
    );
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key]);

  // the room on screen stays "seen" while it is open
  useEffect(() => {
    if (!uid || !current) return;
    markRoomSeen(uid, current);
    const t = setInterval(() => markRoomSeen(uid, current), 5_000);
    return () => {
      markRoomSeen(uid, current);
      clearInterval(t);
    };
  }, [uid, current, latest]);

  useEffect(() => {
    const re = () => setTick((n) => n + 1);
    window.addEventListener(EVENT, re);
    return () => window.removeEventListener(EVENT, re);
  }, []);

  const out = new Set<string>();
  if (!uid) return out;
  for (const room of rooms) {
    if (room === current) continue;
    const at = latest[room] || 0;
    if (at > 0 && at > readSeen(uid, room)) out.add(room);
  }
  return out;
}
