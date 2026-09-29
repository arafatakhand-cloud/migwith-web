"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

// The Android app download link — the SAME link the app's "Share Invite"
// uses: app_settings/invite.downloadUrl, which miglife changes from the app
// (Home → Invite Friends ✏️) or from miglife secret on the web. If it isn't
// set, the direct APK link from app_config/latest.apkUrl is used. Both
// documents are readable by everyone (also signed out).

const valid = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^https?:\/\//i.test(s) ? s : "";
};

export function useAppDownloadUrl(): string {
  const [invite, setInvite] = useState("");
  const [apk, setApk] = useState("");
  useEffect(() => {
    const a = onSnapshot(doc(db, "app_settings", "invite"), (s) => setInvite(valid(s.get("downloadUrl"))), () => {});
    const b = onSnapshot(doc(db, "app_config", "latest"), (s) => setApk(valid(s.get("apkUrl"))), () => {});
    return () => {
      a();
      b();
    };
  }, []);
  return invite || apk;
}
