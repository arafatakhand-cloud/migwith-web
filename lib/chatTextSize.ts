"use client";

import { useEffect, useState } from "react";

// Room text size (Settings → Chat), like the app's AppAppearance.chatTextSp:
// 11–22, 14 = normal, saved in this browser. On the web a line is drawn at
// size + 1 px (14 → 15px, the size rooms always had).
const KEY = "migwith.chatTextSize";
const EVENT = "migwith:chatTextSize";
export const CHAT_TEXT_MIN = 11;
export const CHAT_TEXT_MAX = 22;
export const CHAT_TEXT_DEFAULT = 14;

function read(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isInteger(n) && n >= CHAT_TEXT_MIN && n <= CHAT_TEXT_MAX ? n : CHAT_TEXT_DEFAULT;
  } catch {
    return CHAT_TEXT_DEFAULT;
  }
}

export function setChatTextSize(n: number) {
  const v = Math.min(CHAT_TEXT_MAX, Math.max(CHAT_TEXT_MIN, Math.round(n)));
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    // storage blocked
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: v }));
}

/** The chosen size (11–22); follows changes made on the Settings page live. */
export function useChatTextSize(): number {
  const [size, setSize] = useState(CHAT_TEXT_DEFAULT);
  useEffect(() => {
    setSize(read());
    const on = () => setSize(read());
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return size;
}

/** Pixel size of a chat line for the chosen setting. */
export const chatPx = (size: number) => size + 1;
