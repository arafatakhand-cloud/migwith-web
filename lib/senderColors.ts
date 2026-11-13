"use client";

import { useEffect, useRef, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";
import { isMainFounderName } from "./founder";
import { activeSupporterTeam, type SupporterTeam } from "./supporterTeams";

// Name colours in room chat, the app's roomRoleColor + Color Shop rule:
// Lucky User pink while it lasts; Admin / Staff / Mentor / Merchant always
// their role colour; everyone else (migwith and founders included) the
// colour of their active Color Shop colour
// team colour, else normal blue.

export const SHOP_TEXT_COLORS: Record<string, string> = {
  king: "#12AFC7",
  queen: "#E91E8C",
  mafia: "#8B5A5A",
  vip: "#00A383", // ⭐ Star: emerald (the old red-pink looked like Mentor red)
  diamond: "#12AFC7",
  premium: "#8BC34A",
  supporter: "#29B6F6",
  streamer: "#C2185B",
};

const LUCKY_PINK = "#FF4FA3";
/** 🍀 Lucky User who is a Male: orange (Female stays pink). */
const LUCKY_MALE_ORANGE = "#FB8C00";
// 🍀 Pink only for someone whose profile says Female. A profile with no gender
// saved shows "Male" (the profile's default), so it gets the male orange too —
// before, an empty gender counted as female and many men turned pink.
const isFemale = (g?: string) => ["female", "f", "woman", "girl", "মহিলা", "নারী"].includes((g || "").trim().toLowerCase());
/** 🌍 Country Representative: brown-gold name + a 🌍 badge (like the app). */
export const COUNTRY_REP_COLOR = "#9E6011";
export const COUNTRY_REP_BADGE = "🌍";
const ROLE_ALIASES: Record<string, string> = { countryrep: "country_representative", country_rep: "country_representative" };
const USER_BLUE = "#3984D9";

function roleColor(role: string): string {
  switch (role) {
    case "admin":
    case "administrator":
    case "superadmin":
      return "#FFD600";
    case "staff":
      return "#25A60D"; // Staff = deep green, same as the app (the neon one was hard to read);
    case "mentor":
      return "#FF1744";
    case "merchant":
      return "#9C27B0";
    case "elite":
    case "elite_user":
      return "#00E5FF";
    case "country_representative":
      return COUNTRY_REP_COLOR;
    default:
      return USER_BLUE;
  }
}

type Profile = { role: string; shopColor: string | null; luckyUntil: number; supporter?: string; supporterUntil?: number; photo?: string; gender?: string };

// Shared by every room, so switching rooms shows the right colours at once.
const cache = new Map<string, Profile>();

// Also kept on this device, so after a reload (e.g. a language switch) every
// name has its right colour AT ONCE — no blue first. Refreshed by the lookups.
const STORE_KEY = "migwith.senderColors";
const STORE_MAX_AGE = 30 * 86_400_000; // a month: names keep their colour even after days away
const savedAt = new Map<string, number>();
(() => {
  if (typeof window === "undefined") return;
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") as Record<string, Profile & { at: number }>;
    const now = Date.now();
    for (const [k, v] of Object.entries(saved)) {
      if (!v || now - (v.at || 0) >= STORE_MAX_AGE) continue;
      cache.set(k, { role: v.role, shopColor: v.shopColor, luckyUntil: v.luckyUntil, supporter: v.supporter, supporterUntil: v.supporterUntil, photo: v.photo, gender: v.gender });
      savedAt.set(k, v.at);
    }
  } catch {}
})();
// Looked up in THIS page load (the saved ones are shown at once, then checked again).
const fresh = new Set<string>();
function persist() {
  try {
    const now = Date.now();
    const out: Record<string, Profile & { at: number }> = {};
    const entries = Array.from(cache.entries()).slice(-1500);
    for (const [k, v] of entries) out[k] = { ...v, at: savedAt.get(k) ?? now };
    localStorage.setItem(STORE_KEY, JSON.stringify(out));
  } catch {}
}

// 🍀 Lucky User pink lasts 3 hours (LUCKY_PINK_MS on the server), so it began 3 h before luckyUntil.
const LUCKY_PINK_MS = 3 * 60 * 60 * 1000;

