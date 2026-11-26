"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
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
  // 🚩 see and handle user reports
  ["reports", "Reports"],
  // 🎁 Gift Contest: set the prize, rules, room and time
  ["gift_contest", "Gift Contest"],
  // 🎮 Game Contests: add, start, stop, reset and delete
  ["game_contest", "Game Contest"],
  // 🧰 2026-11-26: every other Secret tool can be given to a founder too
  ["quick_id", "Quick Create ID"],
  ["review_account", "Review Account"],
  ["security_reset", "Security Question Reset"],
  ["email_check", "Email Check"],
  ["privacy", "Private Emails"],
  ["delete_account", "Delete Account"],
  ["verified", "Verified"],
  ["warnings", "Warnings"],
  ["profile_lock", "Profile Lock"],
  ["public_profiles", "Public Profiles"],
  ["watchdog_speed", "Watchdog Speed"],
  ["transfer_limits", "Transfer Limits"],
  ["vip", "VIP Subscription"],
  ["mentor_renewals", "Mentor Renewals"],
  ["lucky_user", "Lucky User"],
  ["game_refund", "Game Refund"],
  ["bot_restart", "Bot Restart"],
  ["luxury_bet", "Luxury Bet"],
  ["lb_audit", "Payout Check"],
  ["win_effects", "Win Effects (Cricket · LowCard)"],
  ["daily_rewards", "Daily Game Rewards"],
  ["house_bots", "House Bots"],
  ["always_room", "Always in Room"],
  ["calls", "Audio Calls & Limits"],
  ["system_posts", "System posts"],
  ["feed_video", "Feed Video"],
  ["profile_songs", "Profile Songs"],
  ["sing_songs", "Sing Songs"],
  ["push", "Push Notifications"],
  ["fb_group", "Facebook Group"],
  ["support_mail", "Support Mail"],
  ["site_control", "Site control"],
  ["app_link", "App Download Link"],
  ["level_curve", "Level Curve"],
  ["season_pass", "Season Pass"],
  ["daily_missions", "Daily Missions"],
  ["achievements", "Achievements & Badges"],
];

/** 🧰 The Founders page shows the tools in the same groups as the Secret page. */
export const FOUNDER_PERM_GROUPS: [string, string[]][] = [
  ["👥 IDs & Accounts", ["quick_id", "create_id", "id_creation", "review_account", "change_email", "security_reset", "email_check", "privacy", "delete_account", "verified", "switch_account", "whois_full"]],
  ["🛡 Safety", ["ip_monitor", "reports", "warnings", "profile_lock", "public_profiles", "share_permissions", "watchdog_speed"]],
  ["💰 Coins & Shop", ["coin_control", "transfer_limits", "gift_shop", "vip", "mentor_renewals", "lucky_user"]],
  ["🎮 Games", ["game_refund", "bot_restart", "luxury_bet", "lb_audit", "game_contest", "gift_contest", "win_effects", "daily_rewards", "house_bots"]],
  ["🏠 Rooms & Calls", ["always_room", "room_info", "calls"]],
  ["📣 Feed & Content", ["system_posts", "feed_video", "profile_songs", "sing_songs", "push", "fb_group", "support_mail"]],
  ["⚙️ App & Rewards", ["site_control", "app_link", "level_curve", "season_pass", "daily_missions", "achievements"]],
];

// 🔑 Every tool this person has, worked out by the server: from founders/{uid},
// from their own tools (set when they were made Staff / Admin), and from their role.
const getMyFounderPerms = httpsCallable<Record<string, never>, { perms: string[] }>(functions, "getMyFounderPerms");

export function useFounderPerms() {
  const { user, username } = useSession();
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [serverPerms, setServerPerms] = useState<Set<string>>(new Set());
  const [listed, setListed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const isMigwith = isMainFounderName(username);
  useEffect(() => {
    if (!user) return;
    getMyFounderPerms({})
      .then((r) => setServerPerms(new Set(Array.isArray(r.data.perms) ? r.data.perms : [])))
      .catch(() => setServerPerms(new Set()));
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
    can: (p: string) => isMigwith || perms.has(p) || serverPerms.has(p),
    isAnyFounder: isMigwith || perms.size > 0 || serverPerms.size > 0,
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
