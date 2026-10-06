// miglife emotes, the same as the app's Emotes.kt:
//  * every picture has a short code, numbered in picker order inside its group:
//      :c1 Classic  :s1 Smileys  :g1 Green  :l1 Love & Fun  :z1 Animals  :h1 Hands
//      ;f1 Emoji Faces (Google)  ;h1 Emoji Hands (Google)  ;a1 ✨ Animated
//    Codes are not case-sensitive (":C12" = ":c12").
//  * a Google emoji typed from the keyboard (😀, 👍 …) is drawn with its Google
//    picture too (only when it stands alone, not inside 👍🏽 or 😮‍💨).
//  * the 120 classic emoticons (classicEmotes.ts) keep the app's typed codes:
//    ":)", ":D", ":p", ":@", "<3", ":dk" (duck) …

import { ANIMATED_GROUPS, EMOTE_GROUPS, GIF_GROUP, GIF_MOTION, type EmoteGroup, type GifMotion } from "./emoteData";
import { CLASSIC_EMOTES } from "./classicEmotes";

export { ANIMATED_GROUPS, CLASSIC_EMOTES, EMOTE_GROUPS, GIF_GROUP, GIF_MOTION, type EmoteGroup, type GifMotion };

const CODE_PREFIX: Record<string, string> = {
  classic: ":c",
  smileys: ":s",
  green: ":g",
  love: ":l",
  animals: ":z",
  hands: ":h",
  faces: ";f",
  gestures: ";h",
  anim_faces: ";a",
  anim_fun: ";a",
  anim_love: ";a",
  anim_animals: ";a",
  anim_food: ";a",
  anim_party: ";a",
  anim_nature: ";a",
  gif: ";m",
};

/** Emote id -> the code it is sent as (":c12", ";a40" …). */
export const EMOTE_CODES: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  const counters: Record<string, number> = {};
  for (const g of [...EMOTE_GROUPS, ...ANIMATED_GROUPS, GIF_GROUP]) {
    const prefix = CODE_PREFIX[g.key];
    if (!prefix) continue;
    for (const id of g.ids) {
      if (out[id]) continue;
      counters[prefix] = (counters[prefix] || 0) + 1;
      out[id] = prefix + counters[prefix];
    }
  }
  for (const e of CLASSIC_EMOTES) out[e.id] = e.code;
  return out;
})();

export const isAnimated = (id: string) => id.startsWith("mla_");

export const isSprite = (id: string) => id.startsWith("mlg_");

export const emoteSrc = (id: string) =>
  isAnimated(id) ? `/emotes/anim/${id}.json` : isSprite(id) ? `/emotes/gif/${id}.png` : `/emotes/${id}.png`;

// ✌ ☝ ✊ ✋ ✍ are sent with the emoji style marker U+FE0F.
const FE0F = new Set([0x261d, 0x270a, 0x270b, 0x270c, 0x270d]);

/** "mln_1f600" -> "😀" */
export function notoText(id: string): string {
  const cp = parseInt(id.replace(/^mln_/, ""), 16);
  return String.fromCodePoint(cp) + (FE0F.has(cp) ? "️" : "");
}

/** Every typed / sent form (lower-cased codes, emoji) -> emote id. */
const TRIGGERS: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [id, code] of Object.entries(EMOTE_CODES)) m.set(code.toLowerCase(), id);
  for (const g of EMOTE_GROUPS) {
    for (const id of g.ids) {
      if (!id.startsWith("mln_")) continue;
      const t = notoText(id);
      m.set(t, id);
      if (t.endsWith("️")) m.set(t.slice(0, -1), id);
    }
  }
  return m;
})();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Longest first, so ";a12" is tried before ";a1" and ":))" before ":)". Like
// the app's EmoteTriggerRegex: a code that starts or ends with a letter/digit
// only counts when it stands on its own (":dk" not inside "Note:dkim", "x(" not
// inside "max("); ":9" / "<3" not after a digit-letter ("3:9", "x<3"); ":@" not
// in a mention (":@john") and ":$" not in a price ("cost:$5"). An emoji only
// counts when it isn't part of a skin-tone or joined emoji.
const isAlnum = (c: string) => /[A-Za-z0-9]/.test(c);
const TRIGGER_RE: RegExp = (() => {
  const parts = [...TRIGGERS.keys()]
    .sort((a, b) => b.length - a.length)
    .map((t) => {
      if ((t.codePointAt(0) || 0) >= 0x2600) return `(?<!\\u200D)${escapeRe(t)}(?![\\u{1F3FB}-\\u{1F3FF}\\u200D])`;
      const head = isAlnum(t[0]) || (t.length > 1 && (t[0] === ":" || t[0] === "<") && /[0-9]/.test(t[1])) ? "(?<![A-Za-z0-9])" : "";
      const end = t[t.length - 1];
      const tail = isAlnum(end) || end === "@" || end === "$" ? "(?![A-Za-z0-9_])" : "";
      return `${head}${escapeRe(t)}${tail}`;
    });
  return new RegExp(parts.join("|"), "giu");
})();

export type EmotePiece = { text: string } | { emote: string; raw: string };

/** Splits a message into plain text and emotes. */
export function splitEmotes(text: string): EmotePiece[] {
  if (!text) return [];
  const out: EmotePiece[] = [];
  let last = 0;
  TRIGGER_RE.lastIndex = 0;
  for (const m of text.matchAll(TRIGGER_RE)) {
    const raw = m[0];
    const id = TRIGGERS.get(raw.toLowerCase()) ?? TRIGGERS.get(raw);
    if (!id) continue;
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i) });
    out.push({ emote: id, raw });
    last = i + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** ⌫ in the panel: removes the last emote code if the text ends with one, else the last character. */
export function removeLastEmoteOrChar(text: string): string {
  const t = text.trimEnd();
  if (!t) return "";
  const pieces = splitEmotes(t);
  const lastPiece = pieces[pieces.length - 1];
  if (lastPiece && "emote" in lastPiece) return t.slice(0, t.length - lastPiece.raw.length);
  const chars = Array.from(t);
  chars.pop();
  return chars.join("");
}

const RECENT_KEY = "migwith.recentEmotes";

export function readRecentEmotes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!EMOTE_CODES[x]) : [];
  } catch {
    return [];
  }
}

export function rememberEmote(id: string) {
  try {
    const next = [id, ...readRecentEmotes().filter((x) => x !== id)].slice(0, 24);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage blocked
  }
}
