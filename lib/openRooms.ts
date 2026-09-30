"use client";

import { useEffect, useState } from "react";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { leaveDocId, presenceLine, presenceBadgesForDoc } from "./rooms";
import { dropRoomSession } from "./roomSession";

// Rooms you are in, shown as tabs in the top bar like the app. Moving between
// tabs keeps you in the room (no "has left"); only closing a tab (✕) or
// logging out leaves it. Kept per account in this browser.

const MAX_OPEN = 8;
const EVENT = "migwith-open-rooms";
const key = (uid: string) => `migwith.openRooms.${uid}`;

export function readOpenRooms(uid: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(uid)) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(uid: string, list: string[]) {
  try {
    localStorage.setItem(key(uid), JSON.stringify(list));
  } catch {
    // storage blocked
  }
  window.dispatchEvent(new Event(EVENT));
}

export function addOpenRoom(uid: string, name: string) {
  const cur = readOpenRooms(uid);
  if (cur.includes(name)) return;
  write(uid, [...cur, name].slice(-MAX_OPEN));
}

export function removeOpenRoom(uid: string, name: string) {
  dropRoomSession(uid, name);
  write(
    uid,
    readOpenRooms(uid).filter((r) => r !== name)
  );
}

export function isRoomOpen(uid: string, name: string): boolean {
  return readOpenRooms(uid).includes(name);
}

export function useOpenRooms(uid: string | undefined): string[] {
  const [rooms, setRooms] = useState<string[]>([]);
  useEffect(() => {
    if (!uid) return setRooms([]);
    const load = () => setRooms(readOpenRooms(uid));
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, [uid]);
  return rooms;
}

// Keeps lastSeen fresh for the open rooms you are not looking at. update (not
// set) so a presence doc removed by a kick is never brought back.
export function touchOpenRooms(uid: string, except: string | null) {
  for (const name of readOpenRooms(uid)) {
    if (name === except) continue;
    updateDoc(doc(db, "room_presence", name, "users", uid), { lastSeen: serverTimestamp() }).catch(() => {});
  }
}

// Leave a room you are not currently looking at: remove the presence doc and
// post "has left" (skipped when invisible / Presence Status INVISIBLE).
export async function leaveRoomInBackground(uid: string, name: string) {
  const presenceRef = doc(db, "room_presence", name, "users", uid);
  const presence = await getDoc(presenceRef).catch(() => null);
  if (!presence?.exists()) return; // never entered (invisible) or already gone
  const me = await getDoc(doc(db, "users", uid)).catch(() => null);
  const username = String(presence.get("username") || me?.get("username") || "");
  const level = Number(presence.get("level") || me?.get("level") || 1);
  // "has left" only for someone really shown in the room: their presence doc
  // exists (checked above) and is not INVISIBLE — the room decided who may hide.
  const quiet = String(presence.get("presenceStatus") || "").toUpperCase() === "INVISIBLE";
  const visitId = String(presence.get("visitId") || "") || null;
  await deleteDoc(presenceRef).catch(() => {});
  if (quiet || !username) return;
  await setDoc(doc(db, "room_messages", name, "messages", leaveDocId(uid, visitId)), {
    text: presenceLine(name, username, level, false, presenceBadgesForDoc(me?.data())),
    sender: username,
    senderUid: uid,
    type: "room_leave",
    createdAt: serverTimestamp(),
  }).catch(() => {});
}

/** Logout: leave every open room and forget the tabs. */
export async function leaveAllOpenRooms(uid: string) {
  const rooms = readOpenRooms(uid);
  rooms.forEach((r) => dropRoomSession(uid, r));
  write(uid, []);
  await Promise.all(rooms.map((r) => leaveRoomInBackground(uid, r)));
}
