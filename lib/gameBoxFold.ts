"use client";

import { useEffect, useRef } from "react";

// 🎴 Game boxes fold themselves (the app's GameBoxAutoFold): the box is open
// only for people IN the game; everyone else gets a slim bar (with "● LIVE ·
// Watch" while a game runs). Opening a room = open if you're playing, folded
// if not; leaving the game folds it again after a short grace time.
export function useGameAutoFold(inGame: boolean, setCollapsed: (v: boolean) => void, graceMs = 4_000) {
  const first = useRef(true);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    if (inGame) setCollapsed(false);
    else if (first.current) setCollapsed(true);
    else t = setTimeout(() => setCollapsed(true), graceMs);
    first.current = false;
    return () => {
      if (t) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inGame]);
}
