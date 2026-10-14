// ⚽ Supporter Colours (Discover › Supporter Colours): 25 football teams, the
// top 5 leagues × 5 teams. Fan colours only — miGlife's own little badge (team
// colours + short name), never a club logo. Same list in the app
// (SupporterColours.kt) and the server (buySupporterColour).

export type SupporterTeam = {
  id: string;
  name: string;
  /** short name on the badge */
  short: string;
  league: string;
  /** name colour in rooms (readable on white) */
  text: string;
  /** badge colours (left → right) */
  c1: string;
  c2: string;
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
  { id: "manutd", name: "Manchester United", short: "MUN", league: "epl", text: "#DA291C", c1: "#DA291C", c2: "#FBE122" },
  { id: "liverpool", name: "Liverpool", short: "LIV", league: "epl", text: "#C8102E", c1: "#C8102E", c2: "#00B2A9" },
  { id: "arsenal", name: "Arsenal", short: "ARS", league: "epl", text: "#EF0107", c1: "#EF0107", c2: "#063672" },
  { id: "chelsea", name: "Chelsea", short: "CHE", league: "epl", text: "#034694", c1: "#034694", c2: "#DBA111" },
  { id: "mancity", name: "Manchester City", short: "MCI", league: "epl", text: "#4A9BD6", c1: "#6CABDD", c2: "#1C2C5B" },
  { id: "realmadrid", name: "Real Madrid", short: "RMA", league: "laliga", text: "#C99A06", c1: "#FEBE10", c2: "#00529F" },
  { id: "barcelona", name: "Barcelona", short: "BAR", league: "laliga", text: "#A50044", c1: "#A50044", c2: "#004D98" },
  { id: "atletico", name: "Atlético Madrid", short: "ATM", league: "laliga", text: "#CB3524", c1: "#CB3524", c2: "#272E61" },
  { id: "sevilla", name: "Sevilla", short: "SEV", league: "laliga", text: "#D81920", c1: "#D81920", c2: "#8A0E12" },
  { id: "valencia", name: "Valencia", short: "VAL", league: "laliga", text: "#E87500", c1: "#F18A00", c2: "#1A1A1A" },
  { id: "juventus", name: "Juventus", short: "JUV", league: "seriea", text: "#333333", c1: "#1A1A1A", c2: "#8C8C8C" },
  { id: "milan", name: "AC Milan", short: "MIL", league: "seriea", text: "#E00A0C", c1: "#FB090B", c2: "#1A1A1A" },
  { id: "inter", name: "Inter", short: "INT", league: "seriea", text: "#0068A8", c1: "#0068A8", c2: "#1A1A1A" },
  { id: "napoli", name: "Napoli", short: "NAP", league: "seriea", text: "#1295CC", c1: "#12A0D7", c2: "#003C82" },
  { id: "roma", name: "Roma", short: "ROM", league: "seriea", text: "#8E1F2F", c1: "#8E1F2F", c2: "#F0BC42" },
  { id: "bayern", name: "Bayern München", short: "FCB", league: "bundesliga", text: "#DC052D", c1: "#DC052D", c2: "#0066B2" },
  { id: "dortmund", name: "Borussia Dortmund", short: "BVB", league: "bundesliga", text: "#B89A00", c1: "#FDE100", c2: "#1A1A1A" },
  { id: "leverkusen", name: "Bayer Leverkusen", short: "B04", league: "bundesliga", text: "#E32221", c1: "#E32221", c2: "#1A1A1A" },
  { id: "leipzig", name: "RB Leipzig", short: "RBL", league: "bundesliga", text: "#DD0741", c1: "#DD0741", c2: "#001F47" },
  { id: "frankfurt", name: "Eintracht Frankfurt", short: "SGE", league: "bundesliga", text: "#E1000F", c1: "#E1000F", c2: "#1A1A1A" },
  { id: "psg", name: "Paris Saint-Germain", short: "PSG", league: "ligue1", text: "#004170", c1: "#004170", c2: "#DA291C" },
  { id: "marseille", name: "Marseille", short: "OM", league: "ligue1", text: "#1E9BD7", c1: "#2FAEE0", c2: "#0B3A5C" },
  { id: "lyon", name: "Lyon", short: "OL", league: "ligue1", text: "#14387F", c1: "#14387F", c2: "#DA0812" },
  { id: "monaco", name: "Monaco", short: "ASM", league: "ligue1", text: "#E7182A", c1: "#E7182A", c2: "#9E0F1C" },
  { id: "lille", name: "Lille", short: "LIL", league: "ligue1", text: "#24216A", c1: "#E01E13", c2: "#24216A" },
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
