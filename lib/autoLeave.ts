"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { autoLeaveOpenRooms, forgetOpenRooms } from "./openRooms";

// ⏰ Never logged out by the web itself. Instead:
//  • minimised (tab / browser in the background) for BACKGROUND_LEAVE_MS or
//    more → when it comes back, out of every open room ("has left"); the tabs
//    stay, and typing in one says "You have been auto left …" — close the tab
//    (✕) and open the room again to come back in;
//  • the browser itself dropped the login (cleared data, an in-app browser
//    that forgets, …) → that ID's room tabs are closed, so logging in again
//    never shows rooms you are no longer in.

/** How long the web may stay minimised before it leaves its rooms. */
export const BACKGROUND_LEAVE_MS = 120 * 60 * 1000;

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

export function useAutoLeave(uid: string | undefined) {
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
    const check = () => {
      if (document.visibilityState === "hidden") {
        // Several tabs of the web: the first one hidden keeps the time.
        if (!read(HIDDEN_AT)) write(HIDDEN_AT, String(Date.now()));
        return;
      }
      const at = Number(read(HIDDEN_AT)) || 0;
      write(HIDDEN_AT, null);
      if (at && Date.now() - at >= BACKGROUND_LEAVE_MS) void autoLeaveOpenRooms(uid);
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
