"use client";

import { useCallback, useEffect, useState } from "react";

// Favourite and recently opened rooms, kept in this browser (like the app keeps
// them on the phone).

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

/** Call when a room is opened. */
export function rememberRecentRoom(name: string) {
  write(RECENT, [name, ...read(RECENT).filter((r) => r !== name)].slice(0, 10));
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
    return () => {
      window.removeEventListener(EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const toggleFavorite = useCallback((name: string) => {
    const cur = read(FAV);
    write(FAV, cur.includes(name) ? cur.filter((r) => r !== name) : [...cur, name]);
  }, []);

  return { favorites, recent, toggleFavorite };
}
