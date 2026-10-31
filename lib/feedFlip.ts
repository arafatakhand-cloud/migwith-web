"use client";

import { useSyncExternalStore } from "react";

// 📰 Lobby ⇄ Feed flip: the 📰 Feed button in the top bar turns the Lobby over
// to show the Feed on its back; tapping it again turns it back. Leaving the
// Lobby turns it back too (Dashboard sets it off when it closes).
let on = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const setFeedFlip = (v: boolean) => {
  if (on === v) return;
  on = v;
  emit();
};
export const toggleFeedFlip = () => setFeedFlip(!on);
export function useFeedFlip(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => on,
    () => false
  );
}
