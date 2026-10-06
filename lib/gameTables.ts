"use client";

import { useSyncExternalStore } from "react";

// 🎴 Many tables per game room (Teen Patti, 29, Ludo), like the app. Each
// phone shows only the bot lines of the table it is looking at ("[T2] …");
// "Table N open" announcements stay visible so anyone can join. This small
// store keeps which table each game shows, read by the room's chat list.

type Game = "tp" | "tn" | "ludo";

const viewed: Record<Game, number> = { tp: 0, tn: 0, ludo: 0 };
const hideAll: Record<Game, boolean> = { tp: false, tn: false, ludo: false };
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function setViewedTable(game: Game, table: number) {
  if (viewed[game] === table) return;
  viewed[game] = table;
  emit();
}

/** "Hide game messages" (Teen Patti ⚙ menu, Ludo 💬 / 🙈). */
export function setGameHideMessages(game: Game, on: boolean) {
  if (hideAll[game] === on) return;
  hideAll[game] = on;
  emit();
}

export function setTpHideGameMessages(on: boolean) {
  setGameHideMessages("tp", on);
}

const PREFIX: Record<Game, string> = { tp: "Teen Patti Bot:", tn: "29 Bot:", ludo: "Ludo Bot:" };

function hideForGame(game: Game, text: string): boolean {
  if (!text.startsWith(PREFIX[game])) return false;
  if (hideAll[game]) return true;
  const m = /^[^:]+: \[T(\d+)] /.exec(text);
  if (!m) return false;
  const t = Number(m[1]);
  if (t === viewed[game]) return false;
  return !text.includes(" open — ");
}

/** True = this chat line belongs to another table of the game (or game lines are hidden). */
export function hideGameTableLine(game: Game | null, text: string): boolean {
  return game ? hideForGame(game, text) : false;
}

/** Re-renders the chat list when the shown table (or the hide switch) changes. */
export function useGameTablesVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => 0
  );
}

/** 🎟 A seat at this table is kept for me (someone invited me while it takes seats). */
export function gameInvitedMe(data: Record<string, any> | undefined, uid: string | undefined, running: boolean): boolean {
  if (!data || !uid || !running || data.phase !== "JOINING") return false;
  const e = data.invited && typeof data.invited === "object" ? data.invited[uid] : null;
  if (!e || typeof e !== "object") return false;
  return Number(e.round) === Number(data.roundNumber || 0);
}