// 🍀 Every Lucky User announcement in the room's chat (name → start times). A line
// written inside one of those 3-hour windows stays pink, even after someone else
// becomes Lucky User; lines outside them are the person's normal colour.
const luckyHistory = new Map<string, number[]>();
export function noteLuckyAnnouncements(lines: { text: string; createdAtMs: number }[]) {
  for (const l of lines) {
    const m = /Congratulations (.+?)! You are the Lucky User/i.exec(l.text);
    if (!m || !l.createdAtMs) continue;
    const k = m[1].trim().toLowerCase();
    const starts = luckyHistory.get(k) ?? [];
    if (!starts.includes(l.createdAtMs)) starts.push(l.createdAtMs);
    luckyHistory.set(k, starts);
  }
}
function wasLuckyAt(name: string, atMs: number): boolean {
  const starts = luckyHistory.get(name.trim().toLowerCase());
  return !!starts && starts.some((s) => atMs >= s && atMs < s + LUCKY_PINK_MS);
}

function colorFor(name: string, p: Profile | undefined, atMs?: number): string {
  // a line inside one of this person's lucky windows is pink (orange for a male);
  // with no line time, pink only while they are Lucky User now
  const lucky = atMs !== undefined ? wasLuckyAt(name, atMs) : !!p && p.luckyUntil > Date.now();
  if (lucky)
    return isFemale(p?.gender) ? LUCKY_PINK : LUCKY_MALE_ORANGE;
  if (!p) return USER_BLUE;
  if (isMainFounderName(name) || ["owner", "ceo", "executive", "executive_board"].includes(p.role)) {
    return p.shopColor || USER_BLUE;
  }
  if (["admin", "administrator", "superadmin", "staff", "mentor", "merchant", "country_representative"].includes(p.role)) {
    return roleColor(p.role);
  }
  // ⚽ Supporter Colours no longer colour the name in chat — the team shows
  // as a badge on "has entered / has left", the people list and the profile.
  return p.shopColor || roleColor(p.role);
}

function supporterOf(p: Profile | undefined): SupporterTeam | null {
  return p ? activeSupporterTeam(p.supporter, p.supporterUntil) : null;
}

/** ⚽ The football team this name supports right now (after useSenderColors
 *  fetched it), for the little badge next to the name; null if none. */
export function supporterTeamOf(name: string): SupporterTeam | null {
  return supporterOf(cache.get(name.trim().toLowerCase()));
}

/** The role looked up for a name (after useSenderColors fetched it), or "". */
/** 📷 The profile photo of a name (after useSenderColors looked it up), or "". */
export function cachedPhotoOf(name: string): string {
  return cache.get(name.trim().toLowerCase())?.photo || "";
}

export function cachedRoleOf(name: string): string {
  return cache.get(name.trim().toLowerCase())?.role || "";
}

// when each name was last looked up (this page load)
const lookedUpAt = new Map<string, number>();
// 🍀 Lucky Users already looked up again
const forced = new Set<string>();

/** lowercase name → CSS colour, for everyone named in `names`.
 *  `hot`: names to look up again when their last lookup is over a minute old —
 *  the people who just talked and a new 🍀 Lucky User (miglife: "anima became
 *  Lucky User but stayed blue", "a new Style Studio colour didn't show") —
 *  instead of waiting for the 5-minute refresh. */
