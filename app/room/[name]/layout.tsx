import { OFFICIAL_COUNTRY_ROOMS, OFFICIAL_GAME_ROOMS } from "../../../lib/rooms";

// ⚡ Built once per name and then served from Vercel's cache (like the other
// pages), instead of being made again on a US server for every visit. The
// page itself is all in the browser (it reads the name from the address).
export const dynamicParams = true;

// ⚡ The official rooms are built with every deploy, so the first visit after
// an update is served at once (it used to wait 2–3 s for a US server to build
// the page — a swipe to the next tab then looked stuck). Any other room is
// still built on its first visit and cached.
export function generateStaticParams() {
  return [...OFFICIAL_COUNTRY_ROOMS, ...OFFICIAL_GAME_ROOMS, "🎰 Luxury Bet"].map((name) => ({ name }));
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
