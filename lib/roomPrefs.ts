"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

// Favourite and recently opened rooms. Kept in this browser AND (2026-11) on the
// server in room_prefs/{uid}, the same doc the app uses — so logging out, a new
// phone / browser or deleting the app never loses them.

const FAV = "migwith.favRooms";
const RECENT = "migwith.recentRooms";
const EVENT = "migwith-room-prefs";

function read(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // storage blocked
  }
}

// ☁️ the copy on the server (only my own doc; the rules allow 50 favourites / 10 recent)
function saveServer() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  setDoc(doc(db, "room_prefs", uid), { favorites: read(FAV).slice(0, 50), recent: read(RECENT).slice(0, 10), updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
}

// once per signed-in account: the server list wins; the first time, this browser's lists go up
let syncedUid = "";
function syncFromServer(uid: string) {
  if (!uid || syncedUid === uid) return;
  syncedUid = uid;
  getDoc(doc(db, "room_prefs", uid))
    .then((s) => {
      if (s.exists()) {
        const fav = (s.get("favorites") || []).filter((x: unknown) => typeof x === "string");
        const rec = (s.get("recent") || []).filter((x: unknown) => typeof x === "string");
        write(FAV, fav);
        if (rec.length) write(RECENT, rec.slice(0, 10));
      } else if (read(FAV).length || read(RECENT).length) {
        saveServer();
      }
    })
    .catch(() => {
      syncedUid = "";
    });
}

/** Call when a room is opened. */
export function rememberRecentRoom(name: string) {
  write(RECENT, [name, ...read(RECENT).filter((r) => r !== name)].slice(0, 10));
  saveServer();
}

export function useRoomPrefs() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const load = () => {
      setFavorites(read(FAV));
      setRecent(read(RECENT));
    };
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener("storage", load);
    const off = onAuthStateChanged(auth, (u) => {
      if (u) syncFromServer(u.uid);
      else syncedUid = "";
    });
    return () => {
      window.removeEventListener(EVENT, load);
      window.removeEventListener("storage", load);
      off();
    };
  }, []);

  const toggleFavorite = useCallback((name: string) => {
    const cur = read(FAV);
    write(FAV, cur.includes(name) ? cur.filter((r) => r !== name) : [...cur, name].slice(-50));
    saveServer();
  }, []);

  return { favorites, recent, toggleFavorite };
}
