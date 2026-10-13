"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { useSession } from "../app/_components/AppSession";

// The main founder account, like the app's MainFounderUsernames: "miglife"
// ONLY (the old "migwith" account has no founder powers any more).
export const MAIN_FOUNDER_USERNAMES = new Set(["miglife"]);
export const isMainFounderName = (name?: string | null) =>
  MAIN_FOUNDER_USERNAMES.has((name || "").trim().toLowerCase());

// Founder permissions of this account, like the app's MyFounderPerms: the
// main founder can do everything; other founders have the perms listed in
// founders/{uid}. The server checks every founder action again.
export const FOUNDER_PERMS: [string, string][] = [
  ["share_permissions", "Share Permissions"],
  ["room_info", "Room Info"],
  ["change_email", "Change Email"],
  ["ip_monitor", "IP Monitor / IP Ban"],
  ["coin_control", "Coin Control"],
  ["id_creation", "ID Creation"],
  ["create_id", "Create ID"],
  ["switch_account", "Switch Account"],
  ["whois_full", "Whois (full)"],
  // 🎁 Gift Shops: add / edit / delete gifts
  ["gift_shop", "Gift Edit"],
];

export function useFounderPerms() {
  const { user, username } = useSession();
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [listed, setListed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const isMigwith = isMainFounderName(username);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "founders", user.uid),
      (d) => {
        const p = d.get("perms");
        setPerms(new Set(Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : []));
        setListed(d.exists());
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
    /**
     * 👑 Hidden founder (listed in miglife secret → Founders, even with no
     * permission ticked): shown as a normal "User" everywhere, but with every
     * admin / staff power in rooms. Moderation lines say "Admin", not the name.
     */
    isHiddenFounder: listed && !isMigwith,
  };
}

export const timeText = (ms?: number | null) =>
  ms
    ? new Date(ms).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "-";
