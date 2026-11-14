"use client";

import { BADGE_EMOJI_TO_KEY } from "./rooms";

// 🔐 Who may share pictures / voice, from the Share Permissions table that
// miglife sets (app_settings/media_sharing_permissions). A user takes the
// HIGHEST row they hold: a Color Shop badge they have switched on, or a role.
// No row → Normal User (nothing). miglife (the main founder) is always allowed.

export type ShareRow = { picture: boolean; voice: boolean; video: boolean; feedVideo: boolean };
export type ShareTable = Record<string, Partial<ShareRow>> & { videoMaxSeconds?: number };

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
export function shareAllowed(table: ShareTable | null, keys: string[], what: "picture" | "voice" | "video" | "feedVideo"): boolean {
  if (!table) return false;
  const best = keys.map((k) => ORDER.indexOf(k)).filter((i) => i >= 0).sort((a, b) => b - a)[0];
  // no row = a Normal User: only the Feed-video column has a Normal User switch that counts
  if (best === undefined) return what === "feedVideo" && (table.REGULAR as Partial<ShareRow> | undefined)?.feedVideo === true;
  return (table[ORDER[best]] as Partial<ShareRow> | undefined)?.[what] === true;
}

/** ⏱️ the longest video miglife allows (seconds; 60 when not set). */
export function videoMaxSecondsOf(table: ShareTable | null): number {
  const v = Number(table?.videoMaxSeconds || 0);
  return [15, 30, 60, 120, 180, 300].includes(v) ? v : 60;
}

export function videoLengthLabel(sec: number): string {
  return sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec} sec`;
}

/** A video file's length in seconds (0 when the browser can't tell). */
export function videoSecondsOf(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (s: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(s) ? s : 0);
    };
    v.preload = "metadata";
    v.onloadedmetadata = () => done(v.duration);
    v.onerror = () => done(0);
    setTimeout(() => done(0), 8000);
    v.src = url;
  });
}
