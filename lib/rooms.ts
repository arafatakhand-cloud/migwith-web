// Room names and presence helpers shared with the MIGwith Android app.
// Keep these in sync with MainActivity.kt / RoomPage.kt.

export const OFFICIAL_COUNTRY_ROOMS = [
  "Bangladesh", "India", "Pakistan", "Nepal", "Bhutan", "Maldives",
  "Qatar", "Kuwait", "Oman", "Malaysia", "Singapore", "Indonesia",
  "Thailand", "Canada", "Australia", "Germany", "France", "Italy",
  "Spain", "Russia", "Brazil",
];

export const OFFICIAL_GAME_ROOMS = [
  "👻 Luxury Bot Official",
  "🃏 LowCard Official",
  "🏏 Cricket Official",
  "🎴 Teen Patti Official",
  "🎲 Ludo Bot Official",
  "👑 MIG Royale Official",
  "🃏 29 Official",
  "🎁 Gift Official",
];

// A presence doc older than this no longer counts as "in the room".
export const ROOM_PRESENCE_STALE_MS = 185 * 60 * 1000;

// How often the app refreshes presence.lastSeen while in a room.
export const PRESENCE_HEARTBEAT_MS = 20_000;

const LEVEL_BADGES: [number, number | null, string][] = [
  [1, 10, "🥚"], [11, 19, "🥈"], [20, 29, "🥇"], [30, 49, "💎"],
  [50, 74, "🔥"], [75, 99, "👑"], [100, 149, "🏆"], [150, 199, "⚔️"],
  [200, 299, "🛡️"], [300, 399, "💠"], [400, 499, "🌟"], [500, 599, "👑"],
  [600, 699, "🔱"], [700, 799, "💫"], [800, 899, "⚡"], [900, 999, "🌌"],
  [1000, null, "♾️"],
];

export function badgeForLevel(level: number): string {
  const safe = Math.max(1, level);
  const hit = [...LEVEL_BADGES]
    .reverse()
    .find(([min, max]) => safe >= min && (max === null || safe <= max));
  return hit ? hit[2] : "🥚";
}

// Same text as formatPresenceLine() in the app. The level badge itself is not
// part of the line; only extra (shop) badges are, and the web has none yet.
export function presenceLine(
  roomId: string,
  name: string,
  level: number,
  entered: boolean
): string {
  return `${roomId}: ${name} [${level}] ${entered ? "has entered." : "has left."}`;
}

export function leaveDocId(uid: string, visitId: string | null): string {
  return visitId ? `leave_${uid}_${visitId}` : `leave_${uid}`;
}

export function newVisitId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export function roomHref(name: string): string {
  return `/room/${encodeURIComponent(name)}`;
}
