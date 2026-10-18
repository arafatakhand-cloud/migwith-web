"use client";

import { useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { detachPushForLogout } from "./push";
import { forgetOpenRooms, leaveAllOpenRooms } from "./openRooms";
import { markOfflineForLogout } from "./heartbeat";
import { clearRememberedAmounts } from "./amountMemory";

// 🔐 Logging out the right way, whatever ends the session:
//  • web minimised (tab / browser in the background) for BACKGROUND_LOGOUT_MS
//    or more → a full logout when it comes back: left every room ("has left"),
//    offline for friends, room tabs closed — like pressing Logout;
//  • the browser itself dropped the login (cleared data, an in-app browser
//    that forgets, …) → the room tabs of that ID are closed here too, so
//    logging in again never shows rooms you are no longer in.

/** How long the web may stay minimised before it logs out by itself. */
export const BACKGROUND_LOGOUT_MS = 30 * 60 * 1000;

const HIDDEN_AT = "migwith.hiddenAt";
const LAST_UID = "migwith.lastUid";

const read = (k: string) => {
  try {
    return localStorage.getItem(k) || "";
  } catch {
    return "";
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // storage blocked
  }
};

/** The same steps as the Logout button. */
export async function fullLogout(uid: string | undefined) {
  await detachPushForLogout();
  if (uid) await leaveAllOpenRooms(uid);
  await markOfflineForLogout(uid);
  clearRememberedAmounts();
  write(LAST_UID, null);
  await signOut(auth);
}

export function useAutoLogout(uid: string | undefined) {
  // Remember who is signed in; signed out without the Logout button → close
  // that ID's room tabs (its room spots go stale on the server by themselves).
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (u) {
        write(LAST_UID, u.uid);
        return;
      }
      const last = read(LAST_UID);
      if (last) forgetOpenRooms(last);
      write(LAST_UID, null);
    });
  }, []);

  useEffect(() => {
    if (!uid) return;
    let busy = false;
    const check = () => {
      if (document.visibilityState === "hidden") {
        // Several tabs of the web: the first one hidden keeps the time.
        if (!read(HIDDEN_AT)) write(HIDDEN_AT, String(Date.now()));
        return;
      }
      const at = Number(read(HIDDEN_AT)) || 0;
      write(HIDDEN_AT, null);
      if (!busy && at && Date.now() - at >= BACKGROUND_LOGOUT_MS) {
        busy = true;
        fullLogout(uid).finally(() => {
          busy = false;
        });
      }
    };
    // The page closing (the phone shuts the minimised web) counts as hidden.
    const onHide = () => {
      if (!read(HIDDEN_AT)) write(HIDDEN_AT, String(Date.now()));
    };
    // Opened again after the phone closed the minimised web: same check.
    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("pagehide", onHide);
    };
  }, [uid]);
}
