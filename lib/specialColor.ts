"use client";

import { useEffect, useSyncExternalStore } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { isMainFounderName } from "./founder";

// 👑 VIP SUBSCRIPTION — miglife's moving rainbow name, paid in 🪙 COINS (like
// the app's SpecialColor.kt). Choose → Apply → Approve (Cloud Functions
// specialColorApply / founderSpecialColor): nothing is cut when applying; when
// miglife approves, the plan's coins are cut. Rejected = nothing is cut.
// special_colors/{uid} = { username, usernameLower, until (ms), style 1-5 }.

export const VIP_PLANS = [1, 3, 6, 12];
/** Coin price per plan until miglife sets app_settings/special_color.coinPlans. */
export const VIP_DEFAULT_COIN_PLANS: Record<number, number> = { 1: 500_000, 3: 1_400_000, 6: 2_500_000, 12: 4_500_000 };
/** The saved plan prices (months → coins), defaults for any missing one. */
export function vipCoinPlans(raw: unknown): Record<number, number> {
  const m = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<number, number> = {};
  for (const k of VIP_PLANS) {
    const v = Math.floor(Number(m[k] ?? m[String(k)]));
    out[k] = v > 0 ? v : VIP_DEFAULT_COIN_PLANS[k];
  }
  return out;
}
export const vipPlanLabel = (months: number) => (months === 12 ? "1 year" : `${months} month${months > 1 ? "s" : ""}`);
export const SPECIAL_COLOR_SLOTS = 5;
export const coins = (n: number) => Math.floor(n).toLocaleString("en-US");
/** 1,400,000 → "14L", 25,000,000 → "2.5Cr" (like the app) */
export function coinsShort(n: number): string {
  const f = (v: number, u: string) => `${v.toFixed(1).replace(/\.0$/, "")}${u}`;
  if (n >= 10_000_000) return f(n / 10_000_000, "Cr");
  if (n >= 100_000) return f(n / 100_000, "L");
  if (n >= 1_000) return f(n / 1_000, "K");
  return String(n);
}
/** The 5 animations (style 1-5); miglife keeps the original rainbow (style 0). */
export const SPECIAL_COLOR_STYLE_NAMES = [
  "Original Rainbow",
  "🌈 Rainbow Wave",
  "💡 Neon Flash",
  "🍬 Candy Pastel",
  "🔥 Fire & Ice",
  "✨ Gold Sparkle",
];

type Holders = { until: Map<string, number>; style: Map<string, number> };
let holders: Holders = { until: new Map(), style: new Map() };
const subs = new Set<() => void>();
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

/** Who has the rainbow name right now. Started once for the whole site (AppSession). */
export function useSpecialColorListener(uid: string | undefined) {
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, "special_colors"), where("until", ">", Date.now())),
      (snap) => {
        const until = new Map<string, number>();
        const style = new Map<string, number>();
        snap.docs.forEach((d) => {
          const name = String(d.get("usernameLower") || d.get("username") || "").trim().toLowerCase();
          if (!name) return;
          until.set(name, Number(d.get("until") || 0));
          style.set(name, Number(d.get("style") || 1));
        });
        holders = { until, style };
        subs.forEach((f) => f());
      },
      () => {}
    );
  }, [uid]);
}

const key = (name?: string | null) => (name || "").trim().toLowerCase();

export function specialColorHas(h: Holders, name?: string | null): boolean {
  const n = key(name);
  if (!n) return false;
  if (isMainFounderName(n)) return true;
  return (h.until.get(n) || 0) > Date.now();
}

/** 0 = miglife's original rainbow, 1-5 = the buyer's own animation. */
export function specialColorStyle(h: Holders, name?: string | null): number {
  const n = key(name);
  if (isMainFounderName(n)) return 0;
  return h.style.get(n) ?? 1;
}

export function useSpecialColors() {
  const h = useSyncExternalStore(subscribe, () => holders, () => holders);
  return {
    has: (name?: string | null) => specialColorHas(h, name),
    styleOf: (name?: string | null) => specialColorStyle(h, name),
    /** Styles (1-5) held by people whose colour is on right now. */
    takenStyles: (exceptName?: string) => {
      const now = Date.now();
      const skip = key(exceptName);
      const out = new Set<number>();
      h.until.forEach((u, n) => {
        if (u > now && n !== skip && !isMainFounderName(n)) {
          const st = h.style.get(n);
          if (st) out.add(st);
        }
      });
      return out;
    },
    activeCount: () => {
      const now = Date.now();
      let c = 0;
      h.until.forEach((u, n) => {
        if (u > now && !isMainFounderName(n)) c++;
      });
      return c;
    },
  };
}
