import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// 🎟 Season Pass (the "seasonPass" server function).
export type Reward = { kind: "coins"; amount: number } | { kind: "fx"; fx: string; days: number } | { kind: "badge"; emoji: string; label: string };
export type SeasonLevel = { free: Reward; gold: Reward };
export type Season = { id: string; name: string; startMs: number; endMs: number; active: boolean; goldPrice: number; spPerLevel: number; levels: SeasonLevel[] };
export type MyPass = { sp: number; level: number; gold: boolean; claimed: Record<string, boolean>; badges: string[] };
export type SeasonData = { season: Season; me: MyPass; manager: boolean };

const call = httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, "seasonPass");
export const loadSeason = async () => (await call({ action: "get" })).data as unknown as SeasonData;
export const claimSeason = async (lane: "free" | "gold", level: number) => ((await call({ action: "claim", lane, level })).data as { reward: Reward }).reward;
export const buyGold = async () => (await call({ action: "buyGold" })).data;
export const saveSeason = async (d: Record<string, unknown>) => (await call({ action: "save", ...d })).data;
export const startSeason = async (d: Record<string, unknown>) => (await call({ action: "start", ...d })).data;

const FX_EMOJI: Record<string, string> = {
  sparkle: "🌟", bubbles: "🫧", sakura: "🌸", snow: "❄️", roses: "🌹", hearts: "💖", confetti: "🎉", disco: "🪩", fire: "🔥",
  thunder: "⚡", money: "💸", diamonds: "💎", royal: "👑", carpet: "🟥", meteor: "☄️", galaxy: "🌌", aurora: "🌈", phoenix: "🐦‍🔥",
  butterfly: "🦋", rainbow: "🌈", neon: "💡", lanterns: "🏮",
};
export const ENTRY_FX_IDS = Object.keys(FX_EMOJI);
export const rewardIcon = (r: Reward) => (r.kind === "coins" ? "🪙" : r.kind === "fx" ? FX_EMOJI[r.fx] || "✨" : r.emoji);
export const rewardLabel = (r: Reward) =>
  r.kind === "coins" ? r.amount.toLocaleString() : r.kind === "fx" ? `${r.fx.charAt(0).toUpperCase()}${r.fx.slice(1)} · ${r.days}d` : r.label;
