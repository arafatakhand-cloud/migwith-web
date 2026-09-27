"use client";

import { useEffect, useRef, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { isMainFounderName } from "./founder";

// Name colours in room chat, the app's roomRoleColor + Color Shop rule:
// Lucky User pink while it lasts; Admin / Staff / Mentor / Merchant always
// their role colour; everyone else (migwith and founders included) the
// colour of their active Color Shop colour, else normal blue.

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
    default:
      return USER_BLUE;
  }
}

type Profile = { role: string; shopColor: string | null; luckyUntil: number };

// Shared by every room, so switching rooms shows the right colours at once.
const cache = new Map<string, Profile>();

function colorFor(name: string, p: Profile | undefined): string {
  if (!p) return USER_BLUE;
  if (p.luckyUntil > Date.now()) return LUCKY_PINK;
  if (isMainFounderName(name) || ["owner", "ceo", "executive", "executive_board"].includes(p.role)) {
    return p.shopColor || USER_BLUE;
  }
  if (["admin", "administrator", "superadmin", "staff", "mentor", "merchant"].includes(p.role)) {
    return roleColor(p.role);
  }
  return p.shopColor || roleColor(p.role);
}

/** lowercase name → CSS colour, for everyone named in `names`. */
export function useSenderColors(names: string[]): (name: string) => string {
  const [, setTick] = useState(0);
  const asked = useRef(new Set<string>());
  const key = Array.from(new Set(names.map((n) => n.trim()).filter((n) => n && n.length <= 30)))
    .sort()
    .join("|");

  useEffect(() => {
    const missing = key
      .split("|")
      .filter((n) => n && !cache.has(n.toLowerCase()) && !asked.current.has(n.toLowerCase()))
      .slice(0, 200);
    if (missing.length === 0) return;
    missing.forEach((n) => asked.current.add(n.toLowerCase()));
    let cancelled = false;
    (async () => {
      for (let i = 0; i < missing.length; i += 10) {
        const chunk = missing.slice(i, i + 10);
        try {
          const snap = await getDocs(query(collection(db, "users"), where("username", "in", chunk)));
          const now = Date.now();
          snap.docs.forEach((d) => {
            const name = String(d.get("username") || "").trim();
            if (!name) return;
            const role = String(d.get("membershipRole") || d.get("memberType") || d.get("role") || "user")
              .trim()
              .toLowerCase()
              .replace(/[- ]/g, "_");
            let shopColor: string | null = null;
            const activeId = String(d.get("activeColorId") || "");
            const owned = d.get("ownedColors") as Record<string, { active?: boolean; expiresAt?: number }> | undefined;
            const entry = activeId ? owned?.[activeId] : undefined;
            if (entry?.active === true && Number(entry.expiresAt || 0) > now) shopColor = SHOP_TEXT_COLORS[activeId] || null;
            cache.set(name.toLowerCase(), { role, shopColor, luckyUntil: Number(d.get("luckyUntil") || 0) });
          });
        } catch {
          // not marked as fetched: tried again next time
          chunk.forEach((n) => asked.current.delete(n.toLowerCase()));
        }
      }
      if (!cancelled) setTick((t) => t + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return (name: string) => {
    const k = name.trim().toLowerCase();
    return colorFor(k, cache.get(k));
  };
}
