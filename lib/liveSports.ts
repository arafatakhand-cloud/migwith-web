"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

// 📺 Live scores + today's schedule (cricket + football). The refreshLiveSports
// Cloud Function writes ONE doc, live_sports/today, every 10 minutes; the app
// and the website only read it (the API keys stay in functions/.env).

export type SportRow = {
  sport: "cricket" | "football";
  id: string;
  league: string;
  leagueLogo: string;
  format: string;
  home: string;
  away: string;
  homeShort: string;
  awayShort: string;
  homeLogo: string;
  awayLogo: string;
  homeScore: string;
  awayScore: string;
  status: "LIVE" | "UPCOMING" | "FINISHED" | "OFF";
  statusText: string;
  startMs: number;
  venue: string;
};

export type LiveSports = {
  updatedAtMs: number;
  day: string;
  cricket: SportRow[];
  football: SportRow[];
  /** Why a sport is empty (missing key, CricAPI limit, …), written by the server. */
  problems: { cricket?: string; football?: string };
  /** The live_sports/today doc exists (the server function has run at least once). */
  exists: boolean;
} | null;

function rows(v: unknown, sport: SportRow["sport"]): SportRow[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      sport,
      id: String(r.id || ""),
      league: String(r.league || ""),
      leagueLogo: String(r.leagueLogo || ""),
      format: String(r.format || ""),
      home: String(r.home || ""),
      away: String(r.away || ""),
      homeShort: String(r.homeShort || ""),
      awayShort: String(r.awayShort || ""),
      homeLogo: String(r.homeLogo || ""),
      awayLogo: String(r.awayLogo || ""),
      homeScore: String(r.homeScore || ""),
      awayScore: String(r.awayScore || ""),
      status: (["LIVE", "UPCOMING", "FINISHED", "OFF"].includes(String(r.status)) ? r.status : "UPCOMING") as SportRow["status"],
      statusText: String(r.statusText || ""),
      startMs: Number(r.startMs || 0),
      venue: String(r.venue || ""),
    }));
}

export function useLiveSports(enabled: boolean): LiveSports {
  const [data, setData] = useState<LiveSports>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, "live_sports", "today"),
      (d) => {
        const pr = d.get("problems");
        setData({
          updatedAtMs: Number(d.get("updatedAtMs") || 0),
          day: String(d.get("day") || ""),
          cricket: rows(d.get("cricket"), "cricket"),
          football: rows(d.get("football"), "football"),
          problems: {
            cricket: pr && typeof pr.cricket === "string" ? pr.cricket : undefined,
            football: pr && typeof pr.football === "string" ? pr.football : undefined,
          },
          exists: d.exists(),
        });
      },
      () => setData({ updatedAtMs: 0, day: "", cricket: [], football: [], problems: {}, exists: false })
    );
  }, [enabled]);
  return data;
}

/** "8:30 PM" in Bangladesh time. */
export function dhakaTime(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" });
}

/** "08:30 PM" in Bangladesh time, like the app's lsTime ("--:--" when unknown). */
export function lsTime(ms: number): string {
  if (!ms) return "--:--";
  return new Date(ms).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Dhaka" });
}

/** "Updated 5 min ago". */
export function lsAgo(ms: number, now: number): string {
  if (!ms) return "";
  const mins = Math.max(0, Math.floor((now - ms) / 60_000));
  if (mins < 1) return "Updated just now";
  if (mins < 60) return `Updated ${mins} min ago`;
  return `Updated ${Math.floor(mins / 60)} h ago`;
}

/** Home: live matches first (up to 6); if none, the next ones that start today (up to 4). */
export function lsHighlights(rows: SportRow[], now: number): SportRow[] {
  const live = rows.filter((r) => r.status === "LIVE");
  if (live.length) return live.slice(0, 6);
  return rows
    .filter((r) => r.status === "UPCOMING" && r.startMs >= now - 30 * 60_000)
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, 4);
}

export function lsShortName(full: string, short: string): string {
  return short || (full.length <= 12 ? full : full.slice(0, 11) + "…");
}
