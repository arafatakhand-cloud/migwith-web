// 🏅 Achievement badges — the same list as the app's Achievements.kt
// (AchSeriesList) and ACH_SERIES in functions/index.js. Keep all three in sync.
//
// achievements/{uid} (written ONLY by Cloud Functions):
//   { messages, friends, rooms, giftsSent, …  (plain numbers)
//     badges: { "chat_1000": {earnedAt}, "gift_10": {earnedAt},
//               "event_<id>": {earnedAt, title, emoji}, … } }

/** Medal metals, poorest → richest (13): face gradient + ring. */
export const ACH_METALS: { face: string[]; ring: string }[] = [
  { face: ["#E3A474", "#B0673A"], ring: "#7A3E1C" }, // 0 copper
  { face: ["#E8B27A", "#9C5B2E"], ring: "#6B3A18" }, // 1 bronze
  { face: ["#F1F3F6", "#9EA7B3"], ring: "#5E6772" }, // 2 silver
  { face: ["#FFE680", "#D9A10B"], ring: "#8A5F00" }, // 3 gold
  { face: ["#BDF3EC", "#3FA99B"], ring: "#1C6158" }, // 4 platinum
  { face: ["#FF8FA8", "#C0123C"], ring: "#6E0A22" }, // 5 ruby
  { face: ["#E6F7FF", "#8FD3FF", "#C9A7FF"], ring: "#3B4C9E" }, // 6 diamond
  { face: ["#B9F6CA", "#1E9E55"], ring: "#0B5A2E" }, // 7 emerald
  { face: ["#9CC7FF", "#1F4FD1"], ring: "#0D2470" }, // 8 sapphire
  { face: ["#E2C4FF", "#7A2BD6"], ring: "#3E0F78" }, // 9 amethyst
  { face: ["#4A4A55", "#15151C", "#E0B040"], ring: "#E0B040" }, // 10 black-gold
  { face: ["#FF7A7A", "#FFD86B", "#7CE08A", "#6FB7FF", "#C08BFF"], ring: "#5A2A8C" }, // 11 rainbow
  { face: ["#1B0B3A", "#5B2BD8", "#FF4FD8", "#FFE27A"], ring: "#FFD24A" }, // 12 cosmic
];

export const EVENT_METAL = 11;

export type AchCategory = "SOCIAL" | "GIFT" | "GAMES" | "LEVEL" | "SPECIAL";
export const ACH_CATEGORIES: [AchCategory, string][] = [
  ["SOCIAL", "💬 Social"],
  ["GIFT", "🎁 Gift"],
  ["GAMES", "🎮 Games"],
  ["LEVEL", "⭐ Level & Time"],
  ["SPECIAL", "🍀 Special"],
];

export type AchSeries = {
  id: string;
  field: string;
  title: string;
  emoji: string;
  steps: number[];
  category: AchCategory;
  /** "%s" → the step number (1K, 10K …) */
  goal: string;
  soloMetal?: number;
  stepTitles?: string[];
};

