// Room names and presence helpers shared with the MIGlife Android app.
// Keep these in sync with MainActivity.kt / RoomPage.kt.

export const OFFICIAL_COUNTRY_ROOMS = [
  "Bangladesh", "India", "Pakistan", "Nepal", "Bhutan", "Maldives",
  "Qatar", "Kuwait", "Oman", "Malaysia", "Singapore", "Indonesia",
  "Thailand", "Canada", "Australia", "Germany", "France", "Italy",
  "Spain", "Russia", "Brazil",
];

// The old Luxury Bot room — removed from the app (no list, no tab, no bot).
export const LUXURY_BOT_REMOVED_ROOM = "👻 Luxury Bot Official";

export const OFFICIAL_GAME_ROOMS = [
  "🃏 LowCard Official",
  "🏏 Cricket Official",
  "🎴 Teen Patti Official",
  "🎲 Ludo Bot Official",
  "🎲 Ludo Bot Free",
  "👑 MIG Royale Official",
  "🃏 29 Official",
  "🃏 29 Card Free",
  "🎁 Gift Official",
  "🧠 Trivia Official",
];

// A presence doc older than this no longer counts as "in the room".
export const ROOM_PRESENCE_STALE_MS = 185 * 60 * 1000;

// How often the app refreshes presence.lastSeen while in a room.
export const PRESENCE_HEARTBEAT_MS = 20_000;

const LEVEL_BADGES: [number, number | null, string, string][] = [
  [1, 10, "🥚", "Newcomer"], [11, 19, "🥈", "Silver"], [20, 29, "🥇", "Gold"], [30, 49, "💎", "Diamond"],
  [50, 74, "🔥", "Elite"], [75, 99, "👑", "Royal"], [100, 149, "🏆", "Champion"], [150, 199, "⚔️", "Master"],
  [200, 299, "🛡️", "Guardian"], [300, 399, "💠", "Legend"], [400, 499, "🌟", "Superstar"], [500, 599, "👑", "Grand Master"],
  [600, 699, "🔱", "Immortal"], [700, 799, "💫", "Mythic"], [800, 899, "⚡", "Supreme"], [900, 999, "🌌", "Ultra Legend"],
  [1000, null, "♾️", "Eternal"],
];

/** Every level tier as [name, icon] (for the level-badge pictures). */
export const LEVEL_TIERS: [string, string][] = LEVEL_BADGES.map(([, , icon, name]) => [name, icon]);

/** The tier name for a level ("Silver", "Gold" …), like the app. */
export function badgeNameForLevel(level: number): string {
  const safe = Math.max(1, level);
  const hit = [...LEVEL_BADGES].reverse().find(([min, max]) => safe >= min && (max === null || safe <= max));
  return hit ? hit[3] : "Newcomer";
}

export function badgeForLevel(level: number): string {
  const safe = Math.max(1, level);
  const hit = [...LEVEL_BADGES]
    .reverse()
    .find(([min, max]) => safe >= min && (max === null || safe <= max));
  return hit ? hit[2] : "🥚";
}

// Same text as formatPresenceLine() in the app: "Room: name [12] 💼 💎 has
// entered." The level badge itself is not part of the line; the role badge
// and the Color Shop badges are.
export function presenceLine(
  roomId: string,
  name: string,
  level: number,
  entered: boolean,
  badges: string[] = []
): string {
  const extra = badges.filter((b) => b.trim());
  return `${roomId}: ${name} [${level}]${extra.length ? " " + extra.join(" ") : ""} ${entered ? "has entered." : "has left."}`;
}

// Color Shop badge per colour id (COLOR_SHOP_CATALOG in the app).
const SHOP_BADGES: [string, string][] = [
  ["king", "👑"], ["queen", "👼"], ["mafia", "🎩"], ["vip", "⭐"],
  ["diamond", "💎"], ["premium", "🏵️"], ["supporter", "🛡️"], ["streamer", "🎬"],
];

/** Every Color Shop badge the user owns, has switched ON (My Owned Colors) and has not
 * expired, oldest first (the app's activeShopBadges). A colour that is switched off
 * shows no badge. */
