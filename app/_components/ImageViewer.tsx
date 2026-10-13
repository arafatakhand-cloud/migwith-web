"use client";

import { useEffect, useSyncExternalStore } from "react";

// 🖼 Full-screen photo viewer (like the app): a room photo opens over the
// chat, not in a new browser tab. Tap anywhere, ✕ or Esc closes it.

let current: string | null = null;
const subs = new Set<() => void>();
const set = (v: string | null) => {
  current = v;
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export const openImageViewer = (url: string) => set(url);

export function ImageViewerHost() {
  const url = useSyncExternalStore(subscribe, () => current, () => null);
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && set(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url]);
  useEffect(() => () => set(null), []);
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-3" onClick={() => set(null)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Photo" className="max-h-full max-w-full object-contain" />
      <button
        type="button"
        aria-label="Close"
        onClick={() => set(null)}
        className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-xl text-white"
      >
        ✕
      </button>
    </div>
  );
}
