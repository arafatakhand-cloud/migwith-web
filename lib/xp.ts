import { collection, doc, runTransaction, serverTimestamp, addDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { levelFromXp } from "./level";
import { badgeForLevel, badgeNameForLevel } from "./rooms";

// XP for normal activity, the same as the app's awardUserXp (MainActivity.kt):
// chat line +2 (15 s), room enter +5 (30 min), gift +5 / gift shower +10 (30 s),
// Luxury Bot bet +3 (15 s). firestore.rules allow at most +10 per award, one
// award every 5 s (lastXpAt = server time), only these reasons, and a level
// that is exactly what the XP earns (or unchanged).

export type XpReason = "chat_message" | "room_enter" | "friend_request" | "gift" | "luxury_bot_bet";

/** At most this much XP per Bangladesh day from normal activity (was 500). */
export const DAILY_XP_CAP = 1500;
/** firestore.rules need 5 s between two awards; queue them a bit further apart. */
const XP_MIN_GAP_MS = 5_500;
const XP_MAX_RETRIES = 2;
let nextXpSlotAt = 0;

function scheduleXpAward(run: () => void) {
  const now = Date.now();
  const at = Math.max(now, nextXpSlotAt);
  nextXpSlotAt = at + XP_MIN_GAP_MS;
  const wait = at - now;
  if (wait <= 0) run();
  else setTimeout(run, wait);
}

// Bangladesh date — the same "today" the server's daily leaderboards use.
export function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  return 0;
}

function unlockedGiftsForLevel(level: number): string[] {
  const out: string[] = [];
  if (level >= 2) out.push("🎁 Starter Gift");
  if (level >= 4) out.push("⭐ Elite Gift");
  if (level >= 6) out.push("🏆 Gold Gift");
  if (level >= 8) out.push("💎 Diamond Gift");
  if (level >= 10) out.push("👑 Legend Gift");
  return out;
}

export function awardUserXp(uid: string | null | undefined, amount: number, reason: XpReason, cooldownMs = 0) {
  if (!uid || amount <= 0) return;
  scheduleXpAward(() => void attempt(uid, Math.min(10, Math.trunc(amount)), reason, cooldownMs, 0));
}

async function attempt(uid: string, amount: number, reason: XpReason, cooldownMs: number, tries: number) {
  const userRef = doc(db, "users", uid);
  try {
    let leveledUp = false;
    const given = await runTransaction(db, async (tx) => {
      leveledUp = false;
      const snap = await tx.get(userRef);
      if (!snap.exists()) return 0;
      const d = snap.data();
      const now = Date.now();

      const cooldowns: Record<string, number> = {};
      const rawCd = d.xpCooldowns;
      if (rawCd && typeof rawCd === "object") for (const [k, v] of Object.entries(rawCd)) cooldowns[k] = num(v);
      const last = cooldowns[reason] ?? 0;
      if (cooldownMs > 0 && last > 0 && now - last < cooldownMs) return 0;

      // xp saved as text on some old accounts counts as 0, like the rules
      const oldXp = typeof d.xp === "number" ? Math.trunc(d.xp) : 0;

      const today = todayKey();
      const dailySoFar = d.dailyXpDate === today ? num(d.dailyXp) : 0;
      const give = Math.min(amount, DAILY_XP_CAP - dailySoFar);
      if (give <= 0) return 0;

      const newXp = oldXp + give;
      // A saved level ABOVE what the XP earns (older curve / set by hand) stays.
      const storedLevel = typeof d.level === "number" ? Math.trunc(d.level) : 1;
      const oldLevel = Math.max(levelFromXp(oldXp), storedLevel);
      const newLevel = Math.max(levelFromXp(newXp), storedLevel);

      const prev: { reason: string; amount: number; timeMillis: number }[] = Array.isArray(d.recentXpActivities)
        ? d.recentXpActivities.filter((x: unknown) => x && typeof x === "object")
        : [];
      const recent = [...prev, { reason, amount: give, timeMillis: now }]
        .sort((a, b) => num(b.timeMillis) - num(a.timeMillis))
        .slice(0, 5);
      cooldowns[reason] = now;

      const update: Record<string, unknown> = {
        xp: newXp,
        level: newLevel,
        levelBadgeIcon: badgeForLevel(newLevel),
        levelBadgeName: badgeNameForLevel(newLevel),
        unlockedGifts: unlockedGiftsForLevel(newLevel),
        xpCooldowns: cooldowns,
        dailyXp: dailySoFar + give,
        dailyXpDate: today,
        dailyXpUpdatedAt: serverTimestamp(),
        recentXpActivities: recent,
        lastXpReason: reason,
        lastXpAt: serverTimestamp(),
      };
      if (newLevel > oldLevel) {
        leveledUp = true;
        update.lastLevelUpLevel = newLevel;
        update.lastLevelUpAt = serverTimestamp();
      }
      tx.set(userRef, update, { merge: true });
      return give;
    });
    // ⭐ a new level → the server sends a "Level up!" alert (once per level;
    // it reads the level from the user doc, never from here)
    if (given > 0 && leveledUp) httpsCallable(functions, "notifyLevelUp")().catch(() => {});
    if (given > 0) {
      // A separate write, so a history problem never undoes the XP.
      addDoc(collection(db, "users", uid, "xp_history"), { amount: given, reason, createdAt: serverTimestamp() }).catch(() => {});
    }
  } catch (err) {
    // Usually "another XP award less than 5 s ago" (this account on another
    // device): try again a little later instead of losing the XP.
    const code = (err as { code?: string })?.code;
    if (code === "permission-denied" && tries < XP_MAX_RETRIES) {
      scheduleXpAward(() => void attempt(uid, amount, reason, cooldownMs, tries + 1));
    } else if (code !== "permission-denied") {
      console.warn("XP award failed", err);
    }
  }
}
