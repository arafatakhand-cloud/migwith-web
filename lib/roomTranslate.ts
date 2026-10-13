"use client";

import { useSyncExternalStore } from "react";

// 🌐 ROOM CHAT TRANSLATOR (the app's RoomTranslate.kt) — long-press a room
// message → "🌐 Translate". Free: the BROWSER translates on this device (Chrome's
// built-in Translator + Language Detector; no server, no bill). Each language
// pair is downloaded once by the browser. The result shows in small italic
// text under the message; tap it to hide it again. Browsers without the
// built-in translator say so instead.
// Limits (same as the app): Banglish / Hinglish can't be detected well.

export type RoomTranslation =
  | { kind: "loading" }
  | { kind: "downloading" }
  | { kind: "done"; text: string; from: string }
  | { kind: "failed"; reason: string };

// messageId → translation (lives for this visit; a message is translated once)
let map: Record<string, RoomTranslation> = {};
const subs = new Set<() => void>();
const set = (id: string, v: RoomTranslation | null) => {
  map = { ...map };
  if (v) map[id] = v;
  else delete map[id];
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function useRoomTranslation(id: string): RoomTranslation | null {
  return useSyncExternalStore(
    subscribe,
    () => map[id] || null,
    () => null
  );
}
export const hideRoomTranslation = (id: string) => set(id, null);

/** Translate INTO this browser's language (a Bengali browser → Bengali). */
function targetLang(): string {
  const l = (typeof navigator !== "undefined" ? navigator.language : "en").split("-")[0].toLowerCase();
  return l === "in" ? "id" : l || "en";
}

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

// Common chat shortcuts → words (whole words only), so short English chat
// lines can be detected and translated.
const SLANG: Record<string, string> = {
  wc: "welcome", wlc: "welcome", wlcm: "welcome", gm: "good morning", gn: "good night",
  ge: "good evening", ga: "good afternoon", ty: "thank you", thx: "thanks", tnx: "thanks",
  tq: "thank you", thnx: "thanks", pls: "please", plz: "please", u: "you", ur: "your",
  r: "are", y: "why", k: "okay", ok: "okay", kk: "okay", msg: "message", bro: "brother",
  sis: "sister", frnd: "friend", frnds: "friends", gud: "good", nyc: "nice", luv: "love",
  hru: "how are you", wbu: "what about you", idk: "I don't know", brb: "be right back",
  btw: "by the way", omg: "oh my god", np: "no problem", sry: "sorry", tc: "take care",
  bday: "birthday", hbd: "happy birthday", lol: "laughing", jk: "just kidding", wb: "welcome back",
  cya: "see you", ttyl: "talk to you later", asap: "as soon as possible", dm: "direct message",
  im: "I am", dont: "don't", cant: "can't", wanna: "want to", gonna: "going to",
};
export const expandChatSlang = (text: string) => text.replace(/[A-Za-z]+/g, (w) => SLANG[w.toLowerCase()] ?? w);

// one translator per language pair, reused
const translators = new Map<string, any>();

export async function requestRoomTranslation(id: string, text: string) {
  if (!id || !text.trim()) return;
  const now = map[id];
  if (now && now.kind !== "failed") return;
  const g = globalThis as any;
  if (!g.Translator || !g.LanguageDetector) {
    set(id, { kind: "failed", reason: "Translate needs the latest Chrome on a computer — not available in this browser yet" });
    return;
  }
  set(id, { kind: "loading" });
  const target = targetLang();
  const input = text.slice(0, 1000);
  const expanded = expandChatSlang(input);
  const latinOnly = ![...expanded].some((c) => /\p{L}/u.test(c) && c.codePointAt(0)! > 0x24f);
  try {
    const detector = await g.LanguageDetector.create();
    const list: { detectedLanguage: string; confidence: number }[] = await detector.detect(expanded);
    const best = list.find((x) => x.detectedLanguage !== "und" && !x.detectedLanguage.includes("-") && x.confidence >= 0.35);
    let src = best?.detectedLanguage || null;
    // too short to tell, but plain English letters → most likely English
    if (!src && latinOnly) src = "en";
    if (!src) return set(id, { kind: "failed", reason: "Can't translate this (Banglish / too short)" });
    if (src === target) {
      return set(id, expanded !== input ? { kind: "done", text: expanded, from: src } : { kind: "failed", reason: `Already in ${languageName(target)}` });
    }
    const pair = `${src}>${target}`;
    let tr = translators.get(pair);
    if (!tr) {
      const avail = await g.Translator.availability({ sourceLanguage: src, targetLanguage: target });
      if (avail === "unavailable") return set(id, { kind: "failed", reason: `Can't translate ${languageName(src)} → ${languageName(target)} here` });
      // first time for this language: the browser downloads it, then translates
      if (avail !== "available") set(id, { kind: "downloading" });
      tr = await g.Translator.create({ sourceLanguage: src, targetLanguage: target });
      translators.set(pair, tr);
      set(id, { kind: "loading" });
    }
    const out: string = await tr.translate(expanded);
    set(id, out?.trim() ? { kind: "done", text: out, from: src } : { kind: "failed", reason: "No translation" });
  } catch {
    set(id, { kind: "failed", reason: "Couldn't translate right now" });
  }
}
