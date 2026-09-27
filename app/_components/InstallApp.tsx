"use client";

import { useEffect, useState } from "react";

// "Install MIGlife" button. Android / desktop Chrome give us a real install
// prompt; iPhone Safari has none, so it shows the Share → Add to Home Screen tip.

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true); // hidden until we know
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!prompt && !ios)) return null;

  return (
    <div className="mt-4 flex w-full max-w-xs flex-col items-center">
      <button
        type="button"
        onClick={async () => {
          if (prompt) {
            await prompt.prompt();
            await prompt.userChoice.catch(() => null);
            setPrompt(null);
          } else {
            setShowTip((v) => !v);
          }
        }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-6 py-3 font-bold text-cyan-200 transition hover:bg-cyan-300/20"
      >
        📲 Install MIGlife on this phone
      </button>
      {showTip && (
        <p className="mt-2 rounded-xl bg-white/5 px-4 py-3 text-center text-sm text-white/75">
          In Safari, tap <span className="font-bold">Share ⬆️</span>, then{" "}
          <span className="font-bold">“Add to Home Screen” ➕</span>.
        </p>
      )}
    </div>
  );
}
