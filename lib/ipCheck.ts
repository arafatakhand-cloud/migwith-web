"use client";

import { useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { signOut } from "firebase/auth";
import { auth, functions } from "./firebase";

// 🌐 Same as the app's IP Monitor: every open / sign-in reports this browser's
// IP to the server (recordUserIp). If miGlife has banned the IP, banned this
// device or suspended the account, the user is signed out and told why.

const recordUserIp = httpsCallable<
  { device: string; appVersion: string; vpn: boolean },
  { suspended?: boolean; banned?: boolean; deviceBanned?: boolean; reason?: string }
>(functions, "recordUserIp");

export function useIpCheck(uid: string | undefined) {
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    recordUserIp({
      device: (navigator.userAgent || "web").slice(0, 120),
      appVersion: "web",
      vpn: false,
    })
      .then(async ({ data }) => {
        if (cancelled || !data) return;
        const reason = data.reason ? `\nReason: ${data.reason}` : "";
        let message: string | null = null;
        if (data.suspended) message = `Your account has been suspended.${reason}`;
        else if (data.deviceBanned) message = `This device has been banned from miGlife.${reason}`;
        else if (data.banned) message = `Your network (IP) has been banned from miGlife.${reason}`;
        if (!message) return;
        window.alert(message);
        await signOut(auth).catch(() => {});
      })
      .catch(() => {
        // offline or the function is not deployed yet: nothing to block
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);
}
