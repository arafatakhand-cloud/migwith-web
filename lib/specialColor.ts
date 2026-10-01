"use client";

import { useEffect, useSyncExternalStore } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { isMainFounderName } from "./founder";

// 👑 VIP SUBSCRIPTION — miglife's moving rainbow name (1 mo $49 · 3 mo $139 ·
// 6 mo $249 · 1 year $399), like the app's SpecialColor.kt. Apply → Payment → Approve (Cloud Functions
// specialColorApply / founderSpecialColor).
// special_colors/{uid} = { username, usernameLower, until (ms), style 1-5 }.

export const SPECIAL_COLOR_USD = 49; // 1 month
/** 👑 VIP Subscription plans: months → USD (same as VIP_PLAN_USD in index.js). */
export const VIP_PLAN_USD: Record<number, number> = { 1: 49, 3: 139, 6: 249, 12: 399 };
export const VIP_PLANS = [1, 3, 6, 12];
export const vipPriceUsd = (months: number) => VIP_PLAN_USD[months] ?? months * SPECIAL_COLOR_USD;
export const vipPlanLabel = (months: number) => (months === 12 ? "1 year" : `${months} month${months > 1 ? "s" : ""}`);
export const SPECIAL_COLOR_SLOTS = 5;
export const SPECIAL_COLOR_METHODS = ["bKash", "Nagad", "Rocket", "Binance", "PayPal", "Bank", "Other"];
/** Taka per dollar until miglife sets app_settings/special_color.bdtRate. */
export const SPECIAL_COLOR_DEFAULT_BDT_RATE = 123;
/** These are paid in taka; Binance / PayPal / Other in dollars. */
export const SPECIAL_COLOR_TAKA_METHODS = new Set(["bKash", "Nagad", "Rocket", "Bank"]);
export const taka = (usd: number, rate: number) => "৳" + Math.round(usd * rate).toLocaleString("en-US");
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
