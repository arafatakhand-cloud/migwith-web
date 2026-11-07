"use client";

import { useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { signOut } from "firebase/auth";
import { auth, functions } from "./firebase";
import { leaveAllOpenRooms } from "./openRooms";
import { markOfflineForLogout } from "./heartbeat";

// 🌐 IP MONITOR for the website (the app's recordUserIp call in MainActivity.kt).
// The server reads the browser's real IP from the request itself (a page can't
// fake it), saves it with the location, and answers whether this IP / account
// is banned or suspended — then this browser is signed out, like the app.

type Reply = { suspended?: boolean; banned?: boolean; deviceBanned?: boolean; reason?: string; skipped?: boolean };

/** "Web · Chrome on Windows" */
function browserLabel(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return `Web · ${browser}${os ? ` on ${os}` : ""}`;
}

export function useRecordWebIp(uid: string | undefined) {
  useEffect(() => {
    if (!uid) return;
    let gone = false;
    httpsCallable<{ device: string; appVersion: string }, Reply>(functions, "recordUserIp")({ device: browserLabel(), appVersion: "web" })
      .then(async ({ data }) => {
        if (gone || !data || data.skipped) return;
        const why = data.reason ? `\nReason: ${data.reason}` : "";
        const msg = data.suspended
          ? `Your account has been suspended.${why}`
          : data.deviceBanned
            ? `This device has been banned from miGlife.${why}`
            : data.banned
              ? `Your network (IP) has been banned from miGlife.${why}`
              : "";
        if (!msg) return;
        await leaveAllOpenRooms(uid).catch(() => {});
        await markOfflineForLogout(uid);
        await signOut(auth).catch(() => {});
        window.alert(msg);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [uid]);
}