const GIFT_STEPS = [1, 10, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
const GIFT_STEP_TITLES = [
  "First Gift", "Kind Heart", "Generous", "Gift Star", "Gift Hero", "Gift Royal", "Gift Legend",
  "Gift Master", "Gift Titan", "Gift Emperor", "Gift Mythic", "Gift Immortal", "Gift Supreme",
];
const GAME_COUNT = 7;

export const ACH_SERIES: AchSeries[] = [
  // 💬 Social
  { id: "chat", field: "messages", title: "Chatterbox", emoji: "💬", steps: [1000, 10000, 50000, 200000], category: "SOCIAL", goal: "Send %s messages in rooms" },
  { id: "friends", field: "friends", title: "Social Butterfly", emoji: "🦋", steps: [10, 50, 200, 500], category: "SOCIAL", goal: "Have %s friends" },
  { id: "rooms", field: "rooms", title: "Room Hopper", emoji: "🚪", steps: [10, 50, 100], category: "SOCIAL", goal: "Enter %s different rooms" },
  { id: "views", field: "views", title: "Popular", emoji: "👀", steps: [100, 1000, 10000], category: "SOCIAL", goal: "Get %s profile views" },
  { id: "votes", field: "votes", title: "Loved", emoji: "❤️", steps: [50, 500, 5000], category: "SOCIAL", goal: "Get %s votes" },
  { id: "night", field: "nightDays", title: "Night Owl", emoji: "🦉", steps: [100], category: "SOCIAL", goal: "Be active between 1 AM and 5 AM on %s days", soloMetal: 10 },
  // 🎁 Gift
  { id: "gift", field: "giftsSent", title: "Generous", emoji: "🎁", steps: GIFT_STEPS, category: "GIFT", goal: "Send %s gifts", stepTitles: GIFT_STEP_TITLES },
  { id: "recv", field: "giftsReceived", title: "Crowd Favorite", emoji: "💝", steps: GIFT_STEPS, category: "GIFT", goal: "Receive %s gifts" },
  { id: "spender", field: "coinsGifted", title: "Big Spender", emoji: "💰", steps: [1_000_000, 10_000_000], category: "GIFT", goal: "Send gifts worth %s coins in total" },
  { id: "shower", field: "showers", title: "Shower King", emoji: "🌧️", steps: [10, 100], category: "GIFT", goal: "Send %s gift showers" },
  { id: "contest", field: "contestWins", title: "Gift Contest Champion", emoji: "🏆", steps: [1], category: "GIFT", goal: "Win 1st place in a Gift Contest", soloMetal: 3 },
  // 🎮 Games
  { id: "luxury", field: "luxuryWins", title: "Lucky Star", emoji: "⭐", steps: [10, 100, 1000], category: "GAMES", goal: "Win %s Luxury rounds" },
  { id: "jackpot", field: "jackpots", title: "Jackpot", emoji: "💥", steps: [1], category: "GAMES", goal: "Win 1 lakh+ coins in one round", soloMetal: 5 },
  { id: "card", field: "cardWins", title: "Card Shark", emoji: "🃏", steps: [10, 100, 1000], category: "GAMES", goal: "Win %s LowCard / Teen Patti games" },
  { id: "ludo", field: "ludoWins", title: "Ludo Master", emoji: "🎲", steps: [10, 100, 1000], category: "GAMES", goal: "Win %s Ludo games" },
  { id: "cricket", field: "cricketWins", title: "Cricket Hero", emoji: "🏏", steps: [10, 100, 1000], category: "GAMES", goal: "Win %s Cricket games" },
  { id: "royale", field: "royaleWins", title: "Royale Legend", emoji: "👑", steps: [10, 100, 1000], category: "GAMES", goal: "Win %s MIG Royale rounds" },
  { id: "tn", field: "tnWins", title: "Twenty-Nine Pro", emoji: "♠️", steps: [10, 100, 1000], category: "GAMES", goal: "Win %s Twenty-Nine matches" },
  { id: "allround", field: "gamesPlayed", title: "All-Rounder", emoji: "🎯", steps: [GAME_COUNT], category: "GAMES", goal: `Play all ${GAME_COUNT} games at least once`, soloMetal: 9 },
  // ⭐ Level & time
  { id: "level", field: "level", title: "Rising Star", emoji: "🌟", steps: [10, 30, 50, 100], category: "LEVEL", goal: "Reach level %s" },
  { id: "loyal", field: "bestStreak", title: "Loyal", emoji: "📅", steps: [7, 30, 100, 365], category: "LEVEL", goal: "Open miglife %s days in a row" },
  { id: "veteran", field: "ageYears", title: "Veteran", emoji: "🎖️", steps: [1, 2, 3], category: "LEVEL", goal: "Account %s year(s) old" },
  { id: "early", field: "earlyBird", title: "Early Bird", emoji: "🐣", steps: [1], category: "LEVEL", goal: "One of the first 1000 members — can never be earned again", soloMetal: 12 },
  // 🍀 Special
  { id: "luckyuser", field: "luckyUser", title: "Lucky User", emoji: "🍀", steps: [1, 5, 20], category: "SPECIAL", goal: "Become Lucky User %s time(s)" },
  { id: "voucher", field: "vouchers", title: "Voucher Hunter", emoji: "🎟️", steps: [10, 100], category: "SPECIAL", goal: "Catch %s vouchers" },
  { id: "mentor", field: "isMentor", title: "Mentor's Pick", emoji: "🧑‍🏫", steps: [1], category: "SPECIAL", goal: "Be a Mentor", soloMetal: 8 },
  { id: "merchant", field: "isMerchant", title: "Merchant Pro", emoji: "🏪", steps: [1], category: "SPECIAL", goal: "Be a Merchant", soloMetal: 7 },
];

/** 1 · 10 · … · 1000 → "1K" · 10K · 1M */
export function achShort(n: number): string {
  if (n >= 1_000_000 && n % 1_000_000 === 0) return `${n / 1_000_000}M`;
  if (n >= 1_000 && n % 1_000 === 0) return `${n / 1_000}K`;
  return String(n);
}

export const achKey = (s: AchSeries, i: number) => `${s.id}_${s.steps[i]}`;
export function achMetal(s: AchSeries, i: number): number {
  if (s.steps.length === 1) return s.soloMetal ?? 3;
  if (s.steps.length === 13) return i;
  return 2 + Math.round((i * 10) / (s.steps.length - 1));
}
export const achStepTitle = (s: AchSeries, i: number) =>
  s.stepTitles?.[i] ?? (s.steps.length === 1 ? s.title : `${s.title} ${achShort(s.steps[i])}`);
export const achGoalText = (s: AchSeries, i: number) => s.goal.replace("%s", achShort(s.steps[i]));
export const achMedalLabel = (s: AchSeries, i: number) => (s.steps.length === 1 ? "★" : achShort(s.steps[i]));
export const ACH_TOTAL = ACH_SERIES.reduce((a, s) => a + s.steps.length, 0);

export type AchBadge = { key: string; earnedAt: number; title?: string; emoji?: string };
export type AchData = { numbers: Record<string, number>; badges: Record<string, AchBadge> };

export function parseAchievements(data: Record<string, unknown> | undefined): AchData {
  const numbers: Record<string, number> = {};
  const badges: Record<string, AchBadge> = {};
  for (const [k, v] of Object.entries(data || {})) if (typeof v === "number") numbers[k] = v;
  const raw = (data?.badges || {}) as Record<string, Record<string, unknown> | null>;
  for (const [k, v] of Object.entries(raw)) {
    badges[k] = {
      key: k,
      earnedAt: Number(v?.earnedAt || 0),
      title: typeof v?.title === "string" ? v.title : undefined,
      emoji: typeof v?.emoji === "string" ? v.emoji : undefined,
    };
  }
  return { numbers, badges };
}

export type EarnedMedal = { emoji: string; label: string; metal: number; earnedAt: number; title: string };

/** Every earned badge — richest metal first, then newest. */
export function earnedMedals(ach: AchData): EarnedMedal[] {
  const out: EarnedMedal[] = [];
  for (const s of ACH_SERIES) {
    s.steps.forEach((_, i) => {
      const b = ach.badges[achKey(s, i)];
      if (b) out.push({ emoji: s.emoji, label: achMedalLabel(s, i), metal: achMetal(s, i), earnedAt: b.earnedAt, title: achStepTitle(s, i) });
    });
  }
  for (const b of Object.values(ach.badges)) {
    if (b.key.startsWith("event_")) out.push({ emoji: b.emoji || "🎉", label: "", metal: EVENT_METAL, earnedAt: b.earnedAt, title: b.title || "Event" });
  }
  return out.sort((a, b) => b.metal - a.metal || b.earnedAt - a.earnedAt);
}

export type AchEvent = { id: string; title: string; emoji: string; startMs: number; endMs: number };