export function activeShopBadges(ownedColors: unknown): string[] {
  if (!ownedColors || typeof ownedColors !== "object") return [];
  const owned = ownedColors as Record<string, { expiresAt?: unknown; grantedAt?: unknown; active?: unknown } | undefined>;
  const now = Date.now();
  return SHOP_BADGES.flatMap(([id, badge]) => {
    const e = owned[id];
    const expiresAt = Number(e?.expiresAt || 0);
    return e && e.active === true && expiresAt > now ? [{ at: Number(e.grantedAt || 0), badge }] : [];
  })
    .sort((a, b) => a.at - b.at)
    .map((x) => x.badge);
}

// Badge emoji -> app_settings/badge_images key (the app's BADGE_EMOJI_TO_ROLE_KEY):
// every Color Shop badge by its colour id, every role badge by its role key.
export const BADGE_EMOJI_TO_KEY: [string, string][] = [
  ...SHOP_BADGES.map(([id, badge]) => [badge, id] as [string, string]),
  ["💼", "MENTOR"],
  ["🎓", "MENTOR"], // old room lines saved before the badge changed
  ["🛒", "MERCHANT"],
  ["🛠️", "STAFF"],
  ["⚙️", "ADMIN"],
  ["✨", "ELITE_USER"],
  ["🏛️", "EXECUTIVE_BOARD"],
  ["🌍", "COUNTRY_REPRESENTATIVE"],
];

/** Role badge (the app's roleBadgesFor): owner / founder and normal users have none. */
export function roleBadgesFor(role: unknown): string[] {
  switch (String(role ?? "").trim().toLowerCase().replace(/[- ]/g, "_")) {
    case "mentor": return ["💼"];
    case "merchant": return ["🛒"];
    case "staff": return ["🛠️"];
    case "admin":
    case "administrator": return ["⚙️"];
    case "elite":
    case "elite_user": return ["✨"];
    case "executive_board": return ["🏛️"];
    case "country_representative": return ["🌍"];
    default: return [];
  }
}

/** A role can be saved in membershipRole, memberType or role — the first that gives a badge wins. */
export function roleBadgesForDoc(data: Record<string, unknown> | undefined | null): string[] {
  if (!data) return [];
  for (const field of ["membershipRole", "memberType", "role"]) {
    const b = roleBadgesFor(data[field]);
    if (b.length) return b;
  }
  return [];
}

