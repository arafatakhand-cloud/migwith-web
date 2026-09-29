// Room names and presence helpers shared with the MIGlife Android app.
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

// Same text as formatPresenceLine() in the app: "Room: name [12] 🎓 💎 has
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

/** Every Color Shop badge the user owns that has not expired, oldest first (the app's activeShopBadges). */
export function activeShopBadges(ownedColors: unknown): string[] {
  if (!ownedColors || typeof ownedColors !== "object") return [];
  const owned = ownedColors as Record<string, { expiresAt?: unknown; grantedAt?: unknown } | undefined>;
  const now = Date.now();
  return SHOP_BADGES.flatMap(([id, badge]) => {
    const e = owned[id];
    const expiresAt = Number(e?.expiresAt || 0);
    return e && expiresAt > now ? [{ at: Number(e.grantedAt || 0), badge }] : [];
  })
    .sort((a, b) => a.at - b.at)
    .map((x) => x.badge);
}

// Badge emoji -> app_settings/badge_images key (the app's BADGE_EMOJI_TO_ROLE_KEY):
// every Color Shop badge by its colour id, every role badge by its role key.
export const BADGE_EMOJI_TO_KEY: [string, string][] = [
  ...SHOP_BADGES.map(([id, badge]) => [badge, id] as [string, string]),
  ["🎓", "MENTOR"],
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
    case "mentor": return ["🎓"];
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

const isOfficialRoomName = (name: string) =>
  name === "🎰 Luxury Bet" || OFFICIAL_GAME_ROOMS.includes(name) || OFFICIAL_COUNTRY_ROOMS.includes(name);

function officialRoomDefaultDescription(roomName: string): string {
  switch (roomName) {
    case "👻 Luxury Bot Official":
      return "🎲 Welcome to the official Luxury Bot room! 🎉\n\nOn behalf of the miglife team — place your bets, enjoy the game, and play responsibly. ✨";
    case "🎰 Luxury Bet":
      return "🎰 Welcome to Luxury Bet! 🎉\n\nType !start to open a round, then tap a character twice (or !b k 1000) to bet on King, Queen, Jax, Max, Toto or Zozo. Play responsibly! ✨";
    case "🃏 LowCard Official":
      return "🃏 Welcome to the official LowCard room! 🎉\n\nOn behalf of the miglife team — join a game, draw your card, and play responsibly. ✨";
    case "🏏 Cricket Official":
      return "🏏 Welcome to the official Cricket room! 🎉\n\nOn behalf of the miglife team — type !start to start a game, !j to join and !d to bat. Highest run scorer wins. Play responsibly! ✨";
    case "🎴 Teen Patti Official":
      return "🎴 Welcome to the official Teen Patti room! 🎉\n\nOn behalf of the miglife team — type !start to open a table, !j to sit down, then play blind or see your cards. Best hand wins. Play responsibly! ✨";
    case "🃏 29 Official":
      return "🃏 Welcome to 29! 🎉\n\n4 players, 2 teams — bid, hide your trump and win the tricks. Empty seats get bots. Type !start to open a table. Play responsibly! ✨";
    case "👑 MIG Royale Official":
      return "👑 Welcome to MIG Royale! 🎉\n\nRed vs Blue — bet on a side or a hand type, the better Teen Patti hand wins. Type !start to play. Play responsibly! ✨";
    case "🎲 Ludo Bot Official":
      return "🎲 Welcome to the official Ludo room! 🎉\n\nOn behalf of the miglife team — type !start to open a table, !j to sit down, then roll and race all 4 tokens home. First one home wins. Play responsibly! ✨";
    case "🎁 Gift Official":
      return "🎁 Welcome to the official Gift room! 🎉\n\nOn behalf of the miglife team — join the official gift contests and enjoy! ✨";
  }
  if (OFFICIAL_COUNTRY_ROOMS.includes(roomName)) {
    return `🏷️ Welcome to the official ${roomName} room! 🎉\n\nOn behalf of the miglife team — chat, connect and enjoy your time with fellow members from ${roomName}. Please be respectful and have fun! ✨`;
  }
  return LEGACY_DEFAULT_DESCRIPTION;
}

function isAutoRoomDescription(roomName: string, stored: string): boolean {
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
