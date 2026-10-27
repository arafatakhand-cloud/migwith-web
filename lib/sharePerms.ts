"use client";

import { BADGE_EMOJI_TO_KEY } from "./rooms";

// 🔐 Who may share pictures / voice, from the Share Permissions table that
// miglife sets (app_settings/media_sharing_permissions). A user takes the
// HIGHEST row they hold: a Color Shop badge they have switched on, or a role.
// No row → Normal User (nothing). miglife (the main founder) is always allowed.

export type ShareRow = { picture: boolean; voice: boolean; video: boolean };
export type ShareTable = Record<string, Partial<ShareRow>>;

// Same order as the table on the Share Permissions page (lowest first).
const ORDER = [
  "MENTOR", "MERCHANT", "king", "queen", "mafia", "vip", "diamond", "premium",
  "supporter", "streamer", "ELITE_USER", "EXECUTIVE_BOARD", "COUNTRY_REPRESENTATIVE", "STAFF", "ADMIN", "OWNER",
];


/** The table rows a user holds, from their badges (role badges + Color Shop badges). */
export function shareKeysOf(badgeEmojis: string[]): string[] {
  const keys = new Set<string>();
  for (const b of badgeEmojis) {
    const k = BADGE_EMOJI_TO_KEY.find(([emoji]) => emoji === b)?.[1];
    if (k && ORDER.includes(k)) keys.add(k);
  }
  return [...keys];
}

/** Picture / voice allowed for this user, from the table (highest row wins). */
export function shareAllowed(table: ShareTable | null, keys: string[], what: "picture" | "voice"): boolean {
  if (!table) return false;
  const best = keys.map((k) => ORDER.indexOf(k)).filter((i) => i >= 0).sort((a, b) => b - a)[0];
  if (best === undefined) return false;
  return table[ORDER[best]]?.[what] === true;
}
