"use client";

import { useCallback, useState } from "react";

// 🎯 The chosen bet / entry amount in each game (Luxury Bet, Luxury Bot, Teen
// Patti boot, Ludo fee, Cricket / 29 entry, Royale bet) is kept until the tab
// is CLOSED or the user LOGS OUT — switching rooms or reloading never resets
// it (the app's LuxuryAmountMemory). Saved in sessionStorage, so it lives as
// long as the tab.

const PREFIX = "migwith.amount.";

export function readRememberedAmount(key: string): number | null {
  try {
    const v = Number(sessionStorage.getItem(PREFIX + key));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function rememberAmount(key: string, v: number) {
  if (!(v > 0)) return;
  try {
    sessionStorage.setItem(PREFIX + key, String(v));
  } catch {}
}

/** useState for a game amount that remembers the last choice (see above). */
export function useRememberedAmount(key: string, fallback: number): [number, (v: number) => void] {
  const [value, setValue] = useState(() => readRememberedAmount(key) ?? fallback);
  const set = useCallback(
    (v: number) => {
      setValue(v);
      rememberAmount(key, v);
    },
    [key]
  );
  return [value, set];
}

/** Logout resets every chosen amount. */
export function clearRememberedAmounts() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {}
}
