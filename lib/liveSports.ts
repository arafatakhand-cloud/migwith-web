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

export type LiveSports = { updatedAtMs: number; day: string; cricket: SportRow[]; football: SportRow[] } | null;

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
      (d) =>
        setData({
          updatedAtMs: Number(d.get("updatedAtMs") || 0),
          day: String(d.get("day") || ""),
          cricket: rows(d.get("cricket"), "cricket"),
          football: rows(d.get("football"), "football"),
        }),
      () => setData({ updatedAtMs: 0, day: "", cricket: [], football: [] })
    );
  }, [enabled]);
  return data;
}

/** "8:30 PM" in Bangladesh time. */
export function dhakaTime(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" });
}
