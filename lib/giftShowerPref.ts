"use client";

import { useEffect, useState } from "react";

// 🎁 "Hide Gift Showers" (room ⋮ menu): a Gift Shower line is not shown in this
// browser's chat. One setting for every room, kept in this browser only.
// The gift itself still happens — only the line is hidden.

const KEY = "migwith.hideGiftShower";
const EVENT = "migwith-hide-gift-shower";

function readHideGiftShower(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function toggleHideGiftShower() {
  const next = !readHideGiftShower();
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    // storage blocked
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useHideGiftShower(): boolean {
  const [hide, setHide] = useState(false);
  useEffect(() => {
    const load = () => setHide(readHideGiftShower());
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

/** Is this chat line a Gift Shower line (the one the sender's shower posts)? */
export function isGiftShowerLine(text: string): boolean {
  return text.includes("GIFT SHOWER");
}
