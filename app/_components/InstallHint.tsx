"use client";

import { useEffect, useState } from "react";

// iPhone / iPad in Safari (not yet on the Home Screen): a small card showing
// how to add MIGlife as an app — needed there for notifications, and it opens
// full screen without Safari's bars. Hidden once closed.

const KEY = "migwith.installHintClosed";

export function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const ua = navigator.userAgent;
      const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      setShow(ios && !standalone && localStorage.getItem(KEY) !== "1");
    } catch {
      // storage blocked — just don't show it
    }
  }, []);

  if (!show) return null;
  return (
    <div className="mx-3 mt-3 flex items-start gap-3 rounded-2xl border border-[#BFD7F2] bg-white p-3 text-[#0B2A5B] shadow-sm">
      <span className="text-2xl">📲</span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold">Use MIGlife like an app on iPhone</p>
        <p className="mt-0.5 text-xs leading-5 text-[#5B6B8C]">
          In Safari tap <b>Share</b> <span aria-hidden>⬆️</span>, then <b>Add to Home Screen</b>. Open it from there to get
          notifications and a full screen.
        </p>
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
