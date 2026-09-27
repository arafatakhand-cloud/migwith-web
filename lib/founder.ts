"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { useSession } from "../app/_components/AppSession";

// Founder permissions of this account, like the app's MyFounderPerms:
// migwith can do everything; other founders have the perms listed in
// founders/{uid}. The server checks every founder action again.
export const FOUNDER_PERMS: [string, string][] = [
  ["share_permissions", "Share Permissions"],
  ["room_info", "Room Info"],
  ["change_email", "Change Email"],
  ["ip_monitor", "IP Monitor / IP Ban"],
  ["coin_control", "Coin Control"],
  ["id_creation", "ID Creation"],
  ["luxury_tiers", "Luxury Tiers"],
  ["create_id", "Create ID"],
  ["switch_account", "Switch Account"],
  ["whois_full", "Whois (full)"],
];

export function useFounderPerms() {
  const { user, username } = useSession();
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const isMigwith = (username || "").trim().toLowerCase() === "migwith";
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "founders", user.uid),
      (d) => {
        const p = d.get("perms");
        setPerms(new Set(Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : []));
        setLoaded(true);
      },
      () => setLoaded(true)
    );
  }, [user]);
  return {
    isMigwith,
    loaded: loaded || isMigwith,
    can: (p: string) => isMigwith || perms.has(p),
    isAnyFounder: isMigwith || perms.size > 0,
  };
}

export const timeText = (ms?: number | null) =>
  ms
    ? new Date(ms).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "-";
