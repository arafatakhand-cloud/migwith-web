"use client";

import { useEffect, useState } from "react";

// 🤖 Busy rooms with many bots: helpers that keep the chat readable (the app's
// ChatBotStyle.kt).
//  • chatBotKey        — which bot wrote a line (null = a person / room notice)
//  • chatBotAccent     — a soft colour per bot; consecutive lines of the SAME
//                        bot sit on one tinted panel with a coloured stripe
//  • "🤖 Bot messages: Show / Hide" (room ⋮ menu), remembered in this browser
//  • newBelowStats     — "⬇ 2 messages · 5 bot", gold when someone mentions you

const isLetterOrDigit = (ch: string) => /[\p{L}\p{N}]/u.test(ch);
const trimStartNonAlnum = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, "");

/** Which bot wrote [text], or null when a person (or the room itself) wrote it. */
export function chatBotKey(text: string, roomName: string): string | null {
  const colon = text.indexOf(":");
  if (colon <= 0 || colon > 44) return null;
  const sender = text.slice(0, colon).trim();
  if (!sender || sender.length > 40) return null;
  // "Bangladesh: lomi has entered." / "🎴 Teen Patti Official: …" — room notices, not bots
  const room = roomName.trim();
  if (sender.toLowerCase() === room.toLowerCase()) return null;
  if (trimStartNonAlnum(sender).toLowerCase() === trimStartNonAlnum(room).toLowerCase()) return null;
  const end = text.trimEnd().toLowerCase();
  if (end.endsWith(" has entered.") || end.endsWith(" has left.")) return null;
  // "Teen Patti Bot", "Ludo Bot", "LowCard Bot", "Cricket Bot" …
  if (sender.length >= 4 && /bot$/i.test(sender) && sender.includes(" ")) return sender;
  // "🎰 Luxury Bet", "🍀 Lucky Bot" … — people's IDs always start with a letter
  // or digit, so an emoji-first sender is always a bot.
  const first = Array.from(sender)[0] || "";
  if (!isLetterOrDigit(first) && /\p{L}/u.test(sender)) return sender;
  return null;
}

/** True when [text] mentions [me] ("@me" or the plain name in the message body). */
export function chatLineMentionsMe(text: string, me: string): boolean {
  if (!me.trim() || me === "User") return false;
  const i0 = text.indexOf(":");
  const body = (i0 >= 0 ? text.slice(i0 + 1) : text).toLowerCase();
  const name = me.toLowerCase();
  if (body.includes(`@${name}`)) return true;
  let i = body.indexOf(name);
  while (i >= 0) {
    const before = body[i - 1];
    const after = body[i + name.length];
    if ((!before || !isLetterOrDigit(before)) && (!after || !isLetterOrDigit(after))) return true;
    i = body.indexOf(name, i + 1);
  }
  return false;
}

const PALETTE = ["#7C4DFF", "#00A3A3", "#E67E22", "#2E86DE", "#D6336C", "#2FA84F", "#8E5CF5", "#C0392B"];

/** A soft colour per bot, so each bot's block is recognisable at a glance. */
export function chatBotAccent(botKey: string): string {
  let h = 0;
  for (const ch of botKey.toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) | 0;
  return PALETTE[(h & 0x7fffffff) % PALETTE.length];
}

// ---------------------------------------------------------------- show / hide

const KEY = "migwith.hideBots";
const EVENT = "migwith-hide-bots";

function readHideBots(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function toggleHideBots() {
  const next = !readHideBots();
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    // storage blocked
  }
  window.dispatchEvent(new Event(EVENT));
}

/** "🤖 Bot messages: Hide" — one setting for every room, kept in this browser. */
export function useHideBots(): boolean {
  const [hide, setHide] = useState(false);
  useEffect(() => {
    const load = () => setHide(readHideBots());
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);
  return hide;
}

/** Hide this line because of "Bot messages: Hide"? (A line that mentions you never hides.) */
export function chatHideBotLine(hideBots: boolean, text: string, roomName: string, me: string): boolean {
  return hideBots && chatBotKey(text, roomName) !== null && !chatLineMentionsMe(text, me);
}

// ---------------------------------------------------------------- the ⬇ pill

/** What arrived while you were scrolled up. */
export type NewBelowStats = { people: number; bots: number; mention: boolean };
export const NO_NEW_BELOW: NewBelowStats = { people: 0, bots: 0, mention: false };

export function addNewBelow(s: NewBelowStats, lines: string[], roomName: string, me: string): NewBelowStats {
  let { people, bots, mention } = s;
  for (const line of lines) {
    if (chatBotKey(line, roomName) !== null) bots++;
    else people++;
    if (!mention && chatLineMentionsMe(line, me) && !line.toLowerCase().startsWith(`${me.toLowerCase()}:`)) mention = true;
  }
  return { people, bots, mention };
}

export function newBelowLabel(s: NewBelowStats, fallbackCount: number): string {
  const total = s.people + s.bots;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const label =
    total === 0
      ? plural(fallbackCount, "new message")
      : s.people > 0 && s.bots > 0
        ? `${plural(s.people, "message")} · ${s.bots} bot`
        : s.people > 0
          ? plural(s.people, "new message")
          : plural(s.bots, "bot update");
  return s.mention ? `You were mentioned · ${label}` : label;
}
