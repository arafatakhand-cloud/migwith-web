import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

// 🎞 Video quality (miglife Secret → Feed Video, app_settings/video_quality.quality),
// the same three choices as the Android app:
//   good     — 720p · ≤2.5 Mbps (heavier than 3.5 Mbps is made lighter)
//   balanced — 720p · ≤1.5 Mbps (heavier than 2.0 Mbps …)
//   light    — 480p · ≤0.8 Mbps (heavier than 1.2 Mbps …)   ← default
export type VideoQualityKey = "good" | "balanced" | "light";
export type VideoQuality = { key: VideoQualityKey; threshold: number; maxBits: number; shortSide: number };

export function qualityFor(key: unknown): VideoQuality {
  if (key === "good") return { key: "good", threshold: 3_500_000, maxBits: 2_500_000, shortSide: 720 };
  if (key === "balanced") return { key: "balanced", threshold: 2_000_000, maxBits: 1_500_000, shortSide: 720 };
  return { key: "light", threshold: 1_200_000, maxBits: 800_000, shortSide: 480 };
}

let cached: { at: number; q: VideoQuality } | null = null;
export async function getVideoQuality(): Promise<VideoQuality> {
  if (cached && Date.now() - cached.at < 2 * 60_000) return cached.q;
  const q = qualityFor(await getDoc(doc(db, "app_settings", "video_quality")).then((s) => s.get("quality")).catch(() => null));
  cached = { at: Date.now(), q };
  return q;
}
export function forgetVideoQuality() {
  cached = null;
}