/** Role badge + Color Shop badges, as in the app's room enter/left lines. */
export function presenceBadgesForDoc(data: Record<string, unknown> | undefined | null): string[] {
  return [...roleBadgesForDoc(data), ...activeShopBadges(data?.ownedColors)];
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

// The room's welcome card, like the app's resolveRoomDescription: whatever an
// admin wrote is shown as is; only a blank, the old generic sentence, or (in
// an official room) just the room's own name falls back to the built-in
// welcome — the country-aware one for official rooms.
const LEGACY_DEFAULT_DESCRIPTION =
  "🏷️ Welcome to the room — chat, connect and enjoy the game together. 🎁\n\nPlease play fairly, respect other players and enjoy your time in the room. ✨";

// The 29 room keeps its old id (Firestore docs + Cloud Functions use it);
// only the name people see is "29 Card" (like the app).
export const TN_ROOM_DISPLAY_NAME = "🃏 29 Card Official";
/** The room name people see: no 👻 in front, and the 29 room as "29 Card". */
export function roomDisplayName(name: string): string {
  const out = name.replace(/^👻\s*/, "");
  return out === "🃏 29 Official" ? TN_ROOM_DISPLAY_NAME : out;
}

/**
 * Room name as shown in the room list (like the app's roomListName): the icon
 * in front of it (🎁 🎰 🎲 🧠 …) is left out. Only the shown text changes.
 */
export function roomListName(name: string): string {
  const shown = roomDisplayName(name);
  return shown.replace(/^[^\p{L}\p{N}]+/u, "") || shown;
}

const isOfficialRoomName = (name: string) =>
  name === "🎰 Luxury Bet" || name === LUXURY_BOT_REMOVED_ROOM || OFFICIAL_GAME_ROOMS.includes(name) || OFFICIAL_COUNTRY_ROOMS.includes(name);

export function officialRoomDefaultDescription(roomName: string): string {
  switch (roomName) {
    case "👻 Luxury Bot Official":
      return "🎲 Welcome to the official Luxury Bot room! 🎉\n\nOn behalf of the miGlife team — place your bets, enjoy the game, and play responsibly. ✨";
    case "🎰 Luxury Bet":
      return "🎰 Welcome to Luxury Bet! 🎉\n\nType !start to open a round, then tap a character twice (or !b l 1000) to bet on Laila, Majnu, Romeo, Juliet, Shirin or Farhad. Play responsibly! ✨";
    case "🃏 LowCard Official":
      return "🃏 Welcome to the official LowCard room! 🎉\n\nOn behalf of the miGlife team — join a game, draw your card, and play responsibly. ✨";
    case "🏏 Cricket Official":
      return "🏏 Welcome to the official Cricket room! 🎉\n\nOn behalf of the miGlife team — type !start to start a game, !j to join and !d to bat. Highest run scorer wins. Play responsibly! ✨";
    case "🎴 Teen Patti Official":
      return "🎴 Welcome to the official Teen Patti room! 🎉\n\nOn behalf of the miGlife team — type !start to open a table, !j to sit down, then play blind or see your cards. Best hand wins. Play responsibly! ✨";
    case "🃏 29 Official":
      return "🃏 Welcome to 29 Card! 🎉\n\n4 players, 2 teams — bid, hide your trump and win the tricks. Empty seats get bots. Type !start to open a table. Play responsibly! ✨";
    case "🃏 29 Card Free":
      return "🆓 Welcome to 29 Card Free! 🎉\n\nSame 29 game — no coins needed. 4 players, 2 teams, empty seats get bots. Type !start to open a table and play for fun! ✨";
    case "🧠 Trivia Official":
      return "🧠 Welcome to Trivia! 🎉\n\nPick বাংলা or English and type !start (in any chat room: /bot trivia, then !start bn / !start en) — 10 questions, tap A · B · C · D. Faster right answer = more points. !top shows the leaderboard. Have fun! ✨";
    case "👑 MIG Royale Official":
      return "👑 Welcome to MIG Royale! 🎉\n\nRed vs Blue — bet on a side or a hand type, the better Teen Patti hand wins. Type !start to play. Play responsibly! ✨";
    case "🎲 Ludo Bot Free":
      return "🆓 Welcome to Ludo Bot Free! 🎉\n\nSame Ludo — no coins needed. Type !start to open a table, !j to sit down (or tap a yard), add bots, then roll and race your tokens home. Play for fun! ✨";
    case "🎲 Ludo Bot Official":
      return "🎲 Welcome to the official Ludo room! 🎉\n\nOn behalf of the miGlife team — type !start to open a table, !j to sit down, then roll and race all 4 tokens home. First one home wins. Play responsibly! ✨";
    case "🎁 Gift Official":
      return "🎁 Welcome to the official Gift room! 🎉\n\nOn behalf of the miGlife team — join the official gift contests and enjoy! ✨";
  }
  if (OFFICIAL_COUNTRY_ROOMS.includes(roomName)) {
    return `🏷️ Welcome to the official ${roomName} room! 🎉\n\nOn behalf of the miGlife team — chat, connect and enjoy your time with fellow members from ${roomName}. Please be respectful and have fun! ✨`;
  }
  return LEGACY_DEFAULT_DESCRIPTION;
}

export function isAutoRoomDescription(roomName: string, stored: string): boolean {
  const t = stored.trim();
  if (!t || t === LEGACY_DEFAULT_DESCRIPTION.trim()) return true;
  if (!isOfficialRoomName(roomName)) return false;
  const n = roomName.trim().toLowerCase();
  const l = t.toLowerCase();
  return l === n || l === `${n} chat room` || l === `${n} room` || l === `${n} chat`;
}

export function resolveRoomDescription(roomName: string, stored: string): string {
  return isAutoRoomDescription(roomName, stored) ? officialRoomDefaultDescription(roomName) : stored.trim();
}

/**
 * This browser's own id in room_presence ("deviceId"), like the app's. One
 * account is in a room from ONE place only: entering from another phone /
 * browser closes the room on the old one ("has left"), then "has entered".
 * Tabs of the same browser share it (they are the same place).
 */
export function roomDeviceId(): string {
  try {
    const k = localStorage.getItem("migwith.roomDeviceId");
    if (k) return k;
    const v = "web_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    localStorage.setItem("migwith.roomDeviceId", v);
    return v;
  } catch {
    return (fallbackDeviceId ||= "web_" + Math.random().toString(36).slice(2, 14));
  }
}
let fallbackDeviceId = "";

export const ROOM_OPENED_ELSEWHERE = "You opened this room on another phone or browser, so it was closed here.";
