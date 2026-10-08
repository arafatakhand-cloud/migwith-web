"use client";

import { useEffect, useState } from "react";

// App style, like the app's Settings › Appearance › App style: "modern" (the
// default) or "classic" (orange header, blue tab strip, folder lists, plain
// "name: message" chat lines). Kept in this browser; <html data-ui="classic">
// is set before the page shows (see app/layout.tsx).

export type UiStyle = "modern" | "classic";
const KEY = "migwith.uiStyle";
const EVENT = "migwith-ui-style";

export function getUiStyle(): UiStyle {
  try {
    return localStorage.getItem(KEY) === "classic" ? "classic" : "modern";
  } catch {
    return "modern";
  }
}

export function setUiStyle(id: UiStyle) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // storage blocked
  }
  if (id === "classic") document.documentElement.dataset.ui = "classic";
  else delete document.documentElement.dataset.ui;
  window.dispatchEvent(new Event(EVENT));
}

export function useUiStyle(): UiStyle {
  const [style, setStyle] = useState<UiStyle>("modern");
  useEffect(() => {
    const read = () => setStyle(getUiStyle());
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return style;
}

export function useIsClassic(): boolean {
  return useUiStyle() === "classic";
}

export const CLASSIC = {
  orangeTop: "#FF9D2E",
  orangeBottom: "#F07A00",
  orangeEdge: "#C45F00",
  blueTop: "#5A8FD6",
  blueBottom: "#2F6ABD",
} as const;
