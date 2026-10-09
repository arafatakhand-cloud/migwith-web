"use client";

import { useEffect, useState } from "react";

// 📲 "Install miGlife" card on Home (not shown once it runs from the Home
// Screen). Installed, it opens full screen like an app, without the browser's
// address bar. Android / desktop Chrome: the button opens Chrome's own install
// box (the event is caught early in layout.tsx → window.__migInstall); without
// it (other browsers, or Chrome not offering it yet) the button shows the
// ⋮ → "Add to Home screen" steps. iPhone Safari: Share → Add to Home Screen.
// Hidden once closed.

const KEY = "migwith.installHintClosed";

// iPhone: the owner's steps.
const IOS_STEPS = [
  "Open web.miglife.app in Safari. On newer iPhones Chrome works too.",
  "Tap the Share ⬆️ button (at the bottom or top).",
  "Scroll down and tap \"Add to Home Screen\" ➕.",
  "Tap Add (top right).",
  "The miGlife icon appears on your Home screen.",
];

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type InstallWindow = Window & { __migInstall?: InstallPrompt | null };

export function InstallHint() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [tip, setTip] = useState(false);

  useEffect(() => {
    const w = window as InstallWindow;
    try {
      const ua = navigator.userAgent;
      const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      setIos(isIos);
      setShow(!standalone && localStorage.getItem(KEY) !== "1");
    } catch {
      // storage blocked — just don't show it
    }
    setPrompt(w.__migInstall ?? null);
    const onReady = () => setPrompt(w.__migInstall ?? null);
    const onInstalled = () => setShow(false);
    window.addEventListener("mig-install", onReady);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("mig-install", onReady);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;

  const install = async () => {
    if (prompt) {
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice.catch(() => null);
        if (choice?.outcome === "accepted") setShow(false);
      } catch {
        setTip(true);
      }
      // Chrome's install box can be used only once.
      (window as InstallWindow).__migInstall = null;
      setPrompt(null);
    } else setTip((v) => !v);
  };

  return (
    // Always in English (owner's choice), also when বাংলা is picked.
    <div data-notranslate className="mx-3 mt-3 flex items-start gap-3 rounded-2xl border border-[#BFD7F2] bg-white p-3 text-[#0B2A5B] shadow-sm">
      <span className="text-2xl">📲</span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold">Use miGlife like an app</p>
        <p className="mt-0.5 text-xs leading-5 text-[#5B6B8C]">Full screen, no browser bar on top, opens from your Home screen.</p>
        {ios ? (
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-xs leading-5 text-[#35445F]">
            {IOS_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : (
          <>
            <button
              type="button"
              onClick={install}
              className="mt-2 rounded-xl bg-gradient-to-b from-[#FF9D2E] to-[#F07A00] px-4 py-2 text-sm font-bold text-white shadow-sm active:scale-95"
            >
              📲 Install miGlife
            </button>
            {tip && (
              <p className="mt-2 rounded-lg bg-[#F4F9FF] px-3 py-2 text-xs leading-5 text-[#35445F]">
                In Chrome tap <b>⋮</b> (top right), then <b>Add to Home screen</b> or <b>Install app</b> → <b>Install</b>.
              </p>
            )}
          </>
        )}
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={() => {
          setShow(false);
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            // storage blocked
          }
        }}
        className="px-1 text-lg text-[#8A9BBC]"
      >
        ✕
      </button>
    </div>
  );
}
