"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

// The Android app download link: the DIRECT APK from app_config/latest.apkUrl
// (the same file the app's Update page downloads, so it is always the newest
// version). If that isn't set, the app's "Share Invite" link
// (app_settings/invite.downloadUrl) is used. Both documents are readable by
// everyone (also signed out).

const valid = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^https?:\/\//i.test(s) ? s : "";
};

/** The download link plus the APK's version ("2.2.5") when the direct APK is used. */
export function useAppDownload(): { url: string; version: string } {
  const [invite, setInvite] = useState("");
  const [apk, setApk] = useState("");
  const [version, setVersion] = useState("");
  useEffect(() => {
    const a = onSnapshot(doc(db, "app_settings", "invite"), (s) => setInvite(valid(s.get("downloadUrl"))), () => {});
    const b = onSnapshot(
      doc(db, "app_config", "latest"),
      (s) => {
        setApk(valid(s.get("apkUrl")));
        setVersion(String(s.get("versionName") || "").trim());
      },
      () => {}
    );
    return () => {
      a();
      b();
    };
  }, []);
  return { url: apk || invite, version: apk ? version : "" };
}

export function useAppDownloadUrl(): string {
  return useAppDownload().url;
}
