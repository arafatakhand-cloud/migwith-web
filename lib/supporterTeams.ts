// ⚽ Supporter Colours (Discover › Supporter Colours): 25 football teams, the
// top 5 leagues × 5 teams. Fan colours only — the badge is a little JERSEY in
// the team's kit colours (stripes, sleeves, band …) + short name, never a club
// logo. Same list in the app
// (SupporterColours.kt) and the server (buySupporterColour).

export type SupporterTeam = {
  id: string;
  name: string;
  /** short name on the badge */
  short: string;
  /** the big letters behind a supporter's profile ("FCB", "LFC" …) */
  mark: string;
  league: string;
  /** name colour in rooms (readable on white) */
  text: string;
  /** jersey: body colour + second colour (stripes / sleeves / band / trim) */
  c1: string;
  c2: string;
  /** jersey pattern */
  kit: "solid" | "stripes" | "sleeves" | "band" | "diagonal";
};

export const SUPPORTER_PRICE = 50000;
export const SUPPORTER_DAYS = 30;

export const SUPPORTER_LEAGUES: { id: string; name: string; flag: string }[] = [
  { id: "epl", name: "Premier League", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: "laliga", name: "La Liga", flag: "🇪🇸" },
  { id: "seriea", name: "Serie A", flag: "🇮🇹" },
  { id: "bundesliga", name: "Bundesliga", flag: "🇩🇪" },
  { id: "ligue1", name: "Ligue 1", flag: "🇫🇷" },
];

export const SUPPORTER_TEAMS: SupporterTeam[] = [
  // Each league in last season's (2025-26) final table order.
  { id: "arsenal", mark: "AFC", name: "Arsenal", short: "ARS", league: "epl", text: "#EF0107", c1: "#EF0107", c2: "#FFFFFF", kit: "sleeves" },
  { id: "mancity", mark: "MCFC", name: "Manchester City", short: "MCI", league: "epl", text: "#4A9BD6", c1: "#6CABDD", c2: "#FFFFFF", kit: "solid" },
  { id: "manutd", mark: "MUFC", name: "Manchester United", short: "MUN", league: "epl", text: "#DA291C", c1: "#DA291C", c2: "#FFFFFF", kit: "solid" },
  { id: "liverpool", mark: "LFC", name: "Liverpool", short: "LIV", league: "epl", text: "#C8102E", c1: "#C8102E", c2: "#FFFFFF", kit: "solid" },
  { id: "chelsea", mark: "CFC", name: "Chelsea", short: "CHE", league: "epl", text: "#034694", c1: "#034694", c2: "#FFFFFF", kit: "solid" },
  { id: "barcelona", mark: "FCB", name: "Barcelona", short: "BAR", league: "laliga", text: "#A50044", c1: "#A50044", c2: "#004D98", kit: "stripes" },
  { id: "realmadrid", mark: "RMCF", name: "Real Madrid", short: "RMA", league: "laliga", text: "#C99A06", c1: "#FFFFFF", c2: "#FEBE10", kit: "solid" },
  { id: "atletico", mark: "ATM", name: "Atlético Madrid", short: "ATM", league: "laliga", text: "#CB3524", c1: "#CB3524", c2: "#FFFFFF", kit: "stripes" },
  { id: "valencia", mark: "VCF", name: "Valencia", short: "VAL", league: "laliga", text: "#E87500", c1: "#FFFFFF", c2: "#F18A00", kit: "solid" },
  { id: "sevilla", mark: "SFC", name: "Sevilla", short: "SEV", league: "laliga", text: "#D81920", c1: "#FFFFFF", c2: "#D81920", kit: "solid" },
  { id: "inter", mark: "INTER", name: "Inter", short: "INT", league: "seriea", text: "#0068A8", c1: "#0068A8", c2: "#1A1A1A", kit: "stripes" },
  { id: "napoli", mark: "SSCN", name: "Napoli", short: "NAP", league: "seriea", text: "#1295CC", c1: "#12A0D7", c2: "#FFFFFF", kit: "solid" },
  { id: "roma", mark: "ASR", name: "Roma", short: "ROM", league: "seriea", text: "#8E1F2F", c1: "#8E1F2F", c2: "#F0BC42", kit: "solid" },
  { id: "milan", mark: "ACM", name: "AC Milan", short: "MIL", league: "seriea", text: "#E00A0C", c1: "#FB090B", c2: "#1A1A1A", kit: "stripes" },
  { id: "juventus", mark: "JUVE", name: "Juventus", short: "JUV", league: "seriea", text: "#333333", c1: "#1A1A1A", c2: "#FFFFFF", kit: "stripes" },
  { id: "bayern", mark: "FCB", name: "Bayern München", short: "FCB", league: "bundesliga", text: "#DC052D", c1: "#DC052D", c2: "#FFFFFF", kit: "solid" },
  { id: "dortmund", mark: "BVB", name: "Borussia Dortmund", short: "BVB", league: "bundesliga", text: "#B89A00", c1: "#FDE100", c2: "#1A1A1A", kit: "solid" },
  { id: "leipzig", mark: "RBL", name: "RB Leipzig", short: "RBL", league: "bundesliga", text: "#DD0741", c1: "#FFFFFF", c2: "#DD0741", kit: "solid" },
  { id: "leverkusen", mark: "B04", name: "Bayer Leverkusen", short: "B04", league: "bundesliga", text: "#E32221", c1: "#E32221", c2: "#1A1A1A", kit: "sleeves" },
  { id: "frankfurt", mark: "SGE", name: "Eintracht Frankfurt", short: "SGE", league: "bundesliga", text: "#E1000F", c1: "#1A1A1A", c2: "#E1000F", kit: "solid" },
  { id: "psg", mark: "PSG", name: "Paris Saint-Germain", short: "PSG", league: "ligue1", text: "#004170", c1: "#004170", c2: "#DA291C", kit: "band" },
  { id: "lille", mark: "LOSC", name: "Lille", short: "LIL", league: "ligue1", text: "#24216A", c1: "#E01E13", c2: "#24216A", kit: "solid" },
  { id: "lyon", mark: "OL", name: "Lyon", short: "OL", league: "ligue1", text: "#14387F", c1: "#FFFFFF", c2: "#14387F", kit: "band" },
  { id: "marseille", mark: "OM", name: "Marseille", short: "OM", league: "ligue1", text: "#1E9BD7", c1: "#FFFFFF", c2: "#2FAEE0", kit: "solid" },
  { id: "monaco", mark: "ASM", name: "Monaco", short: "ASM", league: "ligue1", text: "#E7182A", c1: "#E7182A", c2: "#FFFFFF", kit: "diagonal" },
];

