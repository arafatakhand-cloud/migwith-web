"use client";

import { useEffect, useState } from "react";

// 🎨 Only two themes: Modern Light and Modern Dark (same as the app).
// The person picks Light, Dark or Auto (Auto follows the phone / computer's
// own light / dark setting). Kept in this browser; <html data-theme> is set
// before the page shows (see app/layout.tsx).

export type ThemeMode = "light" | "dark" | "auto";
const KEY = "migwith.themeMode";
const EVENT = "migwith-theme-mode";

export function getThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
    return localStorage.getItem("migwith.theme") === "dark_night" ? "dark" : "auto";
  } catch {
    return "auto";
  }
}

const systemDark = () =>
  typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

export function applyThemeMode(mode: ThemeMode) {
  // ☀️ a page that always shows Light (the Feed) keeps Light while it is open
  const dark = document.documentElement.dataset.forceLight !== "1" && (mode === "dark" || (mode === "auto" && systemDark()));
  document.documentElement.dataset.theme = dark ? "dark_night" : "modern_light";
  // ⚫ the browser bar follows: black in Dark
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#000000" : "#0B1A33");
}

export function setThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // storage blocked
  }
  applyThemeMode(mode);
  window.dispatchEvent(new Event(EVENT));
}

export function useThemeMode(): ThemeMode {
  const [mode, setMode] = useState<ThemeMode>("auto");
  useEffect(() => {
    const read = () => setMode(getThemeMode());
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return mode;
}

/** ☀️ The Feed looks the same in Light and Dark: while it is open the site shows Light. */
export function useForceLight() {
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.forceLight = "1";
    applyThemeMode(getThemeMode());
    return () => {
      delete html.dataset.forceLight;
      applyThemeMode(getThemeMode());
    };
  }, []);
}
