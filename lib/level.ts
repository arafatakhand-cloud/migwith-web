// Level / XP maths, the same as the app (MainActivity.kt: xpRequiredForNextLevel,
// totalXpForLevel, levelProgress).

function xpRequiredForNextLevel(level: number): number {
  const l = Math.max(1, level);
  if (l <= 10) return 50;
  if (l <= 30) return 75 + (l - 11) * 5;
  if (l <= 40) return 180 + (l - 31) * 10;
  // v2 curve: harder after level 40 (same as the app and firestore.rules).
  if (l <= 60) return 500 + (l - 41) * 30;
  if (l <= 100) return 1500 + (l - 61) * 50;
  if (l <= 200) return 4000 + (l - 101) * 100;
  return 14000 + (l - 201) * 150;
}

export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.max(1, level); l++) total += xpRequiredForNextLevel(l);
  return total;
}

/** 0..1 progress from the start of `level` to the next one. */
export function levelProgress(xp: number, level: number): number {
  const start = totalXpForLevel(level);
  const next = totalXpForLevel(level + 1);
  if (next <= start) return 0;
  return Math.min(1, Math.max(0, (xp - start) / (next - start)));
}

/** The level an amount of XP earns (one pass up the curve, like the app). */
export function levelFromXp(xp: number): number {
  const safe = Math.max(0, xp);
  let level = 1;
  let total = 0;
  while (level < 100000) {
    const next = total + xpRequiredForNextLevel(level);
    if (next > safe) break;
    total = next;
    level++;
  }
  return level;
}
