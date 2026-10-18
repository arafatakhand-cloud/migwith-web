"use client";

import { useEffect, useState } from "react";
import {
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "./firebase";
import { LUXURY_BOT_REMOVED_ROOM, leaveDocId, presenceLine, presenceBadgesForDoc } from "./rooms";
import { dropRoomSession } from "./roomSession";
import { serverNow } from "./serverTime";

// Rooms you are in, shown as tabs in the top bar like the app. Moving between
// tabs keeps you in the room (no "has left"); only closing a tab (✕) or
// logging out leaves it. Kept per account in this browser.

const MAX_OPEN = 8;
const EVENT = "migwith-open-rooms";
const key = (uid: string) => `migwith.openRooms.${uid}`;

export function readOpenRooms(uid: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(uid)) || "[]");
    // 👻 Luxury Bot Official was removed: an old saved tab is dropped.
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== LUXURY_BOT_REMOVED_ROOM) : [];
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

/**
 * Removes my presence doc unless it is /parked (like the app): a parked spot
 * stays in "Currently in this room". True only when the delete really went
 * through — "has left" is posted only then, never for a spot that stays.
 */
export async function deletePresenceUnlessParked(ref: DocumentReference): Promise<boolean> {
  try {
    const snap = await getDocFromServer(ref);
    if (!snap.exists()) return false; // already gone (kicked, swept): no line
    if (Number(snap.get("parkedUntil") || 0) > serverNow()) return false;
  } catch {
    return false; // can't tell → don't risk wiping a park; it goes stale on its own
  }
  try {
    await deleteDoc(ref);
    return true;
  } catch {
    return false; // refused by the rules (a parked spot) or offline
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
  // "has left" only once the delete really went through (a /parked spot stays).
  if (!(await deletePresenceUnlessParked(presenceRef))) return;
  if (quiet || !username) return;
  await setDoc(doc(db, "room_messages", name, "messages", leaveDocId(uid, visitId)), {
    text: presenceLine(name, username, level, false, presenceBadgesForDoc(me?.data())),
    sender: username,
    senderUid: uid,
    type: "room_leave",
    createdAt: serverTimestamp(),
  }).catch(() => {});
}

/** Signed out: forget this ID's room tabs and where each room's chat began
 *  (in this browser only). */
export function forgetOpenRooms(uid: string) {
  readOpenRooms(uid).forEach((r) => dropRoomSession(uid, r));
  write(uid, []);
  // Logged out = every visit is over: forget where each room's chat began, so
  // logging in again starts the chat fresh (nothing said while logged out).
  try {
    const prefix = `migwith.roomEntry.${uid}.`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) localStorage.removeItem(k);
    }
  } catch {
    // storage blocked
  }
}

/** Logout: leave every open room and forget the tabs. */
export async function leaveAllOpenRooms(uid: string) {
  const rooms = readOpenRooms(uid);
  forgetOpenRooms(uid);
  await Promise.all(rooms.map((r) => leaveRoomInBackground(uid, r)));
}

/**
 * "X has left." for a visit that ended by INACTIVITY (no heartbeat for 3 h),
 * like the app's postStaleRoomLeaveLineOnce: posted at most once — if the
 * server or another phone already wrote this visit's line, it is left alone.
 */
export async function postStaleLeaveLineOnce(
  roomId: string,
  uid: string,
  name: string,
  level: number,
  badges: string[],
  visitId: string | null
): Promise<void> {
  const ref = doc(db, "room_messages", roomId, "messages", leaveDocId(uid, visitId));
  try {
    if ((await getDocFromServer(ref)).exists()) return;
  } catch {
    // can't tell — try to write it; the rules / same id keep it single
  }
  await setDoc(ref, {
    text: presenceLine(roomId, name, level, false, badges),
    sender: name,
    senderUid: uid,
    type: "room_leave",
    createdAt: serverTimestamp(),
  }).catch(() => {});
}