export function useSenderColors(names: string[], hot: string[] = []): (name: string, atMs?: number) => string {
  const [, setTick] = useState(0);
  // Bumped to try again after a failed lookup (5 s) and to refresh everyone
  // every 5 minutes, so a new role / colour shows without reopening (like the app).
  const [round, setRound] = useState(0);
  const asked = useRef(new Set<string>());
  const refreshAll = useRef(false);
  const key = Array.from(new Set(names.map((n) => n.trim()).filter((n) => n && n.length <= 30)))
    .sort()
    .join("|");
  const hotKey = hot.map((n) => n.trim().toLowerCase()).filter((n) => n && n.length <= 31).join("|");
  useEffect(() => {
    if (!hotKey) return;
    const now = Date.now();
    let stale = false;
    for (const raw of hotKey.split("|")) {
      const force = raw.startsWith("!");
      const n = force ? raw.slice(1) : raw;
      if (!n) continue;
      if (force) {
        if (forced.has(n)) continue;
        forced.add(n);
        fresh.delete(n);
        asked.current.delete(n);
        stale = true;
        // once more a few seconds later, in case the pink time was written just after the line
        setTimeout(() => {
          fresh.delete(n);
          asked.current.delete(n);
          setRound((r) => r + 1);
        }, 5000);
        continue;
      }
      const at = lookedUpAt.get(n);
      if (at !== undefined && now - at > 60_000) {
        fresh.delete(n);
        asked.current.delete(n);
        lookedUpAt.set(n, now); // once a minute at most
        stale = true;
      }
    }
    if (stale) setRound((r) => r + 1);
  }, [hotKey]);

  useEffect(() => {
    const t = setInterval(() => {
      asked.current.clear();
      refreshAll.current = true;
      setRound((r) => r + 1);
    }, 300_000);
    return () => clearInterval(t);
  }, []);

  // Right after a reload the login isn't back yet and the lookup would be
  // refused — wait for it, then look up.
  const [signedIn, setSignedIn] = useState(() => !!auth.currentUser);
  useEffect(() => onAuthStateChanged(auth, (u) => setSignedIn(!!u)), []);

  useEffect(() => {
    if (!signedIn) return;
    const all = refreshAll.current;
    refreshAll.current = false;
    const missing = key
      .split("|")
      .filter((n) => n && (all || !fresh.has(n.toLowerCase())) && !asked.current.has(n.toLowerCase()))
      .slice(0, 200);
    if (missing.length === 0) return;
    missing.forEach((n) => asked.current.add(n.toLowerCase()));
    let cancelled = false;
    let failed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      for (let i = 0; i < missing.length; i += 10) {
        const chunk = missing.slice(i, i + 10);
        try {
          const snap = await getDocs(query(collection(db, "users"), where("username", "in", chunk)));
          const now = Date.now();
          snap.docs.forEach((d) => {
            const name = String(d.get("username") || "").trim();
            if (!name) return;
            const rawRole = String(d.get("membershipRole") || d.get("memberType") || d.get("role") || "user")
              .trim()
              .toLowerCase()
              .replace(/[- ]/g, "_");
            const role = ROLE_ALIASES[rawRole] || rawRole;
            let shopColor: string | null = null;
            const activeId = String(d.get("activeColorId") || "");
            const owned = d.get("ownedColors") as Record<string, { active?: boolean; expiresAt?: number }> | undefined;
            const entry = activeId ? owned?.[activeId] : undefined;
            if (entry?.active === true && Number(entry.expiresAt || 0) > now) shopColor = SHOP_TEXT_COLORS[activeId] || null;
            cache.set(name.toLowerCase(), {
              role,
              shopColor,
              luckyUntil: Number(d.get("luckyUntil") || 0),
              supporter: String(d.get("supporterTeam") || ""),
              supporterUntil: Number(d.get("supporterUntil") || 0),
              photo: String(d.get("photoUrl") || ""),
              gender: String(d.get("gender") || ""),
            });
            savedAt.set(name.toLowerCase(), now);
            lookedUpAt.set(name.toLowerCase(), now);
            fresh.add(name.toLowerCase());
          });
        } catch {
          // not marked as fetched: tried again in a few seconds (it used to wait
          // for a new name in the chat, so a role colour could stay blue)
          chunk.forEach((n) => asked.current.delete(n.toLowerCase()));
          failed = true;
        }
      }
      persist();
      if (!cancelled) setTick((t) => t + 1);
      if (!cancelled && failed) retry = setTimeout(() => setRound((r) => r + 1), 5000);
    })();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [key, round, signedIn]);

  /** atMs: when the chat line was written (keeps the pre-Lucky colour on older lines). */
  return (name: string, atMs?: number) => {
    const k = name.trim().toLowerCase();
    return colorFor(k, cache.get(k), atMs);
  };
}

/** 🍀 The Lucky User's name colour: orange for a male, pink for a female. */
export function luckyColorOf(name: string): string {
  const p = cache.get(name.trim().toLowerCase());
  return isFemale(p?.gender) ? LUCKY_PINK : LUCKY_MALE_ORANGE;
}

/** A name's own colour WITHOUT the Lucky User rule (for a reply quote of an older line). */
export function nameColorWithoutLucky(name: string): string {
  const p = cache.get(name.trim().toLowerCase());
  return colorFor(name, p ? { ...p, luckyUntil: 0 } : undefined);
}