const BY_ID = new Map(SUPPORTER_TEAMS.map((t) => [t.id, t]));

/** The team someone supports right now (not expired), or null. */
export function activeSupporterTeam(teamId: unknown, until: unknown): SupporterTeam | null {
  const t = BY_ID.get(String(teamId || ""));
  return t && Number(until || 0) > Date.now() ? t : null;
}

export function supporterTeamById(id: string): SupporterTeam | null {
  return BY_ID.get(id) || null;
}

/** ⚽ The price and days miglife set (app_settings/shop_overrides.supporter),
 *  else the built-in 50,000 coins / 30 days. Live while the page is open. */
export function parseSupporterTerms(raw: unknown): { price: number; days: number } {
  const o = (raw && typeof raw === "object" ? raw : {}) as { price?: unknown; days?: unknown };
  const price = typeof o.price === "number" && Number.isInteger(o.price) && o.price >= 1000 ? o.price : SUPPORTER_PRICE;
  const days = typeof o.days === "number" && Number.isInteger(o.days) && o.days >= 1 && o.days <= 365 ? o.days : SUPPORTER_DAYS;
  return { price, days };
}

/** ⚽ Profile background: the team's two colours (a white kit colour is
 *  swapped for the team's text colour, so white writing stays readable). */
export function supporterBackground(t: SupporterTeam): string {
  const solid = (c: string) => (c.toUpperCase() === "#FFFFFF" ? t.text : c);
  return `linear-gradient(135deg, ${solid(t.c1)}, ${solid(t.c2)})`;
}
