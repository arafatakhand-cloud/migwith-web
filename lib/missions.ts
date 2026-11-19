import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// 🎯 Daily Missions (the "dailyMissions" server function). The server counts
// everything; the page only shows it and claims Season Points (SP).

export type Mission = { key: string; emoji: string; title: string; unit: string; target: number; sp: number; progress: number; claimed: boolean };
export type MissionDay = {
  day: string;
  resetAt: number;
  missions: Mission[];
  bonusSp: number;
  bonusClaimed: boolean;
  spToday: number;
  spTotal: number;
};
export type MissionConfig = { missions: { key: string; emoji: string; title: string; unit: string; target: number; sp: number; on: boolean }[]; bonusSp: number };

const call = httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, "dailyMissions");

export const loadMissions = async () => (await call({ action: "today" })).data as unknown as MissionDay;
export const claimMission = async (key: string) => Number(((await call({ action: "claim", key })).data as { gained?: number }).gained || 0);
export const loadMissionConfig = async () => (await call({ action: "config" })).data as unknown as MissionConfig;
export const saveMissionConfig = async (c: MissionConfig) => (await call({ action: "save", missions: c.missions, bonusSp: c.bonusSp })).data as unknown as MissionConfig;
