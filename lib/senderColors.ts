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
  vip: "#E5395C",
  diamond: "#12AFC7",
  premium: "#8BC34A",
  supporter: "#29B6F6",
  streamer: "#C2185B",
};

const LUCKY_PINK = "#FF4FA3";
/** 🌍 Country Representative: brown-gold name + a 🌍 badge (like the app). */
export const COUNTRY_REP_COLOR = "#B58A70";
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
      return "#39FF14";
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

type Profile = { role: string; shopColor: string | null; luckyUntil: number; supporter?: string; supporterUntil?: number };

// Shared by every room, so switching rooms shows the right colours at once.
const cache = new Map<string, Profile>();

// Also kept on this device, so after a reload (e.g. a language switch) every
// name has its right colour AT ONCE — no blue first. Refreshed by the lookups.
const STORE_KEY = "migwith.senderColors";
const STORE_MAX_AGE = 3 * 86_400_000;
const savedAt = new Map<string, number>();
(() => {
  if (typeof window === "undefined") return;
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") as Record<string, Profile & { at: number }>;
    const now = Date.now();
    for (const [k, v] of Object.entries(saved)) {
      if (!v || now - (v.at || 0) >= STORE_MAX_AGE) continue;
      cache.set(k, { role: v.role, shopColor: v.shopColor, luckyUntil: v.luckyUntil, supporter: v.supporter, supporterUntil: v.supporterUntil });
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
    const entries = Array.from(cache.entries()).slice(-500);
    for (const [k, v] of entries) out[k] = { ...v, at: savedAt.get(k) ?? now };
    localStorage.setItem(STORE_KEY, JSON.stringify(out));
  } catch {}
}

function colorFor(name: string, p: Profile | undefined): string {
  if (!p) return USER_BLUE;
  if (p.luckyUntil > Date.now()) return LUCKY_PINK;
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
export function cachedRoleOf(name: string): string {
  return cache.get(name.trim().toLowerCase())?.role || "";
}

/** lowercase name → CSS colour, for everyone named in `names`. */
export function useSenderColors(names: string[]): (name: string) => string {
  const [, setTick] = useState(0);
  // Bumped to try again after a failed lookup (5 s) and to refresh everyone
  // every 5 minutes, so a new role / colour shows without reopening (like the app).
  const [round, setRound] = useState(0);
  const asked = useRef(new Set<string>());
  const refreshAll = useRef(false);
  const key = Array.from(new Set(names.map((n) => n.trim()).filter((n) => n && n.length <= 30)))
    .sort()
    .join("|");

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
            });
            savedAt.set(name.toLowerCase(), now);
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

  return (name: string) => {
    const k = name.trim().toLowerCase();
    return colorFor(k, cache.get(k));
  };
}
